(function () {
  const fallbackGames = [
    {
      id: "space-shooter",
      title: "星际突围",
      subtitle: "纵版太空射击",
      category: "射击",
      difficulty: "中等",
      mobile: true,
      description: "驾驶飞船穿越敌机和陨石群，击败 Boss，挑战高分。",
      path: "games/space-shooter/index.html",
      storageKey: "space_shooter_high_score"
    },
    {
      id: "snake",
      title: "霓虹贪吃蛇",
      subtitle: "经典成长挑战",
      category: "经典",
      difficulty: "简单",
      mobile: true,
      description: "控制小蛇吃掉能量玫瑰，身体越长越考验走位。",
      path: "games/snake/index.html",
      storageKey: "snake_high_score"
    },
    {
      id: "2048",
      title: "玫瑰 2048",
      subtitle: "数字合成益智",
      category: "益智",
      difficulty: "中等",
      mobile: true,
      description: "滑动数字方块合成 2048，支持撤销一步。",
      path: "games/2048/index.html",
      storageKey: "rose_2048_high_score"
    },
    {
      id: "minesweeper",
      title: "星尘扫雷",
      subtitle: "逻辑推理",
      category: "益智",
      difficulty: "困难",
      mobile: true,
      description: "根据数字推断雷区位置，长按可以插旗。",
      path: "games/minesweeper/index.html",
      storageKey: "minesweeper_best_time"
    },
    {
      id: "breakout",
      title: "玫瑰打砖块",
      subtitle: "街机动作",
      category: "动作",
      difficulty: "中等",
      mobile: true,
      description: "移动挡板反弹能量球，拾取道具并击碎所有砖块。",
      path: "games/breakout/index.html",
      storageKey: "breakout_high_score"
    }
  ];

  const grid = document.getElementById("gameGrid");
  const template = document.getElementById("gameCardTemplate");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const filters = document.getElementById("categoryFilters");
  let allGames = [];
  let currentCategory = "全部";

  function scoreText(game) {
    const value = localStorage.getItem(game.storageKey);
    if (!value) return "最高分：暂无";
    if (game.id === "minesweeper") return `最佳：${value} 秒`;
    return `最高分：${value}`;
  }

  function renderFilters(games) {
    const categories = ["全部", ...new Set(games.map(game => game.category)), "休闲"].filter((item, index, arr) => arr.indexOf(item) === index);
    filters.innerHTML = "";
    categories.forEach(category => {
      const button = document.createElement("button");
      button.className = "filter-button" + (category === currentCategory ? " active" : "");
      button.type = "button";
      button.textContent = category;
      button.addEventListener("click", () => {
        currentCategory = category;
        renderFilters(allGames);
        renderGames();
      });
      filters.appendChild(button);
    });
  }

  function renderGames() {
    const keyword = searchInput.value.trim().toLowerCase();
    const games = allGames.filter(game => {
      const matchesText = [game.title, game.subtitle, game.description, game.category].join(" ").toLowerCase().includes(keyword);
      const matchesCategory = currentCategory === "全部" || game.category === currentCategory;
      return matchesText && matchesCategory;
    });

    grid.innerHTML = "";
    resultCount.textContent = `共 ${games.length} 款小游戏`;

    if (!games.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "没有找到匹配的小游戏，换个关键词试试。";
      grid.appendChild(empty);
      return;
    }

    games.forEach(game => {
      const node = template.content.cloneNode(true);
      node.querySelector(".category").textContent = game.category;
      node.querySelector(".difficulty").textContent = `难度：${game.difficulty}`;
      node.querySelector("h3").textContent = game.title;
      node.querySelector(".subtitle").textContent = game.subtitle;
      node.querySelector(".description").textContent = game.description;
      node.querySelector(".mobile").textContent = game.mobile ? "支持手机端" : "桌面端优先";
      node.querySelector(".score").textContent = scoreText(game);
      node.querySelector(".play-button").href = game.path;
      grid.appendChild(node);
    });
  }

  async function loadGames() {
    try {
      const response = await fetch("data/games.json", { cache: "no-store" });
      if (!response.ok) throw new Error("games.json load failed");
      allGames = await response.json();
    } catch (error) {
      // file:// 环境下部分浏览器会阻止 fetch 本地 JSON，因此这里保留完整备用列表。
      allGames = fallbackGames;
    }
    renderFilters(allGames);
    renderGames();
  }

  searchInput.addEventListener("input", renderGames);
  loadGames();
})();
