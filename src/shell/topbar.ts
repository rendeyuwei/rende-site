/* rende.fun shell top bar. <script src="/shell/topbar.js" defer></script> */
(function () {
  type Text = Record<RfLangCode, string>;

  interface Tool {
    id: string;
    name: Text;
    d: Text;
    bg: string;
    fg: string;
    m: string;
  }

  const TOOLS: readonly Tool[] = [
    {
      id: "easypic",
      name: { zh: "EasyPic", en: "EasyPic" },
      d: { zh: "图片压缩与格式转换", en: "Image compression and format conversion" },
      bg: "#0c0d0f",
      fg: "#efac4b",
      m: "EP",
    },
    {
      id: "shutter",
      name: { zh: "快门计数", en: "ShutterCount" },
      d: { zh: "从原图读取快门次数", en: "Read shutter count from an original photo" },
      bg: "#1b1e22",
      fg: "#efac4b",
      m: "SC",
    },
    {
      id: "recipes",
      name: { zh: "家常菜本", en: "Home Recipes" },
      d: { zh: "做过的菜，记下来", en: "Dishes I've cooked, written down" },
      bg: "#CFE0D6",
      fg: "#1B3A8C",
      m: "菜",
    },
  ];

  const COPY = {
    zh: { home: "rende.fun 主站", back: "回到主站", tools: "工具", nav: "切换工具", all: "全部工具" },
    en: { home: "rende.fun home", back: "Back to home", tools: "Tools", nav: "Switch tool", all: "All tools" },
  };

  const host = window as Window & { __rfBar?: number };
  if (host.__rfBar) return;
  // scripts/copy-static.mjs prepends shell/lang.js to this file.
  const rf = host.rfLang;
  if (!rf) return;
  host.__rfBar = 1;

  const current = document.currentScript;
  const script = current && current.nodeName === "SCRIPT" ? (current as HTMLScriptElement) : null;
  const base = script?.src ? script.src.replace(/topbar\.js.*$/, "") : "/shell/";
  const homeHref = (): string => script?.dataset.home || rf.siteHref("home");

  if (!document.querySelector("link[data-rf]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${base}topbar.css`;
    link.dataset.rf = "1";
    document.head.appendChild(link);
  }

  const bar = document.createElement("header");
  bar.className = "rf-bar";
  bar.setAttribute("role", "banner");
  let menu = document.createElement("nav");
  let button = document.createElement("button");

  const swatch = (bg: string, fg: string, mark: string): HTMLSpanElement => {
    const sw = document.createElement("span");
    sw.className = "rf-sw";
    sw.setAttribute("aria-hidden", "true");
    sw.style.background = bg;
    sw.style.color = fg;
    sw.textContent = mark;
    return sw;
  };

  // Rebuild after a same-document language change. Dispatch "rf:locale" once the
  // URL, html lang, title, and hreflang links match. popstate refreshes too.
  const render = (): void => {
    const keepFocus = document.activeElement?.classList.contains("rf-lang") === true;
    const here = rf.place(location.pathname);
    const lang = here.lang;
    const text = COPY[lang];
    const currentId = script?.dataset.tool || (here.site.id === "home" ? "" : here.site.id);
    const active = TOOLS.find((tool) => tool.id === currentId);
    bar.lang = lang === "en" ? "en" : "zh-CN";
    bar.replaceChildren();

    const logo = document.createElement("a");
    logo.className = "rf-logo";
    logo.href = homeHref();
    logo.setAttribute("aria-label", text.home);
    logo.innerHTML = '<span class="rf-wm">rende</span><span class="rf-tag">fun</span>';
    bar.appendChild(logo);

    if (active) {
      const sep = document.createElement("span");
      sep.className = "rf-sep";
      const label = document.createElement("span");
      label.className = "rf-cur";
      label.textContent = active.name[lang];
      bar.append(sep, label);
    }

    const spacer = document.createElement("span");
    spacer.className = "rf-sp";
    bar.appendChild(spacer);

    if (active) {
      const back = document.createElement("a");
      back.className = "rf-home";
      back.href = homeHref();
      back.setAttribute("aria-label", text.back);
      back.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span class="rf-t"></span>';
      const backText = back.querySelector(".rf-t");
      if (backText) backText.textContent = text.back;
      bar.appendChild(back);
    }

    const other: RfLangCode = lang === "en" ? "zh" : "en";
    if (rf.offers(other)) {
      const toggle = document.createElement("a");
      toggle.className = "rf-lang";
      toggle.lang = other === "en" ? "en" : "zh-CN";
      toggle.hreflang = toggle.lang;
      toggle.href = rf.href(other);
      toggle.textContent = other === "en" ? "EN" : "中文";
      toggle.title = other === "en" ? "Switch to English" : "切换到中文";
      toggle.addEventListener("click", () => {
        rf.choose(other);
        toggle.href = rf.href(other);
      });
      bar.appendChild(toggle);
    }

    button = document.createElement("button");
    button.className = "rf-btn";
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "rf-menu");
    button.append(`${text.tools} `);
    button.insertAdjacentHTML(
      "beforeend",
      '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    );
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) menu.querySelector("a")?.focus();
    });

    menu = document.createElement("nav");
    menu.className = "rf-menu";
    menu.id = "rf-menu";
    menu.setAttribute("aria-label", text.nav);
    for (const tool of TOOLS) {
      const link = document.createElement("a");
      link.href = rf.siteHref(tool.id);
      if (tool.id === currentId) link.setAttribute("aria-current", "page");
      const textBox = document.createElement("span");
      const name = document.createElement("span");
      name.className = "rf-n";
      name.textContent = tool.name[lang];
      const desc = document.createElement("span");
      desc.className = "rf-d";
      desc.textContent = tool.d[lang];
      textBox.append(name, desc);
      link.append(swatch(tool.bg, tool.fg, tool.m), textBox);
      menu.appendChild(link);
    }
    const rule = document.createElement("hr");
    const all = document.createElement("a");
    all.href = homeHref();
    const allName = document.createElement("span");
    allName.className = "rf-n";
    allName.textContent = text.all;
    all.append(swatch("#2A2D33", "#7FD1AE", "↖"), allName);
    menu.append(rule, all);
    bar.append(button, menu);

    for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-rf-site]")) {
      link.href = rf.siteHref(link.dataset.rfSite || "home");
    }
    const toggle = bar.querySelector("a.rf-lang");
    if (keepFocus && toggle && "focus" in toggle && typeof toggle.focus === "function") toggle.focus();
  };

  const mount = (): void => {
    if (!bar.parentNode) document.body.insertBefore(bar, document.body.firstChild);
    document.documentElement.classList.add("rf-has-bar");
  };
  render();
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  window.addEventListener("hashchange", () => {
    const toggle = bar.querySelector("a.rf-lang");
    if (toggle) toggle.setAttribute("href", rf.href(toggle.getAttribute("lang") === "en" ? "en" : "zh"));
  });
  document.addEventListener("rf:locale", render);
  window.addEventListener("popstate", render);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !bar.contains(target as Node)) {
      menu.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("open")) {
      menu.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
  });
})();
