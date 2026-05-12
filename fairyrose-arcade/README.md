# Fairy Rose Arcade / 玫瑰小游戏厅

一个可以部署到 Cloudflare Pages / GitHub Pages 的 HTML 小游戏合集。

单机游戏部分仍然是纯静态 HTML + CSS + JavaScript，不依赖后端、不依赖外部 CDN、不需要构建流程。新增的在线双人《玫瑰坦克对决》使用 Cloudflare Worker + Durable Object 提供实时房间服务。

## 项目结构

```text
fairyrose-arcade/
├─ index.html
├─ README.md
├─ wrangler.toml
├─ assets/
│  ├─ css/main.css
│  ├─ js/main.js
│  └─ images/
├─ data/games.json
├─ games/
│  ├─ space-shooter/index.html
│  ├─ snake/index.html
│  ├─ 2048/index.html
│  ├─ minesweeper/index.html
│  ├─ breakout/index.html
│  └─ tank-duel/index.html
└─ worker/
   └─ index.js
```

## 本地运行

直接双击 `index.html` 可以打开大厅和所有单机游戏。

如果要测试在线双人坦克战，需要启动 Cloudflare Worker 本地服务：

```bash
cd fairyrose-arcade
npx wrangler dev
```

然后再用静态服务器打开前端：

```bash
python -m http.server 8000
```

访问：

```text
http://localhost:8000
```

进入《玫瑰坦克对决》后，Worker 地址默认是：

```text
http://127.0.0.1:8787
```

打开两个浏览器窗口，一个创建房间，一个输入房间码加入即可测试。

## 在线双人部署到 Cloudflare

推荐部署方式：

- Cloudflare Pages：托管大厅和所有 `games/` 静态页面。
- Cloudflare Worker：托管 `worker/index.js`。
- Durable Object：管理实时房间、WebSocket、坦克状态、炮弹和比分。

部署 Worker：

```bash
cd fairyrose-arcade
npx wrangler deploy
```

`wrangler.toml` 已经包含 Durable Object 绑定和迁移：

```toml
[[durable_objects.bindings]]
name = "TANK_ROOMS"
class_name = "TankRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TankRoom"]
```

部署 Pages：

1. 将项目推送到 GitHub。
2. 在 Cloudflare Dashboard 创建 Pages 项目。
3. 连接 GitHub 仓库。
4. Build command 留空。
5. Build output directory 填 `/`；如果不允许 `/`，选择项目根目录。

部署完成后，进入《玫瑰坦克对决》，把 Worker 地址填成你的 Worker 域名，例如：

```text
https://fairyrose-arcade-tank-duel.your-name.workers.dev
```

创建房间后复制邀请链接给朋友。邀请链接会带上房间码和 Worker 地址。

Cloudflare 免费额度适合轻量试玩和朋友间使用；如果访问量明显增加，请关注 Workers、Durable Objects、请求数和 CPU 时间用量。

## 新增小游戏

以新增 `flappy-bird` 为例：

1. 创建 `games/flappy-bird/index.html`。
2. 在页面内写完整 HTML、CSS、JavaScript。
3. 添加返回大厅按钮，链接到 `../../index.html`。
4. 在 `data/games.json` 增加配置：

```json
{
  "id": "flappy-bird",
  "title": "玫瑰飞鸟",
  "subtitle": "轻量闪避挑战",
  "category": "休闲",
  "difficulty": "中等",
  "mobile": true,
  "description": "点击或按空格让小鸟飞起，穿过管道挑战高分。",
  "path": "games/flappy-bird/index.html",
  "storageKey": "flappy_bird_high_score"
}
```

5. 如果希望 `file://` 打开首页时也能显示新游戏，同步修改 `assets/js/main.js` 里的 `fallbackGames`。

## data/games.json 字段

每个游戏对象包含：

- `id`：游戏唯一标识，建议和文件夹名一致。
- `title`：首页卡片游戏名称。
- `subtitle`：游戏副标题。
- `category`：分类，例如射击、益智、动作、休闲、经典、在线双人。
- `difficulty`：难度标签。
- `mobile`：是否支持手机端。
- `description`：简短介绍。
- `path`：游戏页面路径。
- `storageKey`：本地最高分或战绩使用的 localStorage 键名。

## 绑定自定义域名

Pages 自定义域名：

1. 进入 Cloudflare Pages 项目。
2. 打开 Custom domains。
3. 添加你的域名，例如 `arcade.example.com`。
4. 按提示配置 DNS。

Worker 自定义域名或路由：

1. 进入 Worker 项目。
2. 打开 Triggers。
3. 添加自定义域名或 Route。
4. 如果希望游戏默认同源调用 Worker，可以把 Worker 路由挂到 Pages 同域名的 `/api/*`。

## 推荐 GitHub 仓库名

```text
fairyrose-arcade
```
