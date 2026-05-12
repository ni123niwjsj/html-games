# Fairy Rose Arcade / 玫瑰小游戏厅

一个可以直接部署到 Cloudflare Pages 或 GitHub Pages 的 HTML 小游戏合集。大厅和单机游戏仍然是纯 HTML、CSS、JavaScript，不需要 React、Vue、Vite、Node 构建流程，也不依赖后端。

项目现在包含原有 Fairy Rose 游戏，以及从 GameHub 逐个接入的 42 款 HTML5 小游戏。GameHub 版本统一放在 `games/gamehub-*` 目录，不会覆盖原有同名游戏。

## 本地运行

可以直接双击 `index.html` 打开。由于浏览器的 `file://` 限制，首页读取 `data/games.json` 失败时会自动使用 `assets/js/main.js` 内置的备用列表。

也可以使用任意静态服务器预览，例如：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 如何新增一个小游戏

以新增 `flappy-bird` 为例：

1. 创建目录 `games/flappy-bird/`。
2. 在里面放入 `index.html`，并保证它可以独立打开运行。
3. 在页面里加入返回大厅链接：`../../index.html`。
4. 在 `data/games.json` 增加一条配置。
5. 在 `assets/js/main.js` 的 `fallbackGames` 里同步增加同一条配置，这样双击本地文件时也能显示。

示例配置：

```json
{
  "id": "flappy-bird",
  "title": "Flappy Bird",
  "subtitle": "点击飞行",
  "category": "动作",
  "difficulty": "中等",
  "mobile": true,
  "description": "点击控制小鸟穿过障碍，挑战更远距离。",
  "path": "games/flappy-bird/index.html",
  "storageKey": "flappy_bird_high_score"
}
```

## 修改 data/games.json

每个游戏对象包含 `id`、`title`、`subtitle`、`category`、`difficulty`、`mobile`、`description`、`path`、`storageKey`。分类可使用 `射击`、`益智`、`动作`、`经典`、`棋牌`、`记忆`、`打字`、`休闲`、`在线双人`。

修改后建议用 JSON 校验工具确认格式正确。

## Cloudflare Pages 部署

这是纯静态项目，Cloudflare Pages 可以直接连接 GitHub 仓库部署。

- Build command：留空
- Build output directory：`/`
- 如果 Pages 不接受 `/`，就选择项目根目录

推荐 GitHub 仓库名：`fairyrose-arcade` 或 `html-games`。

## 在线双人坦克部署

`games/tank-duel/` 是静态前端，实时联机由 Cloudflare Worker + Durable Object 提供。

```bash
npx wrangler deploy
```

Cloudflare Pages 负责大厅和游戏页面，Worker 负责坦克房间、WebSocket、同步和判定。Cloudflare 免费额度适合轻量试玩；访问量明显增加后，需要关注 Workers 和 Durable Objects 的用量成本。

## 绑定自定义域名

1. 在 Cloudflare Pages 项目里打开 `Custom domains`。
2. 添加你的域名或子域名。
3. 按 Cloudflare 提示添加 DNS 记录。
4. 等待证书签发完成。

如果域名 DNS 本来就在 Cloudflare，通常只需要几分钟。

## GameHub 来源与许可证

本项目接入了 [SinceraXY/GameHub](https://github.com/SinceraXY/GameHub) 的 42 款 HTML5 小游戏，许可证为 Apache-2.0。

- 每个 GameHub 游戏都迁移为独立入口，不嵌套原 GameHub 大厅。
- 目录统一命名为 `games/gamehub-<slug>/`。
- 与现有游戏重名时保留两版，例如原版 `games/snake/` 和 GameHub 版 `games/gamehub-snake/`。
- 移除了外部字体、图标 CDN 等远程依赖，并加入返回大厅按钮。
- 第三方说明见 `THIRD_PARTY_NOTICES.md`，许可证副本见 `licenses/GameHub-Apache-2.0.txt`。
