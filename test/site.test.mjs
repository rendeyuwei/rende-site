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

function shellManifest() {
  return JSON.parse(read("shell/manifest.json"));
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
      "assets/tipwink-icon.png",
      "assets/cursor-paperCat.png",
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
      "任德的个人站 · 网页工具和 Mac 应用",
      "做几个小工具，各管一件事。<span>网页打开即用，Mac 应用需先下载。</span>",
      "/easypic/",
      "/shutter/",
      "/recipes/",
      '<span lang="zh-CN">纸尖</span> / Tipwink',
      "macOS 菜单栏光标主题",
      "需下载安装",
      "了解并下载",
      "如果你有点子、想合作，或者只是想聊聊，欢迎写信给我。",
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
      'src="/motion.js"',
    ]) {
      assert.ok(html.includes(text), text);
    }
    assert.ok(html.includes(`src="${shellManifest().current.topbar.path}"`));
    assert.equal(html.includes("照片待补"), false);

    const desk = parseHTML(html).document.querySelector("a.desk");
    assert.ok(desk);
    assert.equal(desk.getAttribute("href"), "https://rendeyuwei.github.io/Tipwink/");
    assert.equal(desk.getAttribute("target"), "_blank");
    const deskRel = (desk.getAttribute("rel") ?? "").split(/\s+/);
    assert.ok(deskRel.includes("noopener"), "desk rel has noopener");
    assert.ok(deskRel.includes("noreferrer"), "desk rel has noreferrer");

    const en = read("en/index.html");
    for (const text of [
      "Ren De's personal site · web tools and Mac apps",
      "<span>Open the web tools and use them right away; Mac apps need to be downloaded first.</span>",
      '<span lang="zh-CN">纸尖</span> / Tipwink',
      "Cursor themes for the macOS menu bar",
      "Learn and download",
      "If you have an idea, want to collaborate, or just want to chat, write to me.",
    ]) {
      assert.ok(en.includes(text), text);
    }
    for (const gone of [
      "下一个工具还在做",
      "打开就能用，不用注册",
      "3 个工具在线",
      "3 tools online",
      "Just open one and use it, no sign-up.",
      "The next tool is in the works.",
    ]) {
      assert.equal(html.includes(gone), false, gone);
      assert.equal(en.includes(gone), false, gone);
    }

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
      assert.ok(document.querySelector(`script[src="${shellManifest().current.topbar.path}"]`), page.rel);
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

  it("stays readable without JavaScript", () => {
    for (const rel of ["index.html", "en/index.html"]) {
      const style = parseHTML(read(rel)).document.querySelector("head noscript").textContent;
      assert.match(style, /\.rv \{ opacity: 1; transform: none; filter: none; \}/, rel);
      assert.match(style, /\.mark \.w::before \{ content: "rende"; \}/, rel);
    }
  });

  it("inlines the language decision only into the zh page", () => {
    const lang = read("shell/lang.js").trim();
    const zh = parseHTML(read("index.html")).document;
    const enter = zh.querySelector("script[data-rf-enter]");
    assert.ok(enter);
    assert.equal(enter.hasAttribute("src"), false);
    assert.equal(enter.textContent, lang);
    const head = [...zh.head.children];
    const at = (test) => {
      const index = head.findIndex(test);
      assert.ok(index >= 0);
      return index;
    };
    const enterAt = head.indexOf(enter);
    assert.ok(at((node) => node.getAttribute("hreflang") === "en") < enterAt, "alternates come first");
    const analytics = at((node) => /hm\.baidu\.com/.test(node.textContent));
    assert.ok(analytics > enterAt, "analytics come after");
    assert.match(head[analytics].textContent, /if \(window\.rfLang && window\.rfLang\.leaving\) return;/);
    assert.ok(at((node) => node.getAttribute("rel") === "stylesheet") > enterAt, "styles come after");
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
      origin: "https://rende.fun",
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
  const cookieWrites = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get() {
      if (storage?.cookieBlocked) throw new Error("SecurityError: cookies are disabled");
      return jar;
    },
    set(value) {
      if (storage?.cookieBlocked) throw new Error("SecurityError: cookies are disabled");
      cookieWrites.push(value);
      jar = value.split(";")[0];
    },
  });
  document.getAnimations = () => [];
  window.__rfBar = 0;
  window.rfLang = undefined;
  return { window, document, cookieWrites };
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
    script.src = `https://rende.fun${shellManifest().current.topbar.path}`;
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    vm.runInThisContext(read("shell/topbar.js"));

    const bar = document.querySelector(".rf-bar");
    assert.ok(bar);
    assert.equal(document.documentElement.classList.contains("rf-has-bar"), true);
    assert.equal(document.querySelector("link[data-rf]").getAttribute("href"), `https://rende.fun${shellManifest().current.css.path}`);
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
    assert.equal(document.querySelector("link[data-rf]").getAttribute("href"), `https://rende.fun${shellManifest().current.css.path}`);
  });
});

describe("lang", () => {
  function enter({ pathname = "/", search = "", hash = "", languages = ["zh-CN"], alternates = true, storage } = {}) {
    const head = alternates ? ALTERNATES : "";
    const { window, document, cookieWrites } = browser(`<!doctype html><html><head>${head}</head><body></body></html>`, {
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
    return { replaced, rf: window.rfLang, cookieWrites };
  }

  it("matches the ordered browser languages on first visit", () => {
    const first = enter({ languages: ["en-US"] });
    assert.deepEqual(first.replaced, ["/en/"]);
    assert.equal(first.rf.leaving, true);
    assert.equal(enter({ languages: ["zh-CN"] }).rf.leaving, false);
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
    const { rf, cookieWrites } = enter({ storage: { localStorage: blockedStorage } });
    assert.equal(rf.choose("zh"), true);
    assert.deepEqual(cookieWrites, ["rf-lang=zh; Path=/; Max-Age=31536000; SameSite=Lax; Secure"]);
    assert.equal(rf.pref(), "zh");
    const stale = enter({ storage: { localStorage: memoryStorage({ "rf-lang": "fr" }), cookie: "rf-lang=en" } });
    assert.equal(stale.rf.pref(), "en");
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
    assert.equal(rf.place("/en//evil.com/x").rest, "evil.com/x");
    assert.equal(enter({ pathname: "/en//evil.com/x", alternates: false }).rf.href("zh"), "/evil.com/x?lang=zh");
    assert.deepEqual(
      rf.sites.map((site) => [site.id, site.base, site.en]),
      [
        ["easypic", "/easypic/", true],
        ["shutter", "/shutter/", true],
        ["recipes", "/recipes/", true],
        ["home", "/", true],
      ],
    );
  });
});

function bar({ pathname = "/", search = "", hash = "", head = ALTERNATES, body = "", storage, tool = "", mount = "", mountName = "rf-mount", beforeRun } = {}) {
  const meta = mount ? `<meta name="${mountName}" content="${mount}">` : "";
  const { window, document } = browser(`<!doctype html><html><head>${meta}${head}</head><body>${body}</body></html>`, {
    pathname,
    search,
    hash,
    storage: storage ?? { localStorage: memoryStorage() },
  });
  const script = withScript(document, "https://rende.fun/shell/topbar.js", tool ? { "data-tool": tool } : {});
  document.head.appendChild(script);
  beforeRun?.({ window, document });
  vm.runInThisContext(read("shell/topbar.js"));
  const hrefs = [...document.querySelectorAll(".rf-menu a")].map((link) => link.getAttribute("href"));
  return { window, document, hrefs, toggle: document.querySelector(".rf-lang") };
}

describe("topbar languages", () => {
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
    assert.deepEqual(hrefs, ["/easypic/en/", "/shutter/en/", "/recipes/en/", "/en/"]);
    assert.equal(document.querySelector('a[data-rf-site="shutter"]').getAttribute("href"), "/shutter/en/");
    assert.equal(toggle.textContent, "中文");
    assert.equal(toggle.getAttribute("lang"), "zh-CN");
    assert.equal(toggle.getAttribute("href"), "/?freeze=0&lang=zh#about");
    for (const sw of document.querySelectorAll(".rf-sw")) assert.equal(sw.getAttribute("aria-hidden"), "true");
  });

  it("offers English on the Chinese home page and remembers the click", () => {
    const local = memoryStorage();
    const { toggle, hrefs } = bar({ search: "?lang=zh&freeze=0", storage: { localStorage: local } });
    assert.equal(toggle.textContent, "EN");
    assert.equal(toggle.hasAttribute("aria-label"), false);
    assert.equal(toggle.getAttribute("title"), "Switch to English");
    assert.equal(toggle.getAttribute("href"), "/en/?freeze=0");
    assert.deepEqual(hrefs, ["/easypic/?lang=zh", "/shutter/?lang=zh", "/recipes/?lang=zh", "/?lang=zh"]);
    toggle.click();
    assert.equal(local.items.get("rf-lang"), "en");
  });

  it("follows hash changes in the switch link", () => {
    const { window, toggle } = bar({ search: "?freeze=0" });
    globalThis.location.hash = "#about";
    window.dispatchEvent(new window.Event("hashchange"));
    assert.equal(toggle.getAttribute("href"), "/en/?freeze=0#about");
  });

  it("switches even when storage and cookies are disabled", () => {
    const { toggle } = bar({ pathname: "/en/", storage: { localStorage: blockedStorage, cookieBlocked: true } });
    assert.doesNotThrow(() => toggle.click());
    assert.equal(toggle.getAttribute("href"), "/?lang=zh");
  });

  it("links an English page to each tool's English entry", () => {
    const { window } = bar({ pathname: "/en/" });
    assert.equal(window.rfLang.siteHref("easypic"), "/easypic/en/");
    assert.equal(window.rfLang.siteHref("shutter"), "/shutter/en/");
    assert.equal(window.rfLang.siteHref("recipes"), "/recipes/en/");
    assert.equal(window.rfLang.siteHref("home"), "/en/");
    window.rfLang.sites.find((site) => site.id === "shutter").en = false;
    assert.equal(window.rfLang.siteHref("shutter"), "/shutter/");
    const zh = bar({ pathname: "/" });
    assert.equal(zh.window.rfLang.siteHref("easypic"), "/easypic/");
    assert.equal(zh.window.rfLang.siteHref("shutter"), "/shutter/");
    assert.equal(zh.window.rfLang.siteHref("recipes"), "/recipes/");
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

describe("same-document locale", () => {
  const kept = ["place", "match", "pref", "choose", "offers", "href", "siteHref", "enter"];

  function mounted(extra = {}) {
    return bar({
      pathname: "/tools/counter/",
      search: "?demo=1",
      hash: "#success",
      tool: "shutter",
      mount: "/tools/counter/",
      ...extra,
    });
  }

  function snap(document) {
    const barEl = document.querySelector(".rf-bar");
    const toggle = document.querySelector("a.rf-lang");
    return {
      bars: document.querySelectorAll(".rf-bar").length,
      lang: barEl?.getAttribute("lang") ?? "",
      cur: document.querySelector(".rf-cur")?.textContent ?? "",
      tools: document.querySelector(".rf-btn")?.textContent.trim() ?? "",
      nav: document.querySelector(".rf-menu")?.getAttribute("aria-label") ?? "",
      home: document.querySelector(".rf-logo")?.getAttribute("aria-label") ?? "",
      back: document.querySelector(".rf-home .rf-t")?.textContent ?? "",
      toggle: toggle?.textContent ?? "",
      toggleLang: toggle?.getAttribute("lang") ?? "",
      toggleHref: toggle?.getAttribute("href") ?? "",
      hrefs: [...document.querySelectorAll(".rf-menu a")].map((link) => link.getAttribute("href")),
    };
  }

  it("reads a custom mount from the page instead of guessing an en segment", () => {
    const { window, document } = mounted();
    const place = window.rfLang.place(location.pathname);
    assert.equal(place.site.id, "shutter");
    assert.equal(place.site.base, "/shutter/");
    assert.equal(place.site.en, true);
    assert.equal(place.lang, "zh");
    assert.equal(place.rest, "");
    assert.equal(place.mount, "/tools/counter/");
    assert.equal(window.rfLang.href("en"), "/tools/counter/en/?demo=1#success");
    assert.deepEqual(snap(document), {
      bars: 1,
      lang: "zh-CN",
      cur: "快门计数",
      tools: "工具",
      nav: "切换工具",
      home: "rende.fun 主站",
      back: "回到主站",
      toggle: "EN",
      toggleLang: "en",
      toggleHref: "/tools/counter/en/?demo=1#success",
      hrefs: ["/easypic/", "/shutter/", "/recipes/", "/"],
    });
    const english = bar({
      pathname: "/tools/counter/en/",
      search: "?demo=1",
      hash: "#success",
      tool: "shutter",
      mountName: "sc-mount",
      mount: "/tools/counter/",
    });
    assert.equal(english.window.rfLang.place("/tools/counter/en/").lang, "en");
    assert.equal(english.window.rfLang.href("zh"), "/tools/counter/?demo=1&lang=zh#success");
    assert.equal(english.window.rfLang.href("en"), "/tools/counter/en/?demo=1#success");
    assert.equal(snap(english.document).lang, "en");
    assert.equal(snap(english.document).cur, "ShutterCount");
    assert.equal(snap(english.document).toggle, "中文");
    assert.equal(snap(english.document).toggleHref, "/tools/counter/?demo=1&lang=zh#success");
    assert.deepEqual(
      english.window.rfLang.sites.map((site) => site.en),
      [true, true, true, true],
    );
    assert.deepEqual(snap(english.document).hrefs, ["/easypic/en/", "/shutter/en/", "/recipes/en/", "/en/"]);
  });

  it("keeps root and known mounts, and leaves undeclared main paths alone", () => {
    const root = bar({ pathname: "/en/guide", search: "?demo=1", hash: "#x", tool: "shutter", mount: "/" });
    const rooted = root.window.rfLang.place("/en/guide");
    assert.equal(rooted.site.id, "shutter");
    assert.equal(rooted.lang, "en");
    assert.equal(rooted.rest, "guide");
    assert.equal(rooted.mount, "/");
    assert.equal(root.window.rfLang.href("zh"), "/guide?demo=1&lang=zh#x");
    assert.equal(snap(root.document).cur, "ShutterCount");
    const known = bar({ pathname: "/shutter/en/", tool: "shutter", mount: "/shutter/" });
    assert.equal(known.window.rfLang.href("zh"), "/shutter/?lang=zh");
    assert.equal(known.window.rfLang.place("/shutter/en/").site.base, "/shutter/");
    const plain = bar({ pathname: "/tools/counter/en/" });
    assert.equal(plain.window.rfLang.place("/tools/counter/en/").site.id, "home");
    assert.equal(plain.window.rfLang.place("/tools/counter/en/").lang, "zh");
    assert.equal(plain.window.rfLang.href("en"), "/en/tools/counter/en/");
    const home = bar({ pathname: "/en/tools/counter/en/" });
    assert.equal(home.window.rfLang.place("/en/tools/counter/en/").lang, "en");
    assert.equal(home.window.rfLang.place("/en/tools/counter/en/").rest, "tools/counter/en/");
    assert.equal(home.window.rfLang.place("/easypic/").site.id, "easypic");
  });

  it("rejects mount declarations outside this origin or this path", () => {
    const bad = [
      "https://evil.example/tools/counter/",
      "//evil.example/tools/counter/",
      "https://rende.fun.evil.example/tools/counter/",
      "http://rende.fun/tools/counter/",
      "javascript:alert(1)",
      "tools/counter/",
      "/tools/counter/../secret/",
      "/tools//counter/",
      "https://rende.fun/tools/counter/?x=1",
      "/elsewhere/",
    ];
    for (const mount of bad) {
      const { window, document } = bar({
        pathname: "/tools/counter/en/",
        search: "?demo=1",
        hash: "#success",
        tool: "shutter",
        mount,
      });
      const place = window.rfLang.place("/tools/counter/en/");
      assert.equal(place.site.id, "home", mount);
      assert.equal(place.lang, "zh", mount);
      assert.equal(window.rfLang.href("en"), "/en/tools/counter/en/?demo=1#success", mount);
      assert.equal(document.querySelector(".rf-bar").getAttribute("lang"), "zh-CN", mount);
    }
    const absolute = bar({
      pathname: "/tools/counter/en/",
      tool: "shutter",
      mount: "https://rende.fun/tools/counter/",
    });
    assert.equal(absolute.window.rfLang.place("/tools/counter/en/").mount, "/tools/counter/");
    assert.equal(absolute.window.rfLang.href("zh"), "/tools/counter/?lang=zh");
  });

  it("refreshes once after an in-memory switch, including back and forward", () => {
    const local = memoryStorage();
    const { window, document } = mounted({ storage: { localStorage: local }, body: '<p id="result">12,480</p>' });
    const rf = window.rfLang;
    const originals = Object.fromEntries(kept.map((key) => [key, rf[key]]));
    assert.equal(document.querySelector("#result").textContent, "12,480");
    location.pathname = "/tools/counter/en/";
    assert.equal(document.querySelector(".rf-bar").getAttribute("lang"), "zh-CN");
    assert.equal(rf.choose("en"), true);
    document.dispatchEvent(new window.Event("rf:locale"));
    document.dispatchEvent(new window.Event("rf:locale"));
    const shown = snap(document);
    assert.equal(shown.bars, 1);
    assert.equal(shown.lang, "en");
    assert.equal(shown.cur, "ShutterCount");
    assert.equal(shown.tools, "Tools");
    assert.equal(shown.nav, "Switch tool");
    assert.equal(shown.home, "rende.fun home");
    assert.equal(shown.back, "Back to home");
    assert.equal(shown.toggle, "中文");
    assert.equal(shown.toggleLang, "zh-CN");
    assert.equal(shown.toggleHref, "/tools/counter/?demo=1&lang=zh#success");
    assert.deepEqual(shown.hrefs, ["/easypic/en/", "/shutter/en/", "/recipes/en/", "/en/"]);
    assert.equal(document.querySelector("#result").textContent, "12,480");
    assert.equal(local.items.get("rf-lang"), "en");
    for (const key of kept) assert.equal(rf[key], originals[key], key);
    vm.runInThisContext(read("shell/lang.js"));
    for (const key of kept) assert.equal(window.rfLang[key], originals[key], key);
    const button = document.querySelector(".rf-btn");
    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "true");
    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "false");
    location.pathname = "/tools/counter/";
    window.dispatchEvent(new window.Event("popstate"));
    assert.equal(snap(document).lang, "zh-CN");
    assert.equal(snap(document).toggleHref, "/tools/counter/en/?demo=1#success");
    location.pathname = "/tools/counter/en/";
    window.dispatchEvent(new window.Event("popstate"));
    assert.equal(snap(document).lang, "en");
    assert.equal(snap(document).toggle, "中文");
    const recipes = bar({ pathname: "/lab/recipes/en/12", search: "?a=1", hash: "#n", tool: "recipes", mount: "/lab/recipes/" });
    assert.equal(recipes.window.rfLang.place("/lab/recipes/en/12").site.id, "recipes");
    assert.equal(recipes.window.rfLang.place("/lab/recipes/en/12").rest, "12");
    assert.equal(recipes.window.rfLang.href("zh"), "/lab/recipes/12?a=1&lang=zh#n");
    location.pathname = "/lab/recipes/12";
    recipes.document.dispatchEvent(new recipes.window.Event("rf:locale"));
    assert.equal(recipes.document.querySelector(".rf-cur").textContent, "家常菜本");
    assert.equal(recipes.window.rfLang.sites.find((site) => site.id === "recipes").en, true);
  });

  it("keeps an explicit Chinese choice on in-memory links when storage is blocked", () => {
    const { window, document } = bar({
      pathname: "/tools/counter/en/",
      search: "?demo=1",
      hash: "#success",
      tool: "shutter",
      mount: "/tools/counter/",
      storage: { localStorage: blockedStorage, cookieBlocked: true },
      body: '<a data-rf-site="easypic" href="/easypic/">e</a>',
    });
    assert.equal(window.rfLang.choose("zh"), false);
    location.pathname = "/tools/counter/";
    location.search = "?demo=1&lang=zh";
    document.dispatchEvent(new window.Event("rf:locale"));
    assert.equal(document.querySelector("a.rf-lang").getAttribute("href"), "/tools/counter/en/?demo=1#success");
    assert.equal(document.querySelector('a[data-rf-site="easypic"]').getAttribute("href"), "/easypic/?lang=zh");
    assert.equal(document.querySelector(".rf-logo").getAttribute("href"), "/?lang=zh");
    assert.doesNotThrow(() => document.querySelector("a.rf-lang").click());
  });

  it("refreshes /pics in place, keeps listeners, and returns focus to the switch", () => {
    const undeclared = bar({ pathname: "/pics/en/", tool: "easypic" });
    assert.equal(undeclared.window.rfLang.place("/pics/en/").site.id, "home");
    assert.equal(undeclared.window.rfLang.href("en"), "/en/pics/en/");
    assert.equal(undeclared.document.querySelector(".rf-bar").getAttribute("lang"), "zh-CN");
    const counts = { click: 0, keydown: 0, hashchange: 0 };
    const { window, document } = bar({
      pathname: "/pics/en/",
      tool: "easypic",
      mount: "/pics/",
      body: '<img id="photo" alt="user">',
      beforeRun({ document: page, window: view }) {
        let active = page.body;
        Object.defineProperty(page, "activeElement", {
          configurable: true,
          get() {
            return active && active.isConnected ? active : page.body;
          },
        });
        const proto = view.HTMLElement.prototype;
        const origFocus = proto.focus;
        proto.focus = function focus() {
          active = this;
          return origFocus.call(this);
        };
        const watch = (target, names) => {
          const orig = target.addEventListener;
          target.addEventListener = function (type, ...rest) {
            if (names.includes(type)) counts[type] += 1;
            return orig.call(this, type, ...rest);
          };
        };
        watch(page, ["click", "keydown"]);
        watch(view, ["hashchange"]);
      },
    });
    const place = window.rfLang.place("/pics/en/");
    assert.equal(place.site.id, "easypic");
    assert.equal(place.site.base, "/easypic/");
    assert.equal(place.site.en, true);
    assert.equal(place.lang, "en");
    assert.equal(place.mount, "/pics/");
    assert.equal(window.rfLang.href("zh"), "/pics/?lang=zh");
    assert.equal(window.rfLang.href("en"), "/pics/en/");
    assert.equal(document.querySelector(".rf-bar").getAttribute("lang"), "en");
    assert.equal(document.querySelector("a.rf-lang").getAttribute("href"), "/pics/?lang=zh");
    assert.deepEqual(snap(document).hrefs, ["/easypic/en/", "/shutter/en/", "/recipes/en/", "/en/"]);
    const header = document.querySelector(".rf-bar");
    const scripts = document.querySelectorAll('script[src*="topbar.js"]').length;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        const link = target && target.closest ? target.closest("a.rf-lang") : null;
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        location.pathname = location.pathname === "/pics/en/" ? "/pics/" : "/pics/en/";
        document.dispatchEvent(new window.Event("rf:locale"));
      },
      true,
    );
    const started = { ...counts };
    for (let i = 0; i < 5; i += 1) {
      const toggle = document.querySelector("a.rf-lang");
      toggle.focus();
      toggle.dispatchEvent(new document.defaultView.Event("click", { bubbles: true, cancelable: true }));
      const next = document.querySelector("a.rf-lang");
      assert.equal(document.activeElement, next);
      assert.notEqual(document.activeElement, document.body);
      assert.equal(document.querySelector(".rf-bar"), header);
      assert.equal(document.querySelector("#photo").isConnected, true);
    }
    assert.deepEqual(counts, started);
    assert.equal(document.querySelectorAll('script[src*="topbar.js"]').length, scripts);
    assert.equal(window.__rfBar, 1);
    vm.runInThisContext(read("shell/topbar.js"));
    assert.deepEqual(counts, started);
    assert.equal(document.querySelector(".rf-bar"), header);
    assert.equal(document.querySelector("#photo").isConnected, true);
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
