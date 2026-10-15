import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

function read(rel) {
  return readFileSync(path.join(dist, rel), "utf8");
}

describe("dist contract", () => {
  it("ships the nginx document root", () => {
    for (const rel of [
      "index.html",
      "site.css",
      "motion.js",
      "favicon.svg",
      "apple-touch-icon.png",
      "shell/topbar.js",
      "shell/topbar.css",
      "assets/me.jpg",
      "assets/me-560.jpg",
    ]) {
      const info = statSync(path.join(dist, rel));
      assert.ok(info.isFile() && info.size > 0, rel);
    }
  });

  it("keeps motion and the topbar small classic scripts", () => {
    for (const rel of ["motion.js", "shell/topbar.js"]) {
      const js = read(rel);
      assert.ok(statSync(path.join(dist, rel)).size < 12_000, `${rel} is ${statSync(path.join(dist, rel)).size} bytes`);
      assert.doesNotMatch(js, /^\s*import\s/m);
      assert.doesNotMatch(js, /^\s*export\s/m);
    }
  });

  it("matches the home page content", () => {
    const html = read("index.html");
    const css = read("site.css");
    for (const text of [
      "rende.fun — 任德的小工具",
      "任德的个人站 · 3 个工具在线",
      "/easypic/",
      "/shutter/",
      "/recipes/",
      "下一个工具还在做",
      "人在杭州，前端搬砖",
      "摄影、游戏、电影",
      "rendeyuwei@qq.com",
      "bat1210299223@gmail.com",
      "render@mail.grokbot.com",
      "https://github.com/rendeyuwei",
      "@QSncV6Zi9580297",
      "© 2026 任德 · rende.fun",
      'src="/assets/me.jpg"',
      'srcset="/assets/me-560.jpg 560w, /assets/me.jpg 1120w"',
      'sizes="(max-width: 640px) 88px, (max-width: 959px) 220px, 280px"',
      'width="1120"',
      'height="1680"',
      'alt="任德"',
      'loading="lazy"',
      'decoding="async"',
      'src="/shell/topbar.js"',
      'src="/motion.js"',
    ]) {
      assert.ok(html.includes(text), text);
    }
    assert.equal(html.includes("照片待补"), false);
    assert.match(css, /\.card-me \.ph img \{[^}]*height: auto/);
    assert.match(css, /object-fit: cover/);
    assert.match(css, /object-position: 62% 66%/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(read("shell/topbar.css"), /--rf-h:\s*48px/);
    assert.match(read("shell/topbar.css"), /z-index:\s*2147483000/);
    assert.match(read("favicon.svg"), /#7FD1AE/i);
  });
});

const previous = new Map();

function installGlobals(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!previous.has(key)) previous.set(key, Object.hasOwn(globalThis, key) ? globalThis[key] : undefined);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
}

afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
  previous.clear();
});

function browser(html, { pathname = "/", search = "", reduce = false, fine = false } = {}) {
  const { window, document } = parseHTML(html);
  installGlobals({
    window,
    document,
    location: { pathname, search, href: `https://rende.fun${pathname}${search}` },
    matchMedia: (query) => ({
      matches: (reduce && query.includes("reduce")) || (fine && query.includes("hover") && query.includes("fine")),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }),
    requestAnimationFrame(cb) {
      cb(16);
      return 1;
    },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
  });
  document.getAnimations = () => [];
  window.__rfBar = 0;
  return { window, document };
}

describe("topbar", () => {
  const html = "<!doctype html><html><head></head><body><p id='page'>page</p></body></html>";

  it("marks the tool from the pathname and toggles the menu", () => {
    const { document } = browser(html, { pathname: "/shutter/album" });
    const script = document.createElement("script");
    script.src = "https://rende.fun/shell/topbar.js";
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    vm.runInThisContext(read("shell/topbar.js"));

    const bar = document.querySelector(".rf-bar");
    assert.ok(bar);
    assert.equal(document.documentElement.classList.contains("rf-has-bar"), true);
    assert.equal(document.querySelector("link[data-rf]").getAttribute("href"), "https://rende.fun/shell/topbar.css");
    assert.equal(document.querySelector(".rf-cur").textContent, "快门计数");
    assert.equal(document.querySelector(".rf-home").getAttribute("href"), "/");
    assert.equal(document.querySelector('a[href="/shutter/"]')?.getAttribute("aria-current"), "page");
    assert.equal(document.querySelector('a[href="/easypic/"]')?.hasAttribute("aria-current"), false);

    const button = document.querySelector(".rf-btn");
    const menu = document.querySelector(".rf-menu");
    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(menu.classList.contains("open"), true);

    const esc = new document.defaultView.Event("keydown", { bubbles: true });
    Object.defineProperty(esc, "key", { value: "Escape" });
    document.dispatchEvent(esc);
    assert.equal(menu.classList.contains("open"), false);
    assert.equal(button.getAttribute("aria-expanded"), "false");
  });

  it("hides the current tool on the home page", () => {
    const { document } = browser(html, { pathname: "/" });
    const script = document.createElement("script");
    script.src = "/shell/topbar.js";
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    vm.runInThisContext(read("shell/topbar.js"));
    assert.equal(document.querySelector(".rf-cur"), null);
    assert.equal(document.querySelector(".rf-home"), null);
    assert.equal(document.querySelector(".rf-logo").getAttribute("href"), "/");
    assert.equal(document.querySelectorAll(".rf-menu a").length, 4);
  });

  it("honors data-tool and data-home", () => {
    const { document } = browser(html, { pathname: "/" });
    const script = document.createElement("script");
    script.src = "https://rende.fun/shell/topbar.js?v=1";
    script.dataset.tool = "recipes";
    script.dataset.home = "/index.html";
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    vm.runInThisContext(read("shell/topbar.js"));
    assert.equal(document.querySelector(".rf-cur").textContent, "家常菜本");
    assert.equal(document.querySelector(".rf-home").getAttribute("href"), "/index.html");
    assert.equal(document.querySelector("link[data-rf]").getAttribute("href"), "https://rende.fun/shell/topbar.css");
  });
});

describe("motion", () => {
  const html = `<!doctype html><body>
    <h1 class="mark"><span class="w"></span><span class="tag">.fun</span></h1>
    <div class="grid">
      <a class="tool rv"><b class="n" data-count="12480">12,480</b></a>
      <a class="tool rv">b</a>
    </div>
    <canvas id="aurora"></canvas>
  </body>`;

  it("splits the wordmark and reveals immediately when motion is reduced", () => {
    const { document } = browser(html, { reduce: true });
    vm.runInThisContext(read("motion.js"));
    assert.deepEqual(
      [...document.querySelectorAll(".ch")].map((node) => node.textContent),
      ["r", "e", "n", "d", "e"],
    );
    for (const node of document.querySelectorAll(".rv")) {
      assert.equal(node.classList.contains("in"), true);
    }
    assert.equal(document.querySelector("[data-count]").textContent, "12,480");
  });

  it("freezes reveals without counting up", async () => {
    const { document } = browser(html, { search: "?freeze=0" });
    vm.runInThisContext(read("motion.js"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelector(".rv").classList.contains("in"), true);
    assert.equal(document.querySelector("[data-count]").textContent, "12,480");
  });
});
