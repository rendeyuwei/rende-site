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
  const V = 1;
  const KEY = "rf-lang";
  const HREFLANG: Record<RfLangCode, string> = { zh: "zh-CN", en: "en" };

  // Longest base first. Set en: true only after that site serves <base>en/.
  const SITES: readonly RfSite[] = [
    { id: "easypic", base: "/easypic/", en: false },
    { id: "shutter", base: "/shutter/", en: false },
    { id: "recipes", base: "/recipes/", en: false },
    { id: "home", base: "/", en: true },
  ];

  const place = (pathname: string): RfPlace => {
    const path = pathname || "/";
    const site =
      SITES.find((s) => path.indexOf(s.base) === 0 || `${path}/` === s.base) ?? SITES[SITES.length - 1];
    let rest = path.slice(site.base.length);
    let lang: RfLangCode = "zh";
    if (rest === "en" || rest.indexOf("en/") === 0) {
      lang = "en";
      rest = rest.slice(3);
    }
    // A leading "//" would turn base + rest into a protocol-relative URL on another origin.
    return { site, lang, rest: rest.replace(/^\/+/, "") };
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
    return `${here.site.base}${lang === "en" ? "en/" : ""}${here.rest}${query(lang === "zh")}${location.hash || ""}`;
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
