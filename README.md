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
    lang.js         # current zh/en router, unversioned alias
    topbar.js       # current lang.js + the bar, unversioned alias
    topbar.css      # current bar css, unversioned alias
    manifest.json   # git commit plus sha256 of the current files
    lang.<sha256>.js
    topbar.<sha256>.js
    topbar.<sha256>.css
  assets/
    me.jpg
    me-560.jpg
```

Point the `rende.fun` server at that directory. If a deploy checks out this repo and publishes `dist/` as `/opt/site/current`, the root is `/opt/site/current`. If `current` is the repo tree, the root is `/opt/site/current/dist`. This repo does not change the server.

This site publishes the shared bar under the sha256 of the exact bytes it serves. `dist/shell/manifest.json` records those hashes, and the git commit when the build directory itself contains `.git`. The deploy receiver extracts an archive, so the production trace is the `REVISION` file it writes after a successful build. Other sites on the same host embed the current topbar with:

```html
<script src="/shell/topbar.<sha256>.js" defer></script>
```

`<sha256>` is `current.topbar.sha256` from that manifest. It is not a query string, not a page URL, and not `rfLang.v` (`v` stays 2). The script inserts a 48px fixed bar, loads `topbar.<sha256>.css` from the script's directory, and adds `rf-has-bar` on `<html>` so `body` gets `padding-top: 48px`. Optional attributes: `data-tool="easypic|shutter|recipes"` and `data-home="/"`. Any `position: fixed` or `position: sticky` element that used to sit at `top: 0` should use `top: var(--rf-h, 0px)` so it clears the bar. Do not set a z-index above `2147483000`.

`/shell/topbar.js`, `/shell/lang.js`, and `/shell/topbar.css` remain copies of the current bytes for pages that still use those names. They are mutable. A browser that already stored an older response for `/shell/topbar.js` keeps using it; the hashed URL is a different cache key. Do not add `?v=` or `?version=`.

## Languages

Chinese keeps the unprefixed URLs. English lives under each site's own `en/`: `/en/`, `/easypic/en/`, `/shutter/en/`, `/recipes/en/`. The design is `docs/superpowers/specs/2026-11-23-sites-i18n-design.md`.

`src/shell/lang.ts` is the only place that knows the sites and how URLs map between languages. It installs `window.rfLang`. On a page that loads it as `<script data-rf-enter>` in `<head>`, it picks the language before the page renders:

1. A URL under `en/` is English, and `?lang=zh` on an unprefixed URL is Chinese. Neither is overridden.
2. Otherwise a choice made with the bar's switch (`localStorage["rf-lang"]`, or the `rf-lang` cookie when storage fails).
3. Otherwise the first `zh*` or `en*` entry in `navigator.languages`.
4. Otherwise English.

It only ever moves an unprefixed page to its `en/` counterpart, keeping the rest of the path, the query, and the hash. English pages never redirect, so it cannot loop. A page that does not declare `<link rel="alternate" hreflang="en">` never redirects.

The build inlines `lang.js` into `index.html` and prepends it to `topbar.js` (`v` 2 replaces an older inlined copy), so pages that only load the bar still get `window.rfLang` (without the redirect). The bar follows the page URL's language, shows the switch only when the page declares the other language with `<link rel="alternate" hreflang="zh-CN|en">`, and rewrites its links and any `a[data-rf-site="<id>"]` on the page. When storage is disabled, an explicit `?lang=zh` is carried on those links so the next tool does not fall back to English.

A tool served outside its registry prefix says so with `<meta name="rf-mount" content="/tools/counter/">` (EasyPic at `/pics/` uses `content="/pics/"`) and `data-tool="shutter|easypic|recipes"` on the bar script. The existing `<meta name="sc-mount">` is accepted too. The value must be a clean same-origin path under the current URL; anything else is ignored, and `/easypic/`, `/shutter/`, and `/recipes/` keep their registry meaning. `place().mount` is that prefix. `place().site.base` stays the live prefix. easypic, shutter, and recipes are `en: true`, so an English page links each of them to its `/en/`. A Chinese page keeps the unprefixed path.

```html
<meta name="rf-mount" content="/pics/" />
<script src="/shell/topbar.<sha256>.js" defer data-tool="easypic"></script>
```

After an in-memory `pushState` or `replaceState`, once the URL, `html lang`, title, and hreflang links match, dispatch the change in the same turn. `dispatchEvent` returns only after the existing `.rf-bar` matches the URL. Call `choose(lang)` yourself when the visitor picked it. The bar listens once, rebuilds the children of that same header, and puts focus back on the switch when it had focus. It does not wrap `place` or `href`, fetch `topbar.js` again, or touch the rest of the page. Leave `window.__rfBar` and the header in place; deleting either and inserting the script again stacks listeners and depends on the network. Back and forward refresh from `popstate`.

```js
history.pushState(null, "", nextUrl);
rfLang.choose(nextLang);
document.dispatchEvent(new Event("rf:locale"));
```

To bring a tool into English: serve `<base>en/`, add `canonical` and `hreflang` links (`zh-CN`, `en`, `x-default` → English) to both versions, inline `/shell/lang.js` with `data-rf-enter` after those links in the zh entry, and keep API and asset URLs anchored at the tool's base. Start any analytics snippet after it with `if (window.rfLang && window.rfLang.leaving) return;`. Drop `data-home` on bilingual pages. An inlined copy carries the site table it was built with, so copy it again when any `en` flag changes. easypic, shutter, and recipes are already `en: true`. A later tool stays off until its own `/en/` is live.

## Shell cache

Hashed files live in a directory outside the release. Nginx reads them from `/opt/site/shared` (`/opt/site/shared/shell/<file>`), not from `/opt/site/current`. The receiver still switches `current` only after the build exits 0, and it deletes old releases. That must not delete a hash a child page already requested.

Provision the directory once. This repo does not create it:

```sh
sudo mkdir -p /opt/site/shared/shell
sudo chown rende-deploy:rende-deploy /opt/site/shared /opt/site/shared/shell
sudo chmod 755 /opt/site/shared /opt/site/shared/shell
```

The path has to be a real directory, not a symlink. The deploy user's files are mode 644. Set the site build command, which `receive-deploy.sh` already accepts, to:

```sh
export RF_SHELL_SHARED=/opt/site/shared/shell && npm ci && npm run build
```

The copy writes a temp file in that directory, links it into place, and reads it back. The same bytes are a no-op. Different bytes at the same name fail the build, and `current` stays where it was. A missing hash is `404` with `Cache-Control: no-store`. A file that exists is `public, max-age=31536000, immutable`. Do not request a hash on the public edge until this origin returns 200; a cached 404 would keep the URL missing.

`deploy/nginx-shell-cache.conf` is the location block to add. It is not installed from here. Unversioned `/shell/topbar.js`, `/shell/lang.js`, `/shell/topbar.css`, `/shell/manifest.json`, `/`, and `/en/` stay `no-cache` and still come from the current release.

EasyPic, Shutter, and Recipes change `src` only after that 200. Recipes must inline the exact bytes of `lang.<sha256>.js` from the same manifest. The topbar replaces an inlined copy only when its `v` is below 2. Do not bump `v` to expire a cache. Rolling `current` back, redeploying an older commit, or deleting release directories leaves the shared files in place.

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
