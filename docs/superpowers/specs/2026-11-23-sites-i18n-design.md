# rende.fun 主站与三子站中英文：确认版设计

状态：用户已批准（2026-11-23）。本文件是四个仓库共用的契约。本轮只在 `rende-site` 实现主站与共享顶栏；EasyPic、快门计数、家常菜本由后续轮次按本契约接入。灯下札记、EasyPic 后台不在范围内。

## 1. 已批准规则

1. 中文沿用现有无前缀 URL，不改。英文是各站自己前缀下的 `en/`：`/en/`、`/easypic/en/`、`/shutter/en/`、`/recipes/en/`。
2. 语言判定顺序：
   1. URL 明确语言：路径带 `en/` 即英文；无前缀 URL 带 `lang=zh` 查询参数即“明确中文”。
   2. 用户手选偏好（只有点击切换器才写入）。
   3. `navigator.languages` 按顺序取第一个主子标签为 `zh` 或 `en` 的项；`zh-HK`、`zh-TW` 等都归中文（简体）。
   4. 完全无匹配：英文。
3. 只持久化手选。偏好在同源各子站共享。
4. 显式中文选择、存储被禁用时都能正常切换和浏览。
5. 自动选择只发生在“无前缀且没有 `lang=zh`”的页面上，方向只有“无前缀 → `en/`”，英文页从不自动跳转，因此没有循环。
6. 跳转和切换保留 query、hash 和当前路由（站点内剩余路径）。
7. 用户录入正文、滤镜名称不自动翻译。英文版家常菜本名称暂用 Home Recipes。不新增 sitemap/robots。

## 2. 语言与路由模型（唯一数据源：`rende-site/src/shell/lang.ts`）

```ts
type RfLangCode = "zh" | "en";
interface RfSite { id: string; base: string; en: boolean }   // en: 该站已上线 /<base>en/
interface RfPlace { site: RfSite; lang: RfLangCode; rest: string; mount: string }
```

站点表（最长前缀优先，`home` 兜底）：

| id | base | en（本轮） |
|---|---|---|
| easypic | `/easypic/` | false |
| shutter | `/shutter/` | false |
| recipes | `/recipes/` | false |
| home | `/` | true |

- `place(pathname)`：已注册的工具前缀优先（`/easypic` 无斜杠也归 easypic）。否则，当前页若声明了合法挂载，且这条路径落在该挂载下，就用该挂载。再否则归 `home`。`rest` 为挂载之后的剩余路径；`rest` 为 `en` 或以 `en/` 开头时语言为英文并去掉这段。没有声明时，不会把路径中段的 `en` 猜成语言。
- 合法挂载：`<meta name="rf-mount" content="/tools/counter/">`（快门现有的 `<meta name="sc-mount">` 同样接受），并且页面上有 `<script data-tool="shutter|easypic|recipes">`。`content` 必须是同源的干净路径（拒绝别的源、`//`、`..`、`%`、query、hash），且当前 URL 在它下面。不合法就当没声明。`place().mount` 是实际前缀；`place().site.base` 仍是注册表里的线上前缀。
- 对应页：`mount + (en ? "en/" : "") + rest + query + hash`。切到中文时 query 追加 `lang=zh`；切到英文时去掉 `lang`。其他 query 原样保留。跨站链接仍用注册表的 `site.base`，不用页面挂载。

## 3. 共享运行时接口 `window.rfLang`

`lang.ts` 编译为经典脚本（无 import/export），装载一次 `window.rfLang`（按 `v` 版本号，新版本覆盖旧版本）：

| 成员 | 作用 |
|---|---|
| `v` | 契约版本，当前 `2`。顶栏里的新副本会替换页面里 v1 的内联副本，不改写已装上的函数 |
| `sites` | 上表 |
| `place(pathname)` | 解析站点、语言、剩余路径 |
| `match(tags)` | 有序匹配 `zh`/`en`，无匹配返回 `null` |
| `pref()` | 读取手选偏好：先 `localStorage["rf-lang"]`，再 cookie `rf-lang` |
| `choose(lang)` | 写入手选偏好：`localStorage` 失败时写 cookie（`Path=/; Max-Age=31536000; SameSite=Lax`，https 加 `Secure`）；返回是否真的写入 |
| `offers(lang)` | 当前页是否声明了该语言的对应页（`<link rel="alternate" hreflang="zh-CN|en">`） |
| `href(lang)` | 当前位置在该语言下的 URL（见第 2 节） |
| `siteHref(id)` | 跨站入口：当前页英文且目标站 `en: true` → `/<base>en/`；否则中文入口；当前页是“URL 明确中文”且偏好未能保存为中文时追加 `?lang=zh`，防止存储禁用时下一站又被自动带去英文 |
| `enter()` | 首访判定，见第 4 节 |
| `leaving` | `enter()` 已调用 `location.replace()` 时为 `true`；后面的 head 脚本（统计）据此跳过，避免把被跳走的 `/` 记成一次浏览 |

载入方式：
- `<head>` 内联：`<script data-rf-enter>…</script>`，放在 `<link rel="alternate">` 之后、统计脚本和样式之前。带 `data-rf-enter` 时脚本执行 `enter()`。主站构建时把源码里的 `<script data-rf-enter src="/shell/lang.js"></script>` 替换为内联内容；子站可以内联同一份 `/shell/lang.js`，或保留这行同步外链（多一次阻塞请求）。
- `/shell/topbar.js` 在构建时把 `lang.js` 拼在前面。只加载顶栏的旧页面也能拿到 `window.rfLang`，但不会执行 `enter()`。

## 4. `enter()` 判定

```
p = place(location.pathname)
if p.lang == "en"                 → 不动（显式英文，不被中文偏好覆盖）
if query 含 lang=zh               → 不动（显式中文）
want = pref() ?? match(navigator.languages || [navigator.language]) ?? "en"
if want == "en" 且 offers("en")   → location.replace(href("en"))
```

未声明英文对应页的页面（未上线英文的子站）永远不跳，不会指向 404。

## 5. 共享顶栏

- 界面语言 = `place(location.pathname).lang`；`<header class="rf-bar">` 设置 `lang`。
- 文案中英两份：logo 标签、回到主站、工具按钮、菜单标签、全部工具、“当前”标记（CSS `:lang(en)`）、工具名与描述（EasyPic / ShutterCount / Home Recipes）。
- 菜单、logo、“回到主站”和页面中带 `data-rf-site="<id>"` 的链接，`href` 都取 `siteHref(id)`。`data-home` 和 `data-tool` 仍然生效。
- 切换器：只有在 `offers(另一种语言)` 时才显示；`href` 取 `href(另一种语言)`，点击时先 `choose()` 再导航；hash 变化时更新 `href`。旧版子站没有声明对应页，所以不显示切换器。
- 同一文档内换语言：页面用 `pushState` 或 `replaceState` 改好 URL，并更新 `html lang`、title、hreflang 之后，派发一次 `document.dispatchEvent(new Event("rf:locale"))`。顶栏只注册一次监听，再渲染时不重复绑事件，也不替换 `rfLang` 上已有的函数。手选仍由页面调用 `choose()`（点顶栏开关时顶栏自己调用）。`popstate`（后退/前进）由顶栏自己刷新。不要包一层 `place`/`href`。

## 6. 主站页面

- `public/index.html`（中文）与 `public/en/index.html`（英文）两份静态 HTML，结构相同，所有可见文案、title、description、alt、aria-label、mailto 主题都按语言区分。
- 两页都含：`<html lang="zh-CN|en">`、canonical 自指、`hreflang="zh-CN"` → `https://rende.fun/`、`hreflang="en"` → `https://rende.fun/en/`、`hreflang="x-default"` → `https://rende.fun/en/`（与“无匹配默认英文”一致）。
- 只有中文页内联 `enter()`。资源路径全为绝对路径，`/en/` 下可直接使用。设计、照片规则不变。
- 两页各有 `<noscript>` 样式，让滚动显现的区块和 `rende` 字标在禁用 JS 时也可见（原页面禁用 JS 时这些内容不可见，属现状问题，因“禁 JS 可读”是本轮验收项而一并修复）。禁用 JS 时没有顶栏，也就没有切换器，读者可直接访问另一语言的 URL。

## 7. 缓存、SEO、服务端

- 语言只由路径和 `lang=zh` 决定，HTML 不读 Cookie、不读 Accept-Language；同一 URL 对所有人返回同一份内容，不需要 `Vary`、不需要改 ESA 规则或 Nginx（`try_files $uri $uri/` 已能提供 `/en/index.html`）。
- SEO 取舍：执行 JS 的抓取器访问 `/` 时，如果它声明的语言不是中文，会被跳到 `/en/`。中文页仍可通过不执行 JS 的原始 HTML、canonical 和 hreflang 被识别，但收录效果没有实测。不承诺零闪烁：内联脚本在首帧前执行 `location.replace`，实际是否闪现取决于浏览器，未做实测保证。
- 偏好 cookie 只在 `localStorage` 不可用时写入。ESA 若配置了“带 Cookie 不缓存”，这部分访客的缓存命中率会受影响（未验证）。

## 8. 子站接入清单（后续轮次）

1. 入口 HTML：`<html lang>`、canonical、两条 `hreflang` 加 `x-default`，然后内联 `/shell/lang.js`（带 `data-rf-enter`）；其后的统计片段以 `if (window.rfLang && window.rfLang.leaving) return;` 开头。内联副本带着构建时的站点表，任一站 `en` 改变后要重新复制；双语页面不要再设 `data-home`（它会覆盖语言感知的主页链接）。挂载不是注册表前缀时加 `<meta name="rf-mount" content="/your/base/">`，顶栏脚本保留 `data-tool`。同一文档里 `pushState` 之后派发 `rf:locale`。
2. 英文外壳 `<base>en/index.html`；API、图片、资源路径保持站点前缀（快门需先把 `./api/*`、`./iphone-export-original.jpg` 改为以 `/shutter/` 开头）。
3. 路由前缀按 `place().lang` 设置（如 `/recipes/en`）。
4. 文案字典打包，首帧同步取语言；服务端错误增加稳定 `code`（家常菜本），快门 `note` 增加 `noteCode`。
5. 上线并验证后，另一次提交把 `lang.ts` 中该站 `en` 改为 `true` 并发布主站（不必再升 `v`）。在此之前，主站英文页的菜单和工具卡指向该站的中文入口，不会 404。

## 9. 不做

后台、灯下札记、用户录入正文与滤镜名称的自动翻译、sitemap/robots、服务器或 ESA 配置、缓存刷新。
