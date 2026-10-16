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

请用上面的服务器打开预览。脚本路径是绝对路径（`/shell/topbar.js`），直接双击 `index.html` 加载不到。

## Nginx 文档根

`npm run build` 的输出可以直接当作站点根目录：

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

把 `rende.fun` 的 `root` 指到这个目录。如果部署把 `dist/` 发布成 `/opt/site/current`，根目录就是 `/opt/site/current`。如果 `current` 是仓库本身，根目录就是 `/opt/site/current/dist`。本仓库不改服务器上的 Nginx。

本站在文档根提供 `/shell/topbar.js`（旁边是 `/shell/topbar.css`）。同一台机器上的其他站点这样嵌入：

```html
<script src="/shell/topbar.js" defer></script>
```

脚本会插入 48px 的固定顶栏，并从脚本自己的 URL 加载样式，给 `<html>` 加上 `rf-has-bar`，从而让 `body` 有 `padding-top: 48px`。可选属性：`data-tool="easypic|shutter|recipes"` 和 `data-home="/"`。原来 `position: fixed` 或 `position: sticky` 且 `top: 0` 的元素应改成 `top: var(--rf-h, 0px)`，避免被顶栏挡住。不要把 z-index 设得高于 `2147483000`。

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

主页按 v2 设计：石墨色顶栏、极光首屏、`rende` 字标加薄荷绿 `.fun` 贴纸、EasyPic / 快门计数 / 家常菜本三张工具窗、虚线框「下一个工具还在做」、关于我、页脚 `© 2026 任德 · rende.fun`。页宽跟演示稿一致，`max-width: 1120px`。

关于我只写已确认的内容：杭州、前端搬砖、摄影 / 游戏 / 电影、两个个人邮箱、可选的秘书邮箱 `render@mail.grokbot.com`、GitHub 和 X。肖像是 `assets/me.jpg`（1120×1680），并用 `assets/me-560.jpg` 做 `srcset`。桌面和平板显示完整 2:3，名字在照片下方。手机上是 88px 方图；`object-position: 56% 45%` 把实测的脸部中心（560×840 文件里大约 x=311、y=405）放在方图中心。

动效与演示一致：字标只入场一次、滚动显现、快门数字滚动、精确指针设备上的卡片倾斜和聚光、半分辨率极光（离开画面就暂停）。`prefers-reduced-motion: reduce` 会跳过这些，极光只画一帧。`?freeze=<毫秒>` 把 CSS 动画停在该时刻，方便截图。
