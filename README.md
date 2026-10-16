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
  index.html
  site.css
  motion.js
  favicon.svg
  apple-touch-icon.png
  shell/
    topbar.js
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

The home page is the v2 design: graphite top bar, aurora hero, `rende` wordmark with a mint `.fun` chip, tool windows for EasyPic, 快门计数, and 家常菜本, a dashed “下一个工具还在做” row, an about section, and the footer `© 2026 任德 · rende.fun`. The page column matches the demo: `max-width: 1120px`.

About text uses only the confirmed bio: Hangzhou, frontend engineer, photography / games / movies, the two personal emails, the optional secretary address `render@mail.grokbot.com`, GitHub, and X. The portrait is `assets/me.jpg` (1120×1680) with `assets/me-560.jpg` in `srcset`. Desktop and tablet show the full 2:3 frame, with the name under the photo. The phone layout is an 88px square; `object-position: 62% 96%` puts the face center (about x=345, y=550 on the 560×840 file; eyes near y=548) at the center of that square. The rows around y=378–432 are the tower roof.

Motion follows the demo: one-shot wordmark, scroll reveal, shutter count-up, hover tilt and spotlight on fine pointers, and a half-resolution aurora that pauses off-screen. `prefers-reduced-motion: reduce` skips those and draws a single aurora frame. `?freeze=<ms>` holds CSS animations at that time for screenshots.
