import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const oct = readFileSync(path.join(root, "test/fixtures/topbar-2026-10-22.js"));
const octHash = createHash("sha256").update(oct).digest("hex");
const octSrc = `/shell/topbar.${octHash}.js`;

function chromePath() {
  const found = [process.env.CHROME_PATH, "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!found) throw new Error("Chrome is not installed");
  return found;
}

function builtSrc() {
  const html = readFileSync(path.join(dist, "en/index.html"), "utf8");
  const match = html.match(/<script src="(\/shell\/topbar[^"]*)" defer><\/script>/);
  if (!match) throw new Error("en/index.html has no topbar script");
  return match[1];
}

function pageHtml({ title, lang, src, tool = "", mount = "", input = false }) {
  const alternate = tool
    ? `<link rel="alternate" hreflang="zh-CN" href="/${tool}/">
<link rel="alternate" hreflang="en" href="/${tool}/en/">
<link rel="alternate" hreflang="x-default" href="/${tool}/en/">`
    : "";
  const mountTag = mount ? `<meta name="rf-mount" content="${mount}">` : "";
  const toolAttr = tool ? ` data-tool="${tool}"` : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
${mountTag}
${alternate}
<title>${title}</title>
</head>
<body>
<p id="page">${title}</p>
${input ? '<input id="draft" value="keep-me">' : ""}
<script src="${src}" defer${toolAttr}></script>
</body>
</html>`;
}

function start(src) {
  const stats = { legacy: 0 };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const referer = String(req.headers.referer || "");
      const send = (status, body, headers) => {
        const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
        res.writeHead(status, { "Content-Length": String(payload.length), ...headers });
        res.end(payload);
      };
      if (url.pathname === "/shell/topbar.js") {
        stats.legacy += 1;
        // The October response had no Cache-Control. Freshness is heuristic.
        // Do not send no-cache: that would be a different context from the bug.
        send(200, oct, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Last-Modified": "Thu, 22 Oct 2026 03:35:52 GMT",
        });
        return;
      }
      if (referer.includes("/timing/") && url.pathname === src) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      const routes = new Map([
        ["/cache-seed.html", pageHtml({ title: "seed", lang: "en", src: "/shell/topbar.js" })],
        ["/easypic/en/", pageHtml({ title: "easypic", lang: "en", src, tool: "easypic" })],
        ["/shutter/en/", pageHtml({ title: "shutter", lang: "en", src, tool: "shutter" })],
        ["/recipes/en/", pageHtml({ title: "recipes", lang: "en", src, tool: "recipes" })],
        ["/pics/en/", pageHtml({ title: "pics", lang: "en", src, tool: "easypic", mount: "/pics/", input: true })],
        ["/timing/en/", pageHtml({ title: "timing", lang: "en", src, tool: "easypic", mount: "/timing/", input: true })],
        ["/missing/", pageHtml({ title: "missing", lang: "en", src: `/shell/topbar.${"ab".repeat(32)}.js`, input: true })],
        ["/rollback/", pageHtml({ title: "rollback", lang: "en", src: octSrc, tool: "shutter" })],
      ]);
      if (routes.has(url.pathname)) {
        send(200, routes.get(url.pathname), { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        return;
      }
      if (url.pathname === "/en" || url.pathname === "/en/") {
        send(200, readFileSync(path.join(dist, "en/index.html")), {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        return;
      }
      if (url.pathname === "/") {
        send(200, readFileSync(path.join(dist, "index.html")), {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        return;
      }
      const rel = decodeURIComponent(url.pathname);
      const file = path.normalize(path.join(dist, rel));
      if (!file.startsWith(`${dist}${path.sep}`)) {
        send(404, "missing", { "Content-Type": "text/plain", "Cache-Control": "no-cache" });
        return;
      }
      let body;
      try {
        body = readFileSync(file);
      } catch {
        send(404, "missing", { "Content-Type": "text/plain", "Cache-Control": "no-cache" });
        return;
      }
      const hashed = /^\/shell\/(?:lang|topbar)\.[0-9a-f]{64}\.(?:js|css)$/.test(rel);
      const type = rel.endsWith(".css")
        ? "text/css; charset=utf-8"
        : rel.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : rel.endsWith(".json")
            ? "application/json"
            : "application/octet-stream";
      send(200, body, {
        "Content-Type": type,
        "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      });
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(error));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        stats,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function launch(dir) {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    userDataDir: dir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=zh-CN", `--disk-cache-dir=${path.join(dir, "cache")}`, "--disk-cache-size=67108864"],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, "languages", { get: () => ["zh-CN", "zh"] });
    Object.defineProperty(Navigator.prototype, "language", { get: () => "zh-CN" });
  });
  const hits = [];
  page.on("response", (response) => {
    let pathname = "";
    try {
      pathname = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (!/\/topbar(?:\.[0-9a-f]{64})?\.js$/.test(pathname)) return;
    hits.push({ path: pathname, status: response.status(), fromCache: response.fromCache() });
  });
  return { browser, page, hits };
}

async function menu(page) {
  await page.waitForSelector(".rf-btn", { timeout: 8000 });
  return page.evaluate(() => {
    const text = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return "";
      return [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent)
        .join("")
        .trim();
    };
    return {
      button: text(".rf-btn"),
      current: document.querySelector(".rf-cur")?.textContent ?? "",
      back: document.querySelector(".rf-home .rf-t")?.textContent ?? "",
      toggle: document.querySelector("a.rf-lang")?.textContent ?? "",
      names: [...document.querySelectorAll(".rf-menu .rf-n")].map((node) => node.textContent),
      path: location.pathname + location.search,
    };
  });
}

describe("cached shell", { timeout: 120_000 }, () => {
  it("serves an English menu from a new cache key after a browser stored the October topbar", async () => {
    const src = builtSrc();
    const server = await start(src);
    const dir = mkdtempSync(path.join(tmpdir(), "rf-shell-"));
    const slowDir = mkdtempSync(path.join(tmpdir(), "rf-shell-slow-"));
    let browser;
    let slowBrowser;
    try {
      const session = await launch(dir);
      browser = session.browser;
      const { page, hits } = session;
      await page.goto(`${server.origin}/cache-seed.html`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const seeded = await menu(page);
      assert.equal(seeded.button, "工具", "the October script did not paint");
      assert.equal(seeded.toggle, "", "the October script has no language switch");
      const before = hits.length;
      await page.goto(`${server.origin}/cache-seed.html?again=1`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const again = await menu(page);
      const cached = hits.slice(before);
      assert.equal(again.button, "工具");
      assert.equal(cached.some((hit) => hit.path === "/shell/topbar.js" && hit.fromCache), true, `old script was not reused from cache: ${JSON.stringify(cached)} serverHits=${server.stats.legacy}`);

      const mark = hits.length;
      await page.goto(`${server.origin}/en/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const english = await menu(page);
      const fresh = hits.slice(mark);
      assert.deepEqual(
        english.names,
        ["EasyPic", "ShutterCount", "Home Recipes", "All tools"],
        `English HTML reused the cached topbar. button=${english.button} requests=${JSON.stringify(fresh)}`,
      );
      assert.equal(english.button, "Tools");
      assert.equal(english.toggle, "中文");
      assert.equal(fresh[0]?.fromCache, false, JSON.stringify(fresh));
      assert.match(fresh[0]?.path ?? "", /^\/shell\/topbar\.[0-9a-f]{64}\.js$/);

      const warmMark = hits.length;
      await page.goto(`${server.origin}/en/?warm=1`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const warm = await menu(page);
      const warmed = hits.slice(warmMark);
      assert.deepEqual(warm.names, english.names);
      assert.equal(warmed.some((hit) => hit.fromCache), true, `current shell was not served from cache: ${JSON.stringify(warmed)}`);

      await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const home = await menu(page);
      assert.equal(home.path, "/", home.path);
      assert.equal(home.button, "工具");
      assert.equal(home.toggle, "EN");
      assert.deepEqual(home.names, ["EasyPic", "快门计数", "家常菜本", "全部工具"]);

      for (const route of [
        { path: "/easypic/en/", current: "EasyPic" },
        { path: "/shutter/en/", current: "ShutterCount" },
        { path: "/recipes/en/", current: "Home Recipes" },
      ]) {
        await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
        const view = await menu(page);
        assert.equal(view.button, "Tools", route.path);
        assert.equal(view.current, route.current, route.path);
        assert.equal(view.back, "Back to home", route.path);
        assert.equal(view.names.at(-1), "All tools", route.path);
      }

      await page.goto(`${server.origin}/pics/en/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.$eval("#draft", (input) => {
        input.value = "keep-me-edited";
      });
      const pics = await menu(page);
      assert.equal(pics.button, "Tools");
      const place = await page.evaluate(() => window.rfLang.place(location.pathname));
      assert.equal(place.mount, "/pics/");
      assert.equal(place.lang, "en");
      assert.equal(place.site.id, "easypic");
      const requestsBefore = hits.length;
      const switched = await page.evaluate(() => {
        const bar = document.querySelector(".rf-bar");
        history.pushState(null, "", "/pics/?lang=zh");
        const chose = window.rfLang.choose("zh");
        document.dispatchEvent(new Event("rf:locale"));
        const button = [...document.querySelector(".rf-btn").childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent)
          .join("")
          .trim();
        return {
          chose,
          sameBar: document.querySelector(".rf-bar") === bar,
          button,
          input: document.querySelector("#draft").value,
          scripts: document.querySelectorAll("script[src*='topbar']").length,
          mount: window.rfLang.place(location.pathname).mount,
          lang: window.rfLang.place(location.pathname).lang,
        };
      });
      assert.equal(switched.chose, true);
      assert.equal(switched.sameBar, true);
      assert.equal(switched.button, "工具");
      assert.equal(switched.input, "keep-me-edited");
      assert.equal(switched.scripts, 1);
      assert.equal(switched.mount, "/pics/");
      assert.equal(switched.lang, "zh");
      assert.equal(hits.length, requestsBefore, "same-document switch requested the topbar again");

      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 });
      const back = await page.evaluate(() => ({
        path: location.pathname,
        input: document.querySelector("#draft").value,
        button: [...document.querySelector(".rf-btn").childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent)
          .join("")
          .trim(),
        scripts: document.querySelectorAll("script[src*='topbar']").length,
      }));
      assert.equal(back.path, "/pics/en/");
      assert.equal(back.button, "Tools");
      assert.equal(back.input, "keep-me-edited");
      assert.equal(back.scripts, 1);
      assert.equal(hits.length, requestsBefore, "history traversal requested the topbar again");

      const failedInsert = await page.evaluate(async () => {
        const bar = document.querySelector(".rf-bar");
        const script = document.createElement("script");
        script.src = `/shell/topbar.${"ab".repeat(32)}.js`;
        const failed = new Promise((resolve) => {
          script.addEventListener("error", () => resolve(true));
        });
        document.body.appendChild(script);
        await failed;
        return {
          bar: document.querySelector(".rf-bar") === bar,
          input: document.querySelector("#draft").value,
        };
      });
      assert.equal(failedInsert.bar, true);
      assert.equal(failedInsert.input, "keep-me-edited");

      await page.goto(`${server.origin}/rollback/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const rolled = await menu(page);
      assert.equal(rolled.button, "工具", "rollback HTML could not load the pinned October topbar");
      assert.equal(rolled.current, "快门计数");
      assert.equal(hits.at(-1)?.path, octSrc);
      assert.equal(hits.at(-1)?.status, 200);

      await browser.close();
      browser = undefined;

      const slow = await launch(slowDir);
      slowBrowser = slow.browser;
      const started = Date.now();
      const client = await slow.page.createCDPSession();
      await client.send("Page.enable");
      await client.send("Page.navigate", { url: `${server.origin}/timing/en/` });
      await slow.page.waitForSelector("#draft", { timeout: 8000 });
      const early = await slow.page.evaluate(() => ({
        input: document.querySelector("#draft").value,
        bar: Boolean(document.querySelector(".rf-bar")),
      }));
      assert.equal(early.input, "keep-me");
      assert.equal(early.bar, false, "the delayed script was already applied");
      const timed = await menu(slow.page);
      assert.ok(Date.now() - started >= 1200, "the script response was not delayed");
      assert.equal(timed.button, "Tools");
      assert.equal(await slow.page.$eval("#draft", (input) => input.value), "keep-me");
      await slow.browser.close();
      slowBrowser = undefined;

      const missingBrowser = await launch(mkdtempSync(path.join(tmpdir(), "rf-shell-miss-")));
      try {
        await missingBrowser.page.goto(`${server.origin}/missing/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
        const bare = await missingBrowser.page.evaluate(() => ({
          bar: Boolean(document.querySelector(".rf-bar")),
          input: document.querySelector("#draft").value,
          page: document.querySelector("#page").textContent,
        }));
        assert.equal(bare.bar, false);
        assert.equal(bare.input, "keep-me");
        assert.equal(bare.page, "missing");
      } finally {
        await missingBrowser.browser.close();
      }
    } finally {
      if (browser) await browser.close();
      if (slowBrowser) await slowBrowser.close();
      await server.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(slowDir, { recursive: true, force: true });
    }
  });
});
