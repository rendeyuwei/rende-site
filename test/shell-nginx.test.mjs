import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "..");
const snippet = readFileSync(path.join(root, "deploy/nginx-shell-cache.conf"), "utf8");

function chromePath() {
  const found = [process.env.CHROME_PATH, "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!found) throw new Error("Chrome is not installed");
  return found;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function startNginx({ port, current, sharedParent, extra = "" }) {
  const work = mkdtempSync(path.join(tmpdir(), "rf-ngx-"));
  for (const name of ["body", "proxy", "fastcgi", "uwsgi", "scgi", "logs"]) mkdirSync(path.join(work, name));
  const locations = snippet.replaceAll("/opt/site/current", current).replaceAll("/opt/site/shared", sharedParent);
  const conf = path.join(work, "nginx.conf");
  writeFileSync(
    conf,
    `worker_processes 1;
error_log ${work}/logs/error.log;
pid ${work}/nginx.pid;
events { worker_connections 64; }
http {
  include /etc/nginx/mime.types;
  access_log off;
  client_body_temp_path ${work}/body;
  proxy_temp_path ${work}/proxy;
  fastcgi_temp_path ${work}/fastcgi;
  uwsgi_temp_path ${work}/uwsgi;
  scgi_temp_path ${work}/scgi;
  server {
    listen 127.0.0.1:${port};
    ${locations}
    ${extra}
  }
}
`,
  );
  const checked = spawnSync("nginx", ["-t", "-c", conf], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  const started = spawnSync("nginx", ["-c", conf], { encoding: "utf8" });
  assert.equal(started.status, 0, started.stderr);
  return {
    stop() {
      spawnSync("nginx", ["-c", conf, "-s", "stop"]);
      rmSync(work, { recursive: true, force: true });
    },
  };
}

function headers(url) {
  const response = spawnSync("curl", ["-sS", "-D", "-", "-o", "/tmp/rf-nginx-body", url], { encoding: "utf8" });
  assert.equal(response.status, 0, response.stderr);
  const [head, body] = [response.stdout, readFileSync("/tmp/rf-nginx-body")];
  const status = Number(head.match(/^HTTP\/\d(?:\.\d)? (\d+)/)?.[1]);
  const cache = head.match(/^cache-control:\s*(.+)$/im)?.[1]?.trim() ?? "";
  return { status, cache, body };
}

describe("nginx shell cache", { concurrency: 1, timeout: 60_000 }, () => {
  it("stores a successful hash and does not store a missing one", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "rf-origin-"));
    const current = path.join(work, "current");
    const sharedParent = path.join(work, "shared");
    mkdirSync(path.join(current, "dist/shell"), { recursive: true });
    mkdirSync(path.join(sharedParent, "shell"), { recursive: true });
    const bytes = Buffer.from("published-shell");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = `topbar.${hash}.js`;
    const port = await freePort();
    const nginx = startNginx({ port, current, sharedParent });
    const url = `http://127.0.0.1:${port}/shell/${name}`;
    try {
      const missing = headers(url);
      assert.equal(missing.status, 404);
      assert.equal(missing.cache, "no-store");
      writeFileSync(path.join(sharedParent, "shell", name), bytes);
      const published = headers(url);
      assert.equal(published.status, 200);
      assert.equal(published.cache, "public, max-age=31536000, immutable");
      assert.ok(published.body.equals(bytes));
    } finally {
      nginx.stop();
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("uses one browser profile for a missing hash and the same hash after it is published", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "rf-origin-"));
    const profile = mkdtempSync(path.join(tmpdir(), "rf-profile-"));
    const current = path.join(work, "current");
    const sharedParent = path.join(work, "shared");
    mkdirSync(path.join(current, "dist/shell"), { recursive: true });
    mkdirSync(path.join(sharedParent, "shell"), { recursive: true });
    const bytes = readFileSync(path.join(root, "dist/shell/topbar.js"));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = `topbar.${hash}.js`;
    const port = await freePort();
    const nginx = startNginx({ port, current, sharedParent });
    const url = `http://127.0.0.1:${port}/shell/${name}`;
    const browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      userDataDir: profile,
      args: ["--no-sandbox", "--disable-dev-shm-usage", `--disk-cache-dir=${profile}/cache`, "--disk-cache-size=67108864"],
    });
    try {
      const page = await browser.newPage();
      const first = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      assert.equal(first.status(), 404);
      assert.equal(first.fromCache(), false);
      writeFileSync(path.join(sharedParent, "shell", name), bytes);
      const second = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      assert.equal(second.status(), 200, "the profile reused the missing response");
      assert.equal(second.fromCache(), false);
      assert.equal(createHash("sha256").update(await second.buffer()).digest("hex"), hash);
    } finally {
      await browser.close();
      nginx.stop();
      rmSync(work, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    }
  });
});
