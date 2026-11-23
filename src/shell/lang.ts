/* rende.fun zh/en routing. Inline in <head> as <script data-rf-enter> to pick a language before paint; topbar.js bundles a copy without entering. */
type RfLangCode = "zh" | "en";

interface RfSite {
  id: string;
  base: string;
  en: boolean;
}

interface RfPlace {
  site: RfSite;
  lang: RfLangCode;
  rest: string;
  mount: string;
}

interface RfLangApi {
  v: number;
  sites: readonly RfSite[];
  // True once enter() has called location.replace(); later head scripts (analytics) should skip.
  leaving: boolean;
  place(pathname: string): RfPlace;
  match(tags: readonly unknown[]): RfLangCode | null;
  pref(): RfLangCode | null;
  choose(lang: RfLangCode): boolean;
  offers(lang: RfLangCode): boolean;
  href(lang: RfLangCode): string;
  siteHref(id: string): string;
  enter(): void;
}

interface Window {
  rfLang?: RfLangApi;
}

(function () {
  const V = 2;
  const KEY = "rf-lang";
  const HREFLANG: Record<RfLangCode, string> = { zh: "zh-CN", en: "en" };

  // Longest base first. Set en: true only after that site serves <base>en/.
  const SITES: readonly RfSite[] = [
    { id: "easypic", base: "/easypic/", en: false },
    { id: "shutter", base: "/shutter/", en: false },
    { id: "recipes", base: "/recipes/", en: false },
    { id: "home", base: "/", en: true },
  ];

  // <meta name="rf-mount">, or the existing shutter <meta name="sc-mount">, plus
  // <script data-tool="id">. Ignored unless it is a clean same-origin path, names
  // a known tool, and this URL sits under it. A registered tool prefix still wins.
  const mountPath = (raw: string | null): string => {
    const text = (raw ?? "").trim();
    if (!text || /[\s?#\\%]/.test(text) || text.includes("..") || text.startsWith("//")) return "";
    let path = text;
    if (!text.startsWith("/")) {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return "";
      }
      if (url.origin !== location.origin || url.search || url.hash) return "";
      path = url.pathname;
    }
    if (!path.endsWith("/")) path += "/";
    return path.split("/").slice(1, -1).every((part) => part !== "" && part !== ".") ? path : "";
  };

  const covers = (path: string, base: string): boolean => path.indexOf(base) === 0 || `${path}/` === base;

  const declared = (): { site: RfSite; base: string } | null => {
    const named = document.querySelector('meta[name="rf-mount"]');
    const raw = named
      ? named.getAttribute("content")
      : document.querySelector('meta[name="sc-mount"]')?.getAttribute("content");
    const base = mountPath(raw ?? null);
    const tool = document.querySelector("script[data-tool]")?.getAttribute("data-tool");
    const site = SITES.find((item) => item.id === tool && item.id !== "home");
    const path = location.pathname || "/";
    if (!base || !site || !covers(path, base)) return null;
    return { site, base };
  };

  const cut = (site: RfSite, base: string, path: string): RfPlace => {
    let rest = path.indexOf(base) === 0 ? path.slice(base.length) : "";
    let lang: RfLangCode = "zh";
    if (rest === "en" || rest.indexOf("en/") === 0) {
      lang = "en";
      rest = rest.slice(3);
    }
    // A leading "//" would turn base + rest into a protocol-relative URL on another origin.
    return { site, lang, rest: rest.replace(/^\/+/, ""), mount: base };
  };

  const place = (pathname: string): RfPlace => {
    const path = pathname || "/";
    const known = SITES.find((site) => site.id !== "home" && covers(path, site.base));
    if (known) return cut(known, known.base, path);
    const over = declared();
    if (over && covers(path, over.base)) return cut(over.site, over.base, path);
    const home = SITES[SITES.length - 1];
    return cut(home, home.base, path);
  };

  const match = (tags: readonly unknown[]): RfLangCode | null => {
    for (const tag of tags) {
      const primary = String(tag).toLowerCase().split(/[-_]/)[0];
      if (primary === "zh" || primary === "en") return primary;
    }
    return null;
  };

  const pref = (): RfLangCode | null => {
    let value: string | null = null;
    try {
      value = localStorage.getItem(KEY);
    } catch {
      value = null;
    }
    if (value !== "zh" && value !== "en") {
      try {
        value = /(?:^|;\s*)rf-lang=(zh|en)(?:;|$)/.exec(document.cookie)?.[1] ?? null;
      } catch {
        value = null;
      }
    }
    return value === "zh" || value === "en" ? value : null;
  };

  const choose = (lang: RfLangCode): boolean => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      try {
        const secure = location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${KEY}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      } catch {
        return false;
      }
    }
    return pref() === lang;
  };

  const offers = (lang: RfLangCode): boolean =>
    !!document.querySelector(`link[rel="alternate"][hreflang="${HREFLANG[lang]}"]`);

  const explicitZh = (): boolean => /(?:^|[?&])lang=zh(?:&|$)/.test(location.search || "");

  // Keeps every other query parameter byte for byte; only the lang marker changes.
  const query = (zh: boolean): string => {
    const parts = (location.search || "")
      .replace(/^\?/, "")
      .split("&")
      .filter((part) => part && part.split("=")[0] !== "lang");
    if (zh) parts.push("lang=zh");
    return parts.length ? `?${parts.join("&")}` : "";
  };

  const href = (lang: RfLangCode): string => {
    const here = place(location.pathname);
    return `${here.mount}${lang === "en" ? "en/" : ""}${here.rest}${query(lang === "zh")}${location.hash || ""}`;
  };

  const siteHref = (id: string): string => {
    const site = SITES.find((s) => s.id === id) ?? SITES[SITES.length - 1];
    if (place(location.pathname).lang === "en") return site.en ? `${site.base}en/` : site.base;
    // Without storage the explicit zh choice only survives in the URL, so carry it.
    return explicitZh() && pref() !== "zh" ? `${site.base}?lang=zh` : site.base;
  };

  const enter = (): void => {
    if (place(location.pathname).lang === "en" || explicitZh()) return;
    const languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    const want = pref() ?? match(languages) ?? "en";
    if (want === "en" && offers("en")) {
      api.leaving = true;
      location.replace(href("en"));
    }
  };

  const host = window;
  const api: RfLangApi = { v: V, sites: SITES, leaving: false, place, match, pref, choose, offers, href, siteHref, enter };
  if (!host.rfLang || host.rfLang.v < V) host.rfLang = api;
  const script = document.currentScript;
  if (script && script.hasAttribute("data-rf-enter")) host.rfLang.enter();
})();
