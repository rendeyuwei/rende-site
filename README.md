# rende-site

Static main site for [rende.fun](https://rende.fun/). HTML and CSS stay as files. The small motion script and the shared top bar are TypeScript, compiled with `tsc` to plain scripts. There is no React app and no bundler.

## Scripts

Requires Node.js 22+.

```bash
npm ci
npm test          # typecheck, compile, copy dist/, smoke tests
npm run lint      # tsc --noEmit
npm run build     # write dist/
npm run preview   # build, then serve dist/ at http://127.0.0.1:4173
```

Open the preview from that server. Paths are absolute (`/shell/topbar.js`), so opening `index.html` as a file will not load the scripts.

## Nginx document root

`npm run build` writes a directory that can be used as the site root:

```text
dist/
  index.html        # zh, with the language decision inlined
  en/
    index.html      # en
  site.css
  motion.js
  favicon.svg
  apple-touch-icon.png
  shell/
    lang.js         # zh/en router (window.rfLang)
    topbar.js       # lang.js + the bar
    topbar.css
  assets/
    me.jpg
    me-560.jpg
```

Point the `rende.fun` server at that directory. If a deploy checks out this repo and publishes `dist/` as `/opt/site/current`, the root is `/opt/site/current`. If `current` is the repo tree, the root is `/opt/site/current/dist`. This repo does not change the server.

This site serves the shared bar at `/shell/topbar.js` (and `/shell/topbar.css` next to it). Other sites on the same host embed it with:

```html
<script src="/shell/topbar.js" defer></script>
```

The script inserts a 48px fixed bar, loads its CSS from the script URL, and adds `rf-has-bar` on `<html>` so `body` gets `padding-top: 48px`. Optional attributes: `data-tool="easypic|shutter|recipes"` and `data-home="/"`. Any `position: fixed` or `position: sticky` element that used to sit at `top: 0` should use `top: var(--rf-h, 0px)` so it clears the bar. Do not set a z-index above `2147483000`.

## Languages

Chinese keeps the unprefixed URLs. English lives under each site's own `en/`: `/en/`, `/easypic/en/`, `/shutter/en/`, `/recipes/en/`. The design is `docs/superpowers/specs/2026-11-23-sites-i18n-design.md`.

`src/shell/lang.ts` is the only place that knows the sites and how URLs map between languages. It installs `window.rfLang`. On a page that loads it as `<script data-rf-enter>` in `<head>`, it picks the language before the page renders:

1. A URL under `en/` is English, and `?lang=zh` on an unprefixed URL is Chinese. Neither is overridden.
2. Otherwise a choice made with the bar's switch (`localStorage["rf-lang"]`, or the `rf-lang` cookie when storage fails).
3. Otherwise the first `zh*` or `en*` entry in `navigator.languages`.
4. Otherwise English.

It only ever moves an unprefixed page to its `en/` counterpart, keeping the rest of the path, the query, and the hash. English pages never redirect, so it cannot loop. A page that does not declare `<link rel="alternate" hreflang="en">` never redirects.

The build inlines `lang.js` into `index.html` and prepends it to `topbar.js` (`v` 2 replaces an older inlined copy), so pages that only load the bar still get `window.rfLang` (without the redirect). The bar follows the page URL's language, shows the switch only when the page declares the other language with `<link rel="alternate" hreflang="zh-CN|en">`, and rewrites its links and any `a[data-rf-site="<id>"]` on the page. When storage is disabled, an explicit `?lang=zh` is carried on those links so the next tool does not fall back to English.

A tool served outside its registry prefix says so with `<meta name="rf-mount" content="/tools/counter/">` and `data-tool="shutter|easypic|recipes"` on the bar script. The existing `<meta name="sc-mount">` is accepted too. The value must be a clean same-origin path under the current URL; anything else is ignored, and `/easypic/`, `/shutter/`, and `/recipes/` keep their registry meaning. `place().mount` is that prefix. `place().site.base` stays the live prefix, and `site.en` stays `false` until that tool's English is actually in production.

After an in-memory `pushState` or `replaceState`, once the URL, `html lang`, title, and hreflang links match, dispatch the change. Call `choose(lang)` yourself when the visitor picked it. The bar listens once and rebuilds; it does not wrap `place` or `href`. Back and forward refresh from `popstate`.

```js
history.pushState(null, "", nextUrl);
rfLang.choose(nextLang);
document.dispatchEvent(new Event("rf:locale"));
```

To bring a tool into English: serve `<base>en/`, add `canonical` and `hreflang` links (`zh-CN`, `en`, `x-default` → English) to both versions, inline `/shell/lang.js` with `data-rf-enter` after those links in the zh entry, and keep API and asset URLs anchored at the tool's base. Start any analytics snippet after it with `if (window.rfLang && window.rfLang.leaving) return;`. Drop `data-home` on bilingual pages. An inlined copy carries the site table it was built with, so copy it again when any `en` flag changes. Once that is live, set the tool's `en` to `true` in `src/shell/lang.ts` and deploy this site; until then the English home page links to the tool's Chinese entry.

## Deploy

`.github/workflows/ci.yml` runs lint and test on pull requests and on `main`.

`.github/workflows/deploy.yml` calls the shared workflow:

```yaml
uses: rendeyuwei/rende-deploy/.github/workflows/deploy-project.yml@main
with:
  project: site
```

As of 2026-10-15 that file is not on `rendeyuwei/rende-deploy` `main` yet (the repo only has a README). The caller is already in this shape. `project: site` means a static publish of `dist/`, with an HTTPS GET of `https://rende.fun/` expecting 200. Deploys queue (`cancel-in-progress: false`).

Secrets stay in this repository, not in rende-deploy: `ECS_HOST`, `ECS_USER`, `ECS_SSH_KEY`, `ECS_KNOWN_HOSTS`.

If the reusable workflow later requires `health_url`, `node_version`, or `build_commands`, add those inputs in `deploy.yml`. GitHub rejects inputs the called workflow does not declare. Suggested values when they exist: `health_url: https://rende.fun/`, `node_version: "22"`, `build_commands: npm ci && npm run build`.

## Page

The home page is the v2 design: graphite top bar, aurora hero, `rende` wordmark with a mint `.fun` chip, tool windows for EasyPic, 快门计数, and 家常菜本, a dashed “下一个工具还在做” row, an about section, and the footer `© 2026 任德 · rende.fun`. The page column matches the demo: `max-width: 1120px`. `public/en/index.html` is the same page in English (ShutterCount, Home Recipes); a test keeps its element structure identical to the Chinese page.

About text uses only the confirmed bio: Hangzhou, frontend engineer, photography / games / movies, the two personal emails, the optional secretary address `render@mail.grokbot.com`, GitHub, and X. The portrait is `assets/me.jpg` (1120×1680) with `assets/me-560.jpg` in `srcset`. Desktop and tablet show the full 2:3 frame, with the name under the photo. The phone layout is an 88px square; `object-position: 62% 96%` puts the face center (about x=345, y=550 on the 560×840 file; eyes near y=548) at the center of that square. The rows around y=378–432 are the tower roof.

Motion follows the demo: one-shot wordmark, scroll reveal, shutter count-up, hover tilt and spotlight on fine pointers, and a half-resolution aurora that pauses off-screen. `prefers-reduced-motion: reduce` skips those and draws a single aurora frame. `?freeze=<ms>` holds CSS animations at that time for screenshots.
