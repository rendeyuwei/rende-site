import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import esbuild from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");

await mkdir(dist, { recursive: true });
await cp(pub, dist, { recursive: true });

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

const langFile = path.join(dist, "shell/lang.js");
const topbarFile = path.join(dist, "shell/topbar.js");
const langSource = await readFile(langFile, "utf8");
const topbarSource = await readFile(topbarFile, "utf8");
const lang = await pack(langSource);
const topbarBody = topbarSource.startsWith(langSource.trim())
  ? topbarSource.slice(langSource.trim().length)
  : topbarSource;
const topbar = await pack(topbarBody);
if (/<\/script|<script|<!--/i.test(lang)) throw new Error("shell/lang.js cannot be inlined: it contains <script, </script, or <!--");
await writeFile(langFile, lang);
await writeFile(topbarFile, `${lang}\n${topbar}`);

// Inline the language decision so it runs before the first paint.
const ENTER_TAG = '<script data-rf-enter src="/shell/lang.js"></script>';
const indexFile = path.join(dist, "index.html");
const index = await readFile(indexFile, "utf8");
if (!index.includes(ENTER_TAG)) throw new Error(`index.html is missing ${ENTER_TAG}`);
await writeFile(indexFile, index.replace(ENTER_TAG, () => `<script data-rf-enter>${lang}</script>`));

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
  "assets/me.jpg",
  "assets/me-560.jpg",
];

for (const rel of required) {
  const file = path.join(dist, rel);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`missing build output: ${rel}`);
  }
}

console.log(`copied static files into ${dist}`);
