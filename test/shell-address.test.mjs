import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");
const named = /^(lang|topbar)\.([0-9a-f]{64})\.(js|css)$/;

function readBytes(file) {
  return readFileSync(file);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("content-addressed shell", { concurrency: 1 }, () => {
  it("names the served bytes with their sha256 and points HTML at that file", () => {
    const manifest = JSON.parse(readFileSync(path.join(dist, "shell/manifest.json"), "utf8"));
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    assert.equal(manifest.algorithm, "sha256");
    assert.equal(manifest.commit, head.stdout.trim());
    assert.equal(manifest.v, undefined);
    for (const key of ["lang", "topbar", "css"]) {
      const item = manifest.current[key];
      const bytes = readBytes(path.join(dist, item.path.slice(1)));
      const hash = sha256(bytes);
      const base = key === "css" ? "topbar" : key;
      const ext = key === "css" ? "css" : "js";
      assert.equal(item.sha256, hash, key);
      assert.equal(item.bytes, bytes.length, key);
      assert.equal(item.path, `/shell/${base}.${hash}.${ext}`);
      assert.ok(readBytes(path.join(pub, "shell", `${base}.${hash}.${ext}`)).equals(bytes), key);
    }
    for (const rel of ["index.html", "en/index.html"]) {
      const html = readFileSync(path.join(dist, rel), "utf8");
      assert.match(html, new RegExp(`src="${manifest.current.topbar.path}"`));
      assert.doesNotMatch(html, /src="\/shell\/topbar\.js"/);
      assert.doesNotMatch(html, /[?&](?:v|version)=/);
    }
    assert.ok(readBytes(path.join(dist, "shell/topbar.js")).equals(readBytes(path.join(dist, manifest.current.topbar.path.slice(1)))));
    assert.ok(readBytes(path.join(dist, "shell/lang.js")).equals(readBytes(path.join(dist, manifest.current.lang.path.slice(1)))));
    assert.ok(readBytes(path.join(dist, "shell/topbar.css")).equals(readBytes(path.join(dist, manifest.current.css.path.slice(1)))));
    assert.match(readFileSync(path.join(dist, "shell/lang.js"), "utf8"), /V=2/);
    assert.ok(readFileSync(path.join(dist, "shell/topbar.js"), "utf8").includes(`topbar.${manifest.current.css.sha256}.css`));
  });

  it("keeps an older pinned file in a fresh publish", () => {
    const oct = readBytes(path.join(root, "test/fixtures/topbar-2026-10-22.js"));
    const hash = sha256(oct);
    const name = `topbar.${hash}.js`;
    assert.equal(hash, "2a719becb9f59f04ea528caf4be7327f3caf7157473e13f77544af62dbfa3ccb");
    assert.ok(readBytes(path.join(pub, "shell", name)).equals(oct));
    const published = path.join(dist, "shell", name);
    rmSync(published, { force: true });
    const again = spawnSync("node", ["scripts/copy-static.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(again.status, 0, again.stderr);
    assert.ok(readBytes(published).equals(oct));
    const manifest = JSON.parse(readFileSync(path.join(dist, "shell/manifest.json"), "utf8"));
    assert.ok(manifest.retain.some((item) => item.path === `/shell/${name}` && item.sha256 === hash && item.bytes === oct.length));
    const html = readFileSync(path.join(dist, "en/index.html"), "utf8");
    assert.equal(html.includes(name), false);
    assert.match(html, new RegExp(`src="${manifest.current.topbar.path}"`));
    for (const item of manifest.retain) {
      const file = path.join(dist, item.path.slice(1));
      assert.equal(existsSync(file), true, item.path);
      assert.equal(sha256(readBytes(file)), item.sha256, item.path);
      assert.match(path.basename(item.path), named);
    }
  });

  it("does not leave unpublished shell bytes after a build", () => {
    const status = spawnSync("git", ["status", "--porcelain", "--", "public/shell"], { cwd: root, encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");
  });

  it("documents immutable hashed URLs and no-cache legacy URLs", () => {
    const nginx = readFileSync(path.join(root, "deploy/nginx-shell-cache.conf"), "utf8");
    assert.match(nginx, /location = \/shell\/topbar\.js \{[^}]*Cache-Control "no-cache"/s);
    assert.match(nginx, /location = \/shell\/lang\.js \{[^}]*Cache-Control "no-cache"/s);
    assert.match(nginx, /location = \/shell\/topbar\.css \{[^}]*Cache-Control "no-cache"/s);
    assert.match(nginx, /location = \/shell\/manifest\.json \{[^}]*Cache-Control "no-cache"/s);
    assert.match(nginx, /\^\/shell\/\(lang\|topbar\)\\\.\[0-9a-f\]\{64\}\\\.\(js\|css\)\$/);
    assert.match(nginx, /max-age=31536000, immutable/);
    assert.doesNotMatch(nginx, /location = \/shell\/topbar\.js \{[^}]*immutable/s);
    assert.match(nginx, /location = \/ \{[^}]*Cache-Control "no-cache"/s);
    assert.match(nginx, /location = \/en\/ \{[^}]*Cache-Control "no-cache"/s);
  });
});
