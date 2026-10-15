import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");

await mkdir(dist, { recursive: true });
await cp(pub, dist, { recursive: true });

const required = [
  "index.html",
  "site.css",
  "favicon.svg",
  "apple-touch-icon.png",
  "motion.js",
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
