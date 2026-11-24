import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import puppeteer from "puppeteer-core";

const site = path.resolve(import.meta.dirname, "..");
const prefeature = "39447692216a4c343ab5aabdcdba380031d65eaa";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function receiverScript() {
  const dir = "/tmp/rende-deploy-ro";
  const script = path.join(dir, "server/receive-deploy.sh");
  if (!existsSync(script)) {
    rmSync(dir, { recursive: true, force: true });
    run("git", ["clone", "--depth", "1", "https://github.com/rendeyuwei/rende-deploy.git", dir]);
  }
  return script;
}

function checksums(dir) {
  const found = new Map();
  for (const name of readdirSync(dir)) {
    if (!/^(lang|topbar)\.[0-9a-f]{64}\.(js|css)$/.test(name)) continue;
    const bytes = readFileSync(path.join(dir, name));
    found.set(name, sha256(bytes));
    assert.equal(sha256(bytes), name.split(".")[1]);
  }
  return found;
}

function sameMaps(left, right) {
  assert.equal(left.size, right.size);
  for (const [name, hash] of left) assert.equal(right.get(name), hash, name);
}

describe("receiver and shared shell", { timeout: 300_000 }, () => {
  it("serves a synthetic consumer of hash B after current returns to A and to the pre-hash release", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "rf-rel-"));
    const repo = path.join(work, "repo");
    const proj = path.join(work, "opt");
    const shared = path.join(work, "shared", "shell");
    const cfgDir = path.join(work, "cfg");
    mkdirSync(shared, { recursive: true });
    mkdirSync(proj, { recursive: true });
    mkdirSync(cfgDir, { recursive: true });
    run("git", ["init", "-q", "-b", "main", repo]);
    run("git", ["-C", repo, "config", "user.email", "test@example.com"]);
    run("git", ["-C", repo, "config", "user.name", "test"]);

    const commitTree = (message, fill) => {
      run("bash", ["-lc", `find ${JSON.stringify(repo)} -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +`]);
      fill();
      run("git", ["-C", repo, "add", "-A"]);
      run("git", ["-C", repo, "commit", "-q", "-m", message]);
      return run("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    };
    const present = spawnSync("git", ["-C", site, "cat-file", "-e", `${prefeature}^{commit}`]);
    if (present.status !== 0) run("git", ["-C", site, "fetch", "--depth", "1", "origin", prefeature]);
    const shaP = commitTree("P", () => {
      const archived = spawnSync("git", ["-C", site, "archive", prefeature], {});
      assert.equal(archived.status, 0, archived.stderr?.toString());
      const unpacked = spawnSync("tar", ["-x", "-C", repo], { input: archived.stdout });
      assert.equal(unpacked.status, 0, unpacked.stderr?.toString());
    });
    const shaA = commitTree("A", () => {
      cpSync(site, repo, {
        recursive: true,
        filter(source) {
          const relative = path.relative(site, source);
          if (!relative) return true;
          const top = relative.split(path.sep)[0];
          return top !== ".git" && top !== "node_modules" && top !== "dist";
        },
      });
    });
    const rebuildB = () => {
      run("bash", ["-lc", `find ${JSON.stringify(repo)} -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +`]);
      run("git", ["-C", repo, "checkout", shaA, "--", "."]);
      const css = path.join(repo, "public/shell/topbar.css");
      writeFileSync(css, `${readFileSync(css, "utf8")}\n/* release-b */\n`);
      run("git", ["-C", repo, "add", "-A"]);
      run("git", ["-C", repo, "commit", "-q", "-m", "B"]);
      return run("git", ["-C", repo, "rev-parse", "HEAD"]).stdout.trim();
    };
    const realB = rebuildB();

    const build = `export RF_SHELL_SHARED=${shared} && npm ci && npm run build`;
    const conf = path.join(cfgDir, "site.conf");
    writeFileSync(
      conf,
      [
        `root=${proj}`,
        `repo_url=file://${repo}`,
        "service=none",
        `build=${build}`,
        "publish_subdir=dist",
        "keep=2",
        "min_interval=0",
        "health_attempts=2",
        "health_timeout=1",
        "health_file=dist/index.html",
        "",
      ].join("\n"),
    );
    chmodSync(conf, 0o644);
    const receiver = receiverScript();
    const deploy = (sha) => {
      const npmFile = spawnSync("bash", ["-c", "command -v npm"], { encoding: "utf8" }).stdout.trim();
      assert.match(npmFile, /^\//);
      const env = {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG,
        RENDE_DEPLOY_TEST: "1",
        RENDE_DEPLOY_CONFIG_DIR: cfgDir,
        RENDE_DEPLOY_TEST_PATH: path.dirname(npmFile),
      };
      delete env.SSH_CONNECTION;
      delete env.SSH_ORIGINAL_COMMAND;
      return spawnSync(receiver, ["deploy", "site", sha], { encoding: "utf8", env });
    };
    const deployed = (sha) => {
      const result = deploy(sha);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Deployed site ${sha}`));
    };

    deployed(shaP);
    assert.equal(readdirSync(shared).length, 0);
    deployed(shaA);
    deployed(realB);
    const pinned = checksums(shared);
    assert.ok(pinned.size >= 3);
    const currentB = run("readlink", ["-f", path.join(proj, "current")]).stdout.trim();
    const manifestB = JSON.parse(readFileSync(path.join(currentB, "dist/shell/manifest.json"), "utf8"));
    const topbarUrlPath = manifestB.current.topbar.path;
    const cssUrlPath = manifestB.current.css.path;
    assert.equal(pinned.get(path.basename(topbarUrlPath)), manifestB.current.topbar.sha256);

    const releaseNames = readdirSync(path.join(proj, "releases"));
    assert.equal(releaseNames.some((name) => name.startsWith(shaP)), false);

    const port = await freePort();
    const pageRoot = path.join(work, "pages");
    const pageFile = path.join(pageRoot, "synthetic/en/index.html");
    mkdirSync(path.dirname(pageFile), { recursive: true });
    writeFileSync(
      pageFile,
      `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="rf-mount" content="/synthetic/">
<link rel="alternate" hreflang="zh-CN" href="/synthetic/">
<link rel="alternate" hreflang="en" href="/synthetic/en/">
<link rel="alternate" hreflang="x-default" href="/synthetic/en/">
<title>synthetic</title></head><body>
<p id="page">synthetic consumer</p>
<input id="draft" value="keep-me">
<script src="${topbarUrlPath}" defer data-tool="easypic"></script>
</body></html>`,
    );
    const nginxWork = path.join(work, "nginx");
    for (const name of ["body", "proxy", "fastcgi", "uwsgi", "scgi", "logs"]) mkdirSync(path.join(nginxWork, name), { recursive: true });
    const locations = readFileSync(path.join(site, "deploy/nginx-shell-cache.conf"), "utf8")
      .replaceAll("/opt/site/current", path.join(proj, "current"))
      .replaceAll("/opt/site/shared", path.join(work, "shared"));
    const nginxConf = path.join(nginxWork, "nginx.conf");
    writeFileSync(
      nginxConf,
      `worker_processes 1;
error_log ${nginxWork}/logs/error.log;
pid ${nginxWork}/nginx.pid;
events { worker_connections 64; }
http {
  include /etc/nginx/mime.types;
  access_log off;
  client_body_temp_path ${nginxWork}/body;
  proxy_temp_path ${nginxWork}/proxy;
  fastcgi_temp_path ${nginxWork}/fastcgi;
  uwsgi_temp_path ${nginxWork}/uwsgi;
  scgi_temp_path ${nginxWork}/scgi;
  server {
    listen 127.0.0.1:${port};
    ${locations}
    location = /synthetic/en/ {
      root ${pageRoot};
      add_header Cache-Control "no-cache" always;
      try_files /synthetic/en/index.html =404;
    }
  }
}
`,
    );
    run("nginx", ["-t", "-c", nginxConf]);
    run("nginx", ["-c", nginxConf]);
    const origin = `http://127.0.0.1:${port}`;
    const bodyOf = (urlPath) => {
      const file = path.join(work, "body");
      const response = spawnSync("curl", ["-sS", "-D", "-", "-o", file, `${origin}${urlPath}`], { encoding: "utf8" });
      assert.equal(response.status, 0, response.stderr);
      const status = Number(response.stdout.match(/^HTTP\/\d(?:\.\d)? (\d+)/)?.[1]);
      return { status, cache: response.stdout.match(/^cache-control:\s*(.+)$/im)?.[1]?.trim() ?? "", body: readFileSync(file) };
    };
    try {
      const hashed = bodyOf(topbarUrlPath);
      assert.equal(hashed.status, 200);
      assert.equal(hashed.cache, "public, max-age=31536000, immutable");
      assert.equal(sha256(hashed.body), manifestB.current.topbar.sha256);
      const css = bodyOf(cssUrlPath);
      assert.equal(css.status, 200);
      assert.equal(css.cache, "public, max-age=31536000, immutable");
      assert.equal(sha256(css.body), manifestB.current.css.sha256);

      const previous = run("readlink", ["-f", path.join(proj, "previous")]).stdout.trim();
      run("ln", ["-sfn", previous, path.join(proj, "current")]);
      const aliasA = bodyOf("/shell/topbar.js");
      const releaseAlias = readFileSync(path.join(previous, "dist/shell/topbar.js"));
      assert.ok(aliasA.body.equals(releaseAlias));
      assert.equal(sha256(bodyOf(topbarUrlPath).body), manifestB.current.topbar.sha256);

      deployed(shaA);
      sameMaps(pinned, checksums(shared));
      deployed(shaP);
      sameMaps(pinned, checksums(shared));
      const aliasP = bodyOf("/shell/topbar.js");
      const releaseP = run("readlink", ["-f", path.join(proj, "current")]).stdout.trim();
      assert.equal(aliasP.status, 200);
      assert.ok(aliasP.body.equals(readFileSync(path.join(releaseP, "dist/shell/topbar.js"))));
      assert.equal(readdirSync(path.join(releaseP, "dist/shell")).some((name) => /\.[0-9a-f]{64}\./.test(name)), false);
      assert.notEqual(sha256(aliasP.body), manifestB.current.topbar.sha256);
      assert.equal(sha256(bodyOf(topbarUrlPath).body), manifestB.current.topbar.sha256);

      const broken = commitTree("broken", () => {
        run("git", ["-C", repo, "checkout", shaA, "--", "."]);
        rmSync(path.join(repo, "package.json"));
      });
      const before = run("readlink", ["-f", path.join(proj, "current")]).stdout.trim();
      const failed = deploy(broken);
      assert.notEqual(failed.status, 0);
      assert.equal(run("readlink", ["-f", path.join(proj, "current")]).stdout.trim(), before);
      sameMaps(pinned, checksums(shared));

      rmSync(path.join(proj, "releases"), { recursive: true, force: true });
      rmSync(path.join(proj, "current"), { force: true });
      rmSync(path.join(proj, "previous"), { force: true });
      const synthetic = bodyOf("/synthetic/en/");
      assert.equal(synthetic.status, 200);
      assert.match(synthetic.body.toString("utf8"), /synthetic consumer/);
      assert.equal(sha256(bodyOf(topbarUrlPath).body), manifestB.current.topbar.sha256);
      assert.equal(sha256(bodyOf(cssUrlPath).body), manifestB.current.css.sha256);

      const browser = await puppeteer.launch({
        executablePath: ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find((item) => existsSync(item)),
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      try {
        const page = await browser.newPage();
        const cssHits = [];
        page.on("response", (response) => {
          if (response.url().includes(cssUrlPath)) cssHits.push({ status: response.status(), cache: response.headers()["cache-control"] || "" });
        });
        await page.goto(`${origin}/synthetic/en/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
        const view = await page.evaluate(() => {
          const bar = document.querySelector(".rf-bar");
          const buttonText = (node) => [...node.childNodes]
            .filter((child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent)
            .join("")
            .trim();
          const namesOf = () => [...document.querySelectorAll(".rf-menu .rf-n")].map((node) => node.textContent);
          const button = buttonText(document.querySelector(".rf-btn"));
          const names = namesOf();
          history.pushState(null, "", "/synthetic/?lang=zh");
          const chose = window.rfLang.choose("zh");
          document.dispatchEvent(new Event("rf:locale"));
          return {
            button,
            next: buttonText(document.querySelector(".rf-btn")),
            chose,
            same: document.querySelector(".rf-bar") === bar,
            input: document.querySelector("#draft").value,
            mount: window.rfLang.place(location.pathname).mount,
            names,
            namesZh: namesOf(),
          };
        });
        assert.equal(view.button, "Tools");
        assert.deepEqual(view.names, ["EasyPic", "ShutterCount", "Home Recipes", "All tools"]);
        assert.deepEqual(view.namesZh, ["EasyPic", "快门计数", "家常菜本", "全部工具"]);
        assert.equal(view.chose, true);
        assert.equal(view.same, true);
        assert.equal(view.next, "工具");
        assert.equal(view.input, "keep-me");
        assert.equal(view.mount, "/synthetic/");
        assert.equal(cssHits[0]?.status, 200);
        assert.equal(cssHits[0]?.cache, "public, max-age=31536000, immutable");
      } finally {
        await browser.close();
      }
    } finally {
      spawnSync("nginx", ["-c", nginxConf, "-s", "stop"]);
      rmSync(work, { recursive: true, force: true });
    }
  });
});
