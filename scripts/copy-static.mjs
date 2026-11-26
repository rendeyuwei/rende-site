import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, link, lstat, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import esbuild from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");
const CSS_TOKEN = "__RF_SHELL_CSS__";
const PINNED = /^(lang|topbar)\.[0-9a-f]{64}\.(js|css)$/;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Drop whitespace only. Names stay, and the combined top bar stays under 12_000 bytes.
const pack = async (source) => {
  const packed = await esbuild.transform(source, {
    minifyWhitespace: true,
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
  });
  return packed.code.trim();
};

const publishOne = async (dest, bytes) => {
  try {
    const info = await lstat(dest);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`refusing to replace ${dest}`);
    const existing = await readFile(dest);
    if (existing.equals(bytes)) return;
    throw new Error(`refusing to overwrite ${dest}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const tmp = `${dest}.${process.pid}.tmp`;
  const handle = await open(tmp, "w", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(tmp, dest);
  } catch (error) {
    const raced = error.code === "EEXIST" ? await readFile(dest) : null;
    await unlink(tmp);
    if (raced?.equals(bytes)) return;
    if (raced) throw new Error(`refusing to overwrite ${dest}`);
    throw error;
  }
  await unlink(tmp);
  const verified = await readFile(dest);
  if (!verified.equals(bytes)) throw new Error(`shared shell bytes changed: ${dest}`);
};

const publishShared = async (files) => {
  const configured = process.env.RF_SHELL_SHARED;
  if (!configured) return;
  if (!path.isAbsolute(configured) || path.resolve(configured) === path.parse(configured).root) {
    throw new Error("RF_SHELL_SHARED must be an absolute directory");
  }
  const dir = path.resolve(configured);
  let info;
  try {
    info = await lstat(dir);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`RF_SHELL_SHARED is missing: ${dir}`);
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`RF_SHELL_SHARED must be a real directory: ${dir}`);
  for (const file of files) {
    if (!PINNED.test(file.name)) throw new Error(`refusing shared shell name: ${file.name}`);
    const dest = path.join(dir, file.name);
    if (path.dirname(dest) !== dir) throw new Error(`refusing shared shell path: ${file.name}`);
    await publishOne(dest, file.bytes);
  }
};

await mkdir(dist, { recursive: true });
await cp(pub, dist, { recursive: true });

const langFile = path.join(dist, "shell/lang.js");
const topbarFile = path.join(dist, "shell/topbar.js");
const langSource = await readFile(langFile, "utf8");
const topbarSource = await readFile(topbarFile, "utf8");
const cssBytes = await readFile(path.join(pub, "shell/topbar.css"));
const cssHash = sha256(cssBytes);
const cssName = `topbar.${cssHash}.css`;

const lang = await pack(langSource);
const topbarBody = topbarSource.startsWith(langSource.trim()) ? topbarSource.slice(langSource.trim().length) : topbarSource;
let withCss = topbarBody;
if (withCss.includes(CSS_TOKEN)) withCss = withCss.replaceAll(CSS_TOKEN, cssName);
else if (!withCss.includes(cssName)) throw new Error("shell/topbar.js is missing the css filename token");
const topbar = await pack(withCss);
if (/<\/script|<script|<!--/i.test(lang)) throw new Error("shell/lang.js cannot be inlined: it contains <script, </script, or <!--");

const langBytes = Buffer.from(lang);
const topbarBytes = Buffer.from(`${lang}\n${topbar}`);
const langHash = sha256(langBytes);
const topbarHash = sha256(topbarBytes);
const langName = `lang.${langHash}.js`;
const topbarName = `topbar.${topbarHash}.js`;
const shellDir = path.join(dist, "shell");

await writeFile(path.join(shellDir, cssName), cssBytes);
await writeFile(path.join(shellDir, langName), langBytes);
await writeFile(path.join(shellDir, topbarName), topbarBytes);
await writeFile(langFile, langBytes);
await writeFile(topbarFile, topbarBytes);
await writeFile(path.join(shellDir, "topbar.css"), cssBytes);

const current = {
  lang: { path: `/shell/${langName}`, sha256: langHash, bytes: langBytes.length },
  topbar: { path: `/shell/${topbarName}`, sha256: topbarHash, bytes: topbarBytes.length },
  css: { path: `/shell/${cssName}`, sha256: cssHash, bytes: cssBytes.length },
};
const manifest = { algorithm: "sha256", current };
if (existsSync(path.join(root, ".git"))) {
  try {
    const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (/^[0-9a-f]{40}$/.test(commit)) manifest.commit = commit;
  } catch {
    // The deploy receiver extracts a git archive and has no repository metadata.
  }
}
await writeFile(path.join(shellDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const ENTER_TAG = '<script data-rf-enter src="/shell/lang.js"></script>';
const indexFile = path.join(dist, "index.html");
const index = await readFile(indexFile, "utf8");
if (!index.includes(ENTER_TAG)) throw new Error(`index.html is missing ${ENTER_TAG}`);
await writeFile(indexFile, index.replace(ENTER_TAG, () => `<script data-rf-enter>${lang}</script>`));

const srcToken = 'src="/shell/topbar.js"';
const srcNext = `src="${current.topbar.path}"`;
for (const rel of ["index.html", "en/index.html"]) {
  const file = path.join(dist, rel);
  let html = await readFile(file, "utf8");
  if (html.includes(srcToken)) html = html.replaceAll(srcToken, srcNext);
  html = html.replace(/src="\/shell\/topbar\.[0-9a-f]{64}\.js"/g, srcNext);
  if (!html.includes(srcNext)) throw new Error(`${rel} does not reference ${current.topbar.path}`);
  await writeFile(file, html);
}

await publishShared([
  { name: langName, bytes: langBytes },
  { name: topbarName, bytes: topbarBytes },
  { name: cssName, bytes: cssBytes },
]);

const required = [
  "index.html",
  "en/index.html",
  "site.css",
  "favicon.svg",
  "apple-touch-icon.png",
  "motion.js",
  "shell/lang.js",
  "shell/topbar.js",
  "shell/topbar.css",
  "shell/manifest.json",
  `shell/${langName}`,
  `shell/${topbarName}`,
  `shell/${cssName}`,
  "assets/me.jpg",
  "assets/me-560.jpg",
  "assets/tipwink-icon.png",
  "assets/cursor-paperCat.png",
];

for (const rel of required) {
  const file = path.join(dist, rel);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`missing build output: ${rel}`);
}

console.log(`copied static files into ${dist}`);
