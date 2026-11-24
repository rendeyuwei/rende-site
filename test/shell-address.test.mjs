import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const pub = path.join(root, "public");

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
      assert.equal(existsSync(path.join(pub, "shell", `${base}.${hash}.${ext}`)), false, key);
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

  it("copies hashed files into RF_SHELL_SHARED and refuses to change them", () => {
    const work = mkdtempSync(path.join(tmpdir(), "rf-shared-"));
    const shared = path.join(work, "shell");
    mkdirSync(shared);
    const run = (extra = {}) =>
      spawnSync("node", ["scripts/copy-static.mjs"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...extra, RF_SHELL_SHARED: shared },
      });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const manifest = JSON.parse(readFileSync(path.join(dist, "shell/manifest.json"), "utf8"));
    assert.equal(manifest.retain, undefined);
    const name = path.basename(manifest.current.topbar.path);
    const published = path.join(shared, name);
    const bytes = readBytes(published);
    assert.ok(bytes.equals(readBytes(path.join(dist, manifest.current.topbar.path.slice(1)))));
    assert.equal(sha256(bytes), manifest.current.topbar.sha256);
    const stamped = statSync(published).mtimeMs;
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(statSync(published).mtimeMs, stamped);
    writeFileSync(published, Buffer.from("different-bytes"));
    const refused = run();
    assert.notEqual(refused.status, 0);
    assert.equal(readFileSync(published, "utf8"), "different-bytes");
    rmSync(published);
    const link = path.join(shared, name);
    symlinkSync("/tmp", link);
    const linked = run();
    assert.notEqual(linked.status, 0);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    const viaLink = path.join(work, "via-link");
    symlinkSync(shared, viaLink);
    const followed = spawnSync("node", ["scripts/copy-static.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, RF_SHELL_SHARED: viaLink },
    });
    assert.notEqual(followed.status, 0);
    const relative = spawnSync("node", ["scripts/copy-static.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, RF_SHELL_SHARED: "shell" },
    });
    assert.notEqual(relative.status, 0);
    const missing = spawnSync("node", ["scripts/copy-static.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, RF_SHELL_SHARED: path.join(work, "absent") },
    });
    assert.notEqual(missing.status, 0);
    rmSync(work, { recursive: true, force: true });
    const restored = spawnSync("node", ["scripts/copy-static.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
  });

  it("does not leave unpublished shell bytes after a build", () => {
    const status = spawnSync("git", ["status", "--porcelain", "--", "public/shell"], { cwd: root, encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");
  });

  it("passes nginx -t with the shipped shell locations", () => {
    const work = mkdtempSync(path.join(tmpdir(), "rf-nginx-"));
    for (const name of ["body", "proxy", "fastcgi", "uwsgi", "scgi", "logs"]) mkdirSync(path.join(work, name));
    const conf = path.join(work, "nginx.conf");
    writeFileSync(
      conf,
      `worker_processes 1;
error_log ${work}/logs/error.log;
pid ${work}/nginx.pid;
events { worker_connections 64; }
http {
  access_log off;
  client_body_temp_path ${work}/body;
  proxy_temp_path ${work}/proxy;
  fastcgi_temp_path ${work}/fastcgi;
  uwsgi_temp_path ${work}/uwsgi;
  scgi_temp_path ${work}/scgi;
  server {
    listen 127.0.0.1:8097;
    include ${path.join(root, "deploy/nginx-shell-cache.conf")};
  }
}
`,
    );
    const checked = spawnSync("nginx", ["-t", "-c", conf], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    rmSync(work, { recursive: true, force: true });
  });
});
