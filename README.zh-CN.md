# rende-site

[rende.fun](https://rende.fun/) 主站。页面是静态 HTML / CSS。动效和共享顶栏用 TypeScript 编写，由 `tsc` 编译成普通脚本。没有 React，也没有打包器。

## 脚本

需要 Node.js 22+。

```bash
npm ci
npm test          # 类型检查、编译、复制 dist/、冒烟测试
npm run lint      # tsc --noEmit
npm run build     # 生成 dist/
npm run preview   # 构建后在 http://127.0.0.1:4173 提供 dist/
```

`npm test` 还需要本机的 `nginx` 和 Google Chrome（`google-chrome` 或 `google-chrome-stable`）。`npm ci` 会安装 `puppeteer-core`。CI 和 Deploy 用 `scripts/install-test-tools.sh` 安装这两个系统包。

请用上面的服务器打开预览。脚本路径是绝对路径（`/shell/topbar.js`），直接双击 `index.html` 加载不到。

## Nginx 文档根

`npm run build` 的输出可以直接当作站点根目录：

```text
dist/
  index.html        # 中文，内联了语言判定
  en/
    index.html      # 英文
  site.css
  motion.js
  favicon.svg
  apple-touch-icon.png
  shell/
    lang.js         # 当前中英文路由，无版本别名
    topbar.js       # 当前 lang.js + 顶栏，无版本别名
    topbar.css      # 当前顶栏样式，无版本别名
    manifest.json   # git commit，以及当前文件的 sha256
    lang.<sha256>.js
    topbar.<sha256>.js
    topbar.<sha256>.css
  assets/
    me.jpg
    me-560.jpg
    tipwink-icon.png
    cursor-paperCat.png
```

把 `rende.fun` 的 `root` 指到这个目录。如果部署把 `dist/` 发布成 `/opt/site/current`，根目录就是 `/opt/site/current`。如果 `current` 是仓库本身，根目录就是 `/opt/site/current/dist`。本仓库不改服务器上的 Nginx。

本站按实际响应字节的 sha256 发布共享顶栏。`dist/shell/manifest.json` 记下这些哈希；构建目录自己有 `.git` 时也记下 commit。部署接收器展开的是归档，没有 `.git`，成功之后它写入的 `REVISION` 才是线上的 commit 记录。同一台机器上的其他站点嵌入当前顶栏：

```html
<script src="/shell/topbar.<sha256>.js" defer></script>
```

`<sha256>` 是这份 manifest 里的 `current.topbar.sha256`。它不是 query，不是页面 URL，也不是 `rfLang.v`（`v` 保持 2）。脚本会插入 48px 的固定顶栏，从脚本所在目录加载 `topbar.<sha256>.css`，给 `<html>` 加上 `rf-has-bar`，从而让 `body` 有 `padding-top: 48px`。可选属性：`data-tool="easypic|shutter|recipes"` 和 `data-home="/"`。原来 `position: fixed` 或 `position: sticky` 且 `top: 0` 的元素应改成 `top: var(--rf-h, 0px)`，避免被顶栏挡住。不要把 z-index 设得高于 `2147483000`。

`/shell/topbar.js`、`/shell/lang.js`、`/shell/topbar.css` 仍是当前字节的副本，给还没换地址的页面用。这三个名字是可变的。浏览器如果已经存过旧的 `/shell/topbar.js`，会继续用那份；哈希 URL 是另一把缓存钥匙。不要加 `?v=` 或 `?version=`。

## 语言

中文沿用无前缀 URL。英文放在各站自己的 `en/` 下：`/en/`、`/easypic/en/`、`/shutter/en/`、`/recipes/en/`。设计见 `docs/superpowers/specs/2026-11-23-sites-i18n-design.md`。

只有 `src/shell/lang.ts` 知道有哪些站点、URL 在两种语言间怎么对应。它安装 `window.rfLang`。页面在 `<head>` 里以 `<script data-rf-enter>` 加载它时，会在渲染前决定语言：

1. `en/` 下的 URL 是英文；无前缀 URL 带 `?lang=zh` 是中文。两者都不会被覆盖。
2. 否则用顶栏切换器保存的选择（`localStorage["rf-lang"]`，存储不可用时用 `rf-lang` cookie）。
3. 否则取 `navigator.languages` 中第一个 `zh*` 或 `en*`。
4. 都没有则用英文。

它只会把无前缀页面换到对应的 `en/` 页面，保留剩余路径、query 和 hash。英文页从不跳转，所以不会循环。没有声明 `<link rel="alternate" hreflang="en">` 的页面也不会跳转。

构建时把 `lang.js` 内联进 `index.html`，并拼到 `topbar.js` 前面（`v` 为 2，会换掉页面里更旧的内联副本），因此只加载顶栏的页面也有 `window.rfLang`（但不跳转）。顶栏跟随页面 URL 的语言；页面用 `<link rel="alternate" hreflang="zh-CN|en">` 声明了另一种语言时才显示切换器；顶栏会改写自己的链接和页面上的 `a[data-rf-site="<id>"]`。存储被禁用时，明确的 `?lang=zh` 会带到这些链接上，下一个工具不会退回英文。

工具如果不挂在注册表前缀下，用 `<meta name="rf-mount" content="/tools/counter/">`（EasyPic 挂在 `/pics/` 时用 `content="/pics/"`），并在顶栏脚本上写 `data-tool="shutter|easypic|recipes"`。已有的 `<meta name="sc-mount">` 同样有效。值必须是当前 URL 之下的同源干净路径，否则忽略；`/easypic/`、`/shutter/`、`/recipes/` 仍按注册表解释。`place().mount` 是这个前缀，`place().site.base` 仍是线上前缀。easypic、shutter、recipes 的 `en` 都是 `true`：英文页指向各自的 `/en/`，中文页仍是无前缀路径。

```html
<meta name="rf-mount" content="/pics/" />
<script src="/shell/topbar.<sha256>.js" defer data-tool="easypic"></script>
```

页面自己 `pushState` 或 `replaceState` 之后，URL、`html lang`、title 和 hreflang 都更新完，在同一轮里派发事件。`dispatchEvent` 返回时，原来的 `.rf-bar` 已经对上 URL。手选时自己调用 `choose(lang)`。顶栏只听一次，重建这同一个顶栏的子节点；开关原先有焦点时，焦点回到新开关。它不包住 `place` 或 `href`，不再请求 `topbar.js`，也不动页面其余部分。不要删 `window.__rfBar`，不要拆掉顶栏再插一次脚本：那样会叠监听，而且断网时旧顶栏已经没了。后退和前进走 `popstate`，顶栏自己刷新。

```js
history.pushState(null, "", nextUrl);
rfLang.choose(nextLang);
document.dispatchEvent(new Event("rf:locale"));
```

工具接入英文：提供 `<base>en/`；两种语言都加 `canonical` 和 `hreflang`（`zh-CN`、`en`、`x-default` 指向英文）；在中文入口里这些链接之后内联带 `data-rf-enter` 的 `/shell/lang.js`；API 和资源 URL 保持以工具前缀开头。其后的统计片段以 `if (window.rfLang && window.rfLang.leaving) return;` 开头。双语页面不要再设 `data-home`。内联副本带着构建时的站点表，任一 `en` 开关变化后要重新复制。easypic、shutter、recipes 的 `en` 已经是 `true`。以后的新工具在自己的 `/en/` 上线前保持关闭。

## 顶栏缓存

带哈希的文件放在 release 外面。Nginx 从 `/opt/site/shared` 读它们（文件在 `/opt/site/shared/shell/<file>`），不从 `/opt/site/current` 读。接收器仍然只在构建退出码为 0 之后切换 `current`，并且会删掉旧 release。这不能把子站已经用过的哈希一起删掉。

这个目录要单独准备一次。本仓库不创建它：

```sh
sudo mkdir -p /opt/site/shared/shell
sudo chown rende-deploy:rende-deploy /opt/site/shared /opt/site/shared/shell
sudo chmod 755 /opt/site/shared /opt/site/shared/shell
```

它必须是真实目录，不能是符号链接。部署用户写出的文件是 644。构建命令写成接收器已经允许的这一行：

```sh
export RF_SHELL_SHARED=/opt/site/shared/shell && npm ci && npm run build
```

复制时先写临时文件，再链接到最终名字，然后把字节读回来核对。相同字节不会重写。同一个名字上的不同字节会让构建失败，`current` 保持不动。还没有的哈希返回 `404`，响应头是 `Cache-Control: no-store`。已经存在的文件是 `public, max-age=31536000, immutable`。源站返回 200 之前，不要在公网边缘请求这个哈希，否则缓存住的 404 会让后来的文件也打不开。

`deploy/nginx-shell-cache.conf` 是要加到线上的 location，本仓库不安装。无版本的 `/shell/topbar.js`、`/shell/lang.js`、`/shell/topbar.css`、`/shell/manifest.json`，以及 `/` 和 `/en/`，仍然是 `no-cache`，并且仍然来自当前 release。

EasyPic、快门计数、家常菜本只在那个 200 之后才改 `src`。家常菜本必须内联同一份 manifest 里 `lang.<sha256>.js` 的精确字节。顶栏只在内联副本的 `v` 低于 2 时才替换它。不要为了让缓存失效去抬高 `v`。把 `current` 指回去、重新部署旧 commit，或者删掉 release 目录，共享目录里的文件都还在。

## 部署

`.github/workflows/ci.yml` 在 pull request 和 `main` 上跑 lint 与测试。

`.github/workflows/deploy.yml` 调用共享工作流：

```yaml
uses: rendeyuwei/rende-deploy/.github/workflows/deploy-project.yml@main
with:
  project: site
```

截至 2026-10-15，`rendeyuwei/rende-deploy` 的 `main` 上还没有这个文件（仓库里只有 README）。调用方已经按这个形状写好。`project: site` 表示静态站点，发布 `dist/`，并用 HTTPS GET `https://rende.fun/` 期望 200 做健康检查。部署会排队，不会取消正在进行的一次（`cancel-in-progress: false`）。

密钥留在本仓库，不放在 rende-deploy：`ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY`、`ECS_KNOWN_HOSTS`。

如果共享工作流以后要求 `health_url`、`node_version` 或 `build_commands`，再写进 `deploy.yml`。GitHub 会拒绝被调用工作流没有声明的 input。到时建议的值：`health_url: https://rende.fun/`、`node_version: "22"`、`build_commands: npm ci && npm run build`。

## 页面

主页按 v2 设计：石墨色顶栏、极光首屏、`rende` 字标加薄荷绿 `.fun` 贴纸、EasyPic / 快门计数 / 家常菜本三张工具窗、纸尖 / Tipwink 桌面应用入口（新标签打开 Tipwink 页面）、关于我、页脚 `© 2026 任德 · rende.fun`。页宽跟演示稿一致，`max-width: 1120px`。`public/en/index.html` 是同一页面的英文版（ShutterCount、Home Recipes），测试保证它的元素结构与中文页一致。

关于我只写已确认的内容：杭州、前端搬砖、摄影 / 游戏 / 电影、两个个人邮箱、可选的秘书邮箱 `render@mail.grokbot.com`、GitHub 和 X。肖像是 `assets/me.jpg`（1120×1680），并用 `assets/me-560.jpg` 做 `srcset`。桌面和平板显示完整 2:3，名字在照片下方。手机上是 88px 方图；`object-position: 62% 96%` 把脸部中心（560×840 文件里大约 x=345、y=550，眼睛约在 y=548）放在方图中心。y=378–432 是塔顶，不是脸。

动效与演示一致：字标只入场一次、滚动显现、快门数字滚动、精确指针设备上的卡片倾斜和聚光、半分辨率极光（离开画面就暂停）。`prefers-reduced-motion: reduce` 会跳过这些，极光只画一帧。`?freeze=<毫秒>` 把 CSS 动画停在该时刻，方便截图。
