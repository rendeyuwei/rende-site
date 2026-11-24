import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import esbuild from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");
const CSS_TOKEN = "__RF_SHELL_CSS__";
const PINNED = /^(lang|topbar)\.([0-9a-f]{64})\.(js|css)$/;

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

const writeBoth = async (name, bytes) => {
  await writeFile(path.join(dist, "shell", name), bytes);
  await writeFile(path.join(pub, "shell", name), bytes);
};

await writeBoth(cssName, cssBytes);
await writeBoth(langName, langBytes);
await writeBoth(topbarName, topbarBytes);
await writeFile(langFile, langBytes);
await writeFile(topbarFile, topbarBytes);
await writeFile(path.join(dist, "shell/topbar.css"), cssBytes);

const names = (await readdir(path.join(pub, "shell"))).filter((name) => PINNED.test(name)).sort();
const retain = [];
for (const name of names) {
  const bytes = await readFile(path.join(pub, "shell", name));
  const match = PINNED.exec(name);
  const hash = sha256(bytes);
  if (!match || hash !== match[2]) throw new Error(`pinned shell file does not match its name: ${name}`);
  await writeFile(path.join(dist, "shell", name), bytes);
  retain.push({ path: `/shell/${name}`, sha256: hash, bytes: bytes.length });
}

const current = {
  lang: { path: `/shell/${langName}`, sha256: langHash, bytes: langBytes.length },
  topbar: { path: `/shell/${topbarName}`, sha256: topbarHash, bytes: topbarBytes.length },
  css: { path: `/shell/${cssName}`, sha256: cssHash, bytes: cssBytes.length },
};
for (const item of Object.values(current)) {
  if (!retain.some((pinned) => pinned.path === item.path && pinned.sha256 === item.sha256)) {
    throw new Error(`current shell file is not pinned: ${item.path}`);
  }
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("shell manifest needs the git commit");
const manifest = { algorithm: "sha256", commit, current, retain };
await writeFile(path.join(dist, "shell/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

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
];

for (const rel of required) {
  const file = path.join(dist, rel);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`missing build output: ${rel}`);
}

console.log(`copied static files into ${dist}`);
