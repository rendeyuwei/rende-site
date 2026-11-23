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
      "en/index.html",
      "site.css",
      "motion.js",
      "favicon.svg",
      "apple-touch-icon.png",
      "shell/lang.js",
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
    for (const rel of ["motion.js", "shell/lang.js", "shell/topbar.js"]) {
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
    assert.match(css, /object-position: 62% 96%/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(read("shell/topbar.css"), /--rf-h:\s*48px/);
    assert.match(read("shell/topbar.css"), /z-index:\s*2147483000/);
    assert.match(read("favicon.svg"), /#7FD1AE/i);
  });

  it("ships zh and en pages with their own language metadata", () => {
    const pages = [
      { rel: "index.html", lang: "zh-CN", canonical: "https://rende.fun/", title: "rende.fun — 任德的小工具" },
      { rel: "en/index.html", lang: "en", canonical: "https://rende.fun/en/", title: "rende.fun — Ren De's small tools" },
    ];
    for (const page of pages) {
      const { document } = parseHTML(read(page.rel));
      assert.equal(document.documentElement.getAttribute("lang"), page.lang, page.rel);
      assert.equal(document.querySelector("title").textContent, page.title);
      assert.equal(document.querySelector('link[rel="canonical"]').getAttribute("href"), page.canonical);
      const alternates = Object.fromEntries(
        [...document.querySelectorAll('link[rel="alternate"]')].map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")]),
      );
      assert.deepEqual(alternates, {
        "zh-CN": "https://rende.fun/",
        en: "https://rende.fun/en/",
        "x-default": "https://rende.fun/en/",
      });
      assert.ok(document.querySelector('script[src="/shell/topbar.js"]'), page.rel);
      assert.ok(document.querySelector('script[src="/motion.js"]'), page.rel);
      assert.deepEqual(
        [...document.querySelectorAll("a[data-rf-site]")].map((link) => [link.dataset.rfSite, link.getAttribute("href")]),
        [
          ["easypic", "/easypic/"],
          ["shutter", "/shutter/"],
          ["recipes", "/recipes/"],
        ],
      );
    }
    assert.match(
      parseHTML(read("en/index.html")).document.querySelector('meta[name="description"]').getAttribute("content"),
      /^Ren De's personal site\./,
    );
  });

  it("inlines the language decision only into the zh page", () => {
    const lang = read("shell/lang.js").trim();
    const zh = parseHTML(read("index.html")).document;
    const enter = zh.querySelector("script[data-rf-enter]");
    assert.ok(enter);
    assert.equal(enter.hasAttribute("src"), false);
    assert.equal(enter.textContent, lang);
    const head = [...zh.head.children];
    const enterAt = head.indexOf(enter);
    assert.ok(head.findIndex((node) => node.getAttribute("hreflang") === "en") < enterAt, "alternates come first");
    assert.ok(head.findIndex((node) => /hm\.baidu\.com/.test(node.textContent)) > enterAt, "analytics come after");
    assert.ok(head.findIndex((node) => node.getAttribute("rel") === "stylesheet") > enterAt, "styles come after");
    assert.equal(parseHTML(read("en/index.html")).document.querySelector("script[data-rf-enter]"), null);
    assert.ok(read("shell/topbar.js").startsWith(lang));
  });

  it("keeps the en page in English with the zh page structure", () => {
    const skeleton = (document) =>
      [...document.body.querySelectorAll("*")].map((node) => `${node.tagName}.${node.getAttribute("class") ?? ""}`);
    const zh = parseHTML(read("index.html")).document;
    const en = parseHTML(read("en/index.html")).document;
    assert.deepEqual(skeleton(en), skeleton(zh));

    const han = /[\u3400-\u9fff]/;
    const exempt = (node) => !!node.closest('[aria-hidden="true"], [lang="zh-CN"]');
    for (const node of en.body.querySelectorAll("*")) {
      for (const attr of ["alt", "aria-label", "title"]) {
        if (node.hasAttribute(attr)) assert.doesNotMatch(node.getAttribute(attr), han, `${node.tagName} ${attr}`);
      }
      if (node.tagName === "A") assert.doesNotMatch(decodeURIComponent(node.getAttribute("href")), han, node.getAttribute("href"));
      if (exempt(node)) continue;
      for (const child of node.childNodes) {
        if (child.nodeType === 3) assert.doesNotMatch(child.textContent, han, `${node.tagName}: ${child.textContent}`);
      }
    }
    assert.doesNotMatch(en.querySelector("title").textContent, han);
    assert.doesNotMatch(en.querySelector('meta[name="description"]').getAttribute("content"), han);
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

function browser(html, { pathname = "/", search = "", hash = "", reduce = false, fine = false, storage } = {}) {
  const { window, document } = parseHTML(html);
  installGlobals({
    window,
    document,
    location: {
      pathname,
      search,
      hash,
      protocol: "https:",
      href: `https://rende.fun${pathname}${search}${hash}`,
      replace() {
        throw new Error("unexpected navigation");
      },
    },
    localStorage: storage?.localStorage,
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
  let jar = storage?.cookie ?? "";
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get() {
      if (storage?.cookieBlocked) throw new Error("SecurityError: cookies are disabled");
      return jar;
    },
    set(value) {
      if (storage?.cookieBlocked) throw new Error("SecurityError: cookies are disabled");
      jar = value.split(";")[0];
    },
  });
  document.getAnimations = () => [];
  window.__rfBar = 0;
  window.rfLang = undefined;
  return { window, document };
}

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const blockedStorage = {
  getItem() {
    throw new Error("SecurityError: storage is disabled");
  },
  setItem() {
    throw new Error("SecurityError: storage is disabled");
  },
};

const ALTERNATES =
  '<link rel="alternate" hreflang="zh-CN" href="https://rende.fun/"><link rel="alternate" hreflang="en" href="https://rende.fun/en/">';

function withScript(document, src, attrs = {}) {
  const script = document.createElement("script");
  script.src = src;
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
  Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
  return script;
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

describe("lang", () => {
  function enter({ pathname = "/", search = "", hash = "", languages = ["zh-CN"], alternates = true, storage } = {}) {
    const head = alternates ? ALTERNATES : "";
    const { window, document } = browser(`<!doctype html><html><head>${head}</head><body></body></html>`, {
      pathname,
      search,
      hash,
      storage: storage ?? { localStorage: memoryStorage() },
    });
    const replaced = [];
    globalThis.location.replace = (url) => replaced.push(url);
    installGlobals({ navigator: { languages, language: languages[0] } });
    withScript(document, "", { "data-rf-enter": "" });
    vm.runInThisContext(read("shell/lang.js"));
    return { replaced, rf: window.rfLang };
  }

  it("matches the ordered browser languages on first visit", () => {
    assert.deepEqual(enter({ languages: ["en-US"] }).replaced, ["/en/"]);
    assert.deepEqual(enter({ languages: ["zh-CN"] }).replaced, []);
    assert.deepEqual(enter({ languages: ["ja", "en", "zh-CN"] }).replaced, ["/en/"]);
    assert.deepEqual(enter({ languages: ["ja", "zh-CN", "en"] }).replaced, []);
    assert.deepEqual(enter({ languages: ["zh-TW", "en"] }).replaced, []);
    assert.deepEqual(enter({ languages: ["zh_HK"] }).replaced, []);
  });

  it("defaults to English when nothing matches", () => {
    assert.deepEqual(enter({ languages: ["ja", "ko"] }).replaced, ["/en/"]);
    assert.deepEqual(enter({ languages: [] }).replaced, ["/en/"]);
  });

  it("lets a manual choice override the browser", () => {
    const zh = { localStorage: memoryStorage({ "rf-lang": "zh" }) };
    const en = { localStorage: memoryStorage({ "rf-lang": "en" }) };
    assert.deepEqual(enter({ languages: ["en-US"], storage: zh }).replaced, []);
    assert.deepEqual(enter({ languages: ["zh-CN"], storage: en }).replaced, ["/en/"]);
    assert.deepEqual(enter({ languages: ["zh-CN"], storage: { localStorage: blockedStorage, cookie: "rf-lang=en" } }).replaced, ["/en/"]);
  });

  it("never overrides a URL that names its language", () => {
    const zh = { localStorage: memoryStorage({ "rf-lang": "zh" }) };
    const en = { localStorage: memoryStorage({ "rf-lang": "en" }) };
    assert.deepEqual(enter({ pathname: "/en/", languages: ["zh-CN"], storage: zh }).replaced, []);
    assert.deepEqual(enter({ pathname: "/en", languages: ["zh-CN"], storage: zh }).replaced, []);
    assert.deepEqual(enter({ search: "?lang=zh", languages: ["en-US"], storage: en }).replaced, []);
    assert.deepEqual(enter({ search: "?a=1&lang=zh", languages: ["en-US"] }).replaced, []);
  });

  it("keeps the query, hash, and route when it redirects", () => {
    assert.deepEqual(enter({ search: "?freeze=0", hash: "#about", languages: ["en"] }).replaced, ["/en/?freeze=0#about"]);
    assert.deepEqual(enter({ search: "?q=a%20b&lang=en", languages: ["en"] }).replaced, ["/en/?q=a%20b"]);
  });

  it("stays put on pages without an English counterpart", () => {
    assert.deepEqual(enter({ pathname: "/easypic/", languages: ["en-US"], alternates: false }).replaced, []);
  });

  it("works when storage and cookies are both disabled", () => {
    const blocked = { localStorage: blockedStorage, cookieBlocked: true };
    const { replaced, rf } = enter({ languages: ["en-US"], storage: blocked });
    assert.deepEqual(replaced, ["/en/"]);
    assert.equal(rf.pref(), null);
    assert.equal(rf.choose("zh"), false);
  });

  it("persists a choice in localStorage, or in a cookie when localStorage fails", () => {
    const local = memoryStorage();
    assert.equal(enter({ storage: { localStorage: local } }).rf.choose("en"), true);
    assert.equal(local.items.get("rf-lang"), "en");
    const { rf } = enter({ storage: { localStorage: blockedStorage } });
    assert.equal(rf.choose("zh"), true);
    assert.equal(document.cookie, "rf-lang=zh");
    assert.equal(rf.pref(), "zh");
  });

  it("maps paths between languages per site", () => {
    const { rf } = enter({ pathname: "/recipes/en/12", search: "?a=1", hash: "#x", alternates: false });
    assert.equal(rf.place("/recipes/en/12").site.id, "recipes");
    assert.equal(rf.place("/easypic").site.id, "easypic");
    assert.deepEqual(
      [rf.place("/en").lang, rf.place("/english").lang, rf.place("/shutter/en/").rest],
      ["en", "zh", ""],
    );
    assert.equal(rf.href("zh"), "/recipes/12?a=1&lang=zh#x");
    assert.equal(rf.href("en"), "/recipes/en/12?a=1#x");
    assert.deepEqual(
      rf.sites.map((site) => [site.id, site.base, site.en]),
      [
        ["easypic", "/easypic/", false],
        ["shutter", "/shutter/", false],
        ["recipes", "/recipes/", false],
        ["home", "/", true],
      ],
    );
  });
});

describe("topbar languages", () => {
  function bar({ pathname = "/", search = "", hash = "", head = ALTERNATES, body = "", storage } = {}) {
    const { window, document } = browser(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, {
      pathname,
      search,
      hash,
      storage: storage ?? { localStorage: memoryStorage() },
    });
    withScript(document, "https://rende.fun/shell/topbar.js");
    vm.runInThisContext(read("shell/topbar.js"));
    const hrefs = [...document.querySelectorAll(".rf-menu a")].map((link) => link.getAttribute("href"));
    return { window, document, hrefs, toggle: document.querySelector(".rf-lang") };
  }

  const cards = '<a data-rf-site="easypic" href="/easypic/">e</a><a data-rf-site="shutter" href="/shutter/">s</a>';

  it("renders English on the English home page", () => {
    const { document, hrefs, toggle } = bar({ pathname: "/en/", search: "?freeze=0", hash: "#about", body: cards });
    assert.equal(document.querySelector(".rf-bar").getAttribute("lang"), "en");
    assert.equal(document.querySelector(".rf-logo").getAttribute("aria-label"), "rende.fun home");
    assert.equal(document.querySelector(".rf-logo").getAttribute("href"), "/en/");
    assert.equal(document.querySelector(".rf-btn").textContent.trim(), "Tools");
    assert.equal(document.querySelector(".rf-menu").getAttribute("aria-label"), "Switch tool");
    assert.deepEqual(
      [...document.querySelectorAll(".rf-menu .rf-n")].map((node) => node.textContent),
      ["EasyPic", "ShutterCount", "Home Recipes", "All tools"],
    );
    assert.deepEqual(hrefs, ["/easypic/", "/shutter/", "/recipes/", "/en/"]);
    assert.equal(document.querySelector('a[data-rf-site="shutter"]').getAttribute("href"), "/shutter/");
    assert.equal(toggle.textContent, "中文");
    assert.equal(toggle.getAttribute("lang"), "zh-CN");
    assert.equal(toggle.getAttribute("href"), "/?freeze=0&lang=zh#about");
    for (const sw of document.querySelectorAll(".rf-sw")) assert.equal(sw.getAttribute("aria-hidden"), "true");
  });

  it("offers English on the Chinese home page and remembers the click", () => {
    const local = memoryStorage();
    const { toggle, hrefs } = bar({ search: "?lang=zh&freeze=0", storage: { localStorage: local } });
    assert.equal(toggle.textContent, "EN");
    assert.equal(toggle.getAttribute("aria-label"), "Switch to English");
    assert.equal(toggle.getAttribute("href"), "/en/?freeze=0");
    assert.deepEqual(hrefs, ["/easypic/?lang=zh", "/shutter/?lang=zh", "/recipes/?lang=zh", "/?lang=zh"]);
    toggle.click();
    assert.equal(local.items.get("rf-lang"), "en");
  });

  it("drops the zh marker from links once the choice is stored", () => {
    const { hrefs } = bar({ search: "?lang=zh", storage: { localStorage: memoryStorage({ "rf-lang": "zh" }) } });
    assert.deepEqual(hrefs, ["/easypic/", "/shutter/", "/recipes/", "/"]);
  });

  it("carries an explicit zh choice across tools when storage is disabled", () => {
    const { document, hrefs } = bar({
      search: "?lang=zh",
      body: cards,
      storage: { localStorage: blockedStorage, cookieBlocked: true },
    });
    assert.deepEqual(hrefs, ["/easypic/?lang=zh", "/shutter/?lang=zh", "/recipes/?lang=zh", "/?lang=zh"]);
    assert.equal(document.querySelector('a[data-rf-site="easypic"]').getAttribute("href"), "/easypic/?lang=zh");
    assert.equal(document.querySelector(".rf-logo").getAttribute("href"), "/?lang=zh");
  });

  it("hides the switch on tool pages that have no English version", () => {
    const { document, toggle, hrefs } = bar({ pathname: "/easypic/", head: "" });
    assert.equal(toggle, null);
    assert.equal(document.querySelector(".rf-bar").getAttribute("lang"), "zh-CN");
    assert.equal(document.querySelector(".rf-cur").textContent, "EasyPic");
    assert.equal(document.querySelector(".rf-home .rf-t").textContent, "回到主站");
    assert.deepEqual(hrefs, ["/easypic/", "/shutter/", "/recipes/", "/"]);
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
