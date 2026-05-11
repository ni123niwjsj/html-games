# Fairy Rose Arcade / 玫瑰小游戏厅

一个可直接部署到 Cloudflare Pages / GitHub Pages 的纯静态 HTML 小游戏合集项目。

项目不使用 React、Vue、Vite、Node 构建流程，不依赖后端，不依赖外部 CDN。所有页面都是普通的 HTML + CSS + JavaScript，可以直接双击 `index.html` 本地运行。

## 项目结构

```text
fairyrose-arcade/
├─ index.html
├─ README.md
├─ assets/
│  ├─ css/
│  │  └─ main.css
│  ├─ js/
│  │  └─ main.js
│  └─ images/
├─ games/
│  ├─ space-shooter/
│  │  └─ index.html
│  ├─ snake/
│  │  └─ index.html
│  ├─ 2048/
│  │  └─ index.html
│  ├─ minesweeper/
│  │  └─ index.html
│  └─ breakout/
│     └─ index.html
└─ data/
   └─ games.json
```

## 已包含游戏

- 星际突围：纵版太空射击，包含简单、普通、困难三档难度，简单模式带辅助瞄准。
- 霓虹贪吃蛇：支持键盘、手机滑动、普通模式和加速模式。
- 玫瑰 2048：支持键盘、手机滑动、最高分和撤销一步。
- 星尘扫雷：支持简单、中等、困难，手机长按插旗。
- 玫瑰打砖块：支持键盘、鼠标、触控，多关卡和道具掉落。

每个小游戏都有独立的 `index.html`，可以单独打开，也能从首页进入。最高分保存在浏览器 `localStorage` 中。

## 本地运行方式

方式一：直接双击运行。

1. 打开项目目录。
2. 双击 `fairyrose-arcade/index.html`。
3. 进入首页后点击任意游戏卡片开始游戏。

方式二：用任意静态服务器运行。

```bash
cd fairyrose-arcade
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

首页会优先读取 `data/games.json`。如果你用 `file://` 方式打开，部分浏览器会阻止 `fetch` 读取本地 JSON，首页脚本内置了备用游戏列表，因此仍然可以正常显示和跳转。

## 如何新增一个小游戏

以新增 `flappy-bird` 为例：

1. 创建目录：

```text
games/flappy-bird/
```

2. 在目录中创建游戏页面：

```text
games/flappy-bird/index.html
```

3. 这个页面建议包含：

- 完整 HTML 结构。
- 独立 CSS 和 JavaScript，可以直接写在页面内。
- 返回大厅按钮：`../../index.html`。
- `localStorage` 最高分保存逻辑。
- 手机端和桌面端操作适配。

4. 修改 `data/games.json`，增加一条配置：

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

5. 回到首页，游戏会自动出现在卡片列表中。

## 如何修改 data/games.json

`data/games.json` 是首页游戏列表的数据源。每个游戏对象包含：

```json
{
  "id": "space-shooter",
  "title": "星际突围",
  "subtitle": "纵版太空射击",
  "category": "射击",
  "difficulty": "中等",
  "mobile": true,
  "description": "驾驶飞船穿越敌机和陨石群，击败 Boss，挑战高分。",
  "path": "games/space-shooter/index.html",
  "storageKey": "space_shooter_high_score"
}
```

字段说明：

- `id`：游戏唯一标识，建议和文件夹名一致。
- `title`：首页卡片显示的游戏名称。
- `subtitle`：游戏副标题。
- `category`：分类，例如射击、益智、动作、休闲、经典。
- `difficulty`：难度标签。
- `mobile`：是否支持手机端。
- `description`：简短介绍。
- `path`：游戏页面路径。
- `storageKey`：最高分保存在 `localStorage` 中使用的键名。

修改时注意 JSON 格式必须合法：数组元素之间要有逗号，最后一个元素后面不要多写逗号。

## 部署到 Cloudflare Pages

1. 将整个 `fairyrose-arcade` 文件夹推送到 GitHub 仓库。
2. 登录 Cloudflare Dashboard。
3. 进入 Workers & Pages。
4. 创建 Pages 项目，并连接你的 GitHub 仓库。
5. 构建设置：

```text
Build command：留空
Build output directory：/
```

如果 Cloudflare Pages 不允许填写 `/`，就选择项目根目录作为输出目录。因为本项目是纯静态项目，不需要安装依赖，也不需要构建步骤。

## 绑定自定义域名

1. 在 Cloudflare Pages 项目中进入 Custom domains。
2. 点击 Set up a custom domain。
3. 输入你的域名，例如：

```text
arcade.example.com
```

4. 如果域名 DNS 已经托管在 Cloudflare，Cloudflare 会自动添加 CNAME 记录。
5. 如果域名 DNS 不在 Cloudflare，请按页面提示到你的 DNS 服务商添加 CNAME 记录。
6. 等待 DNS 生效和证书签发完成后，即可通过自定义域名访问。

## 部署到 GitHub Pages

1. 将项目推送到 GitHub。
2. 进入仓库 Settings。
3. 打开 Pages。
4. Source 选择 Deploy from a branch。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 部署完成。

## 推荐 GitHub 仓库名

推荐使用：

```text
fairyrose-arcade
```

也可以使用：

```text
fairy-rose-arcade
rose-html-arcade
static-rose-games
```

## 维护建议

- 每个游戏尽量保持独立，避免互相依赖。
- 首页只负责展示、搜索、筛选和跳转。
- 新游戏的最高分键名不要和旧游戏重复。
- 如果以后游戏数量变多，可以继续扩展 `data/games.json`，无需改首页结构。
