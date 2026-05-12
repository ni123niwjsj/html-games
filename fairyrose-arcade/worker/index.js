const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ARENA = { width: 960, height: 600 };
const TICK_MS = 1000 / 30;
const WIN_SCORE = 5;
const TANK_RADIUS = 18;
const BULLET_RADIUS = 5;
const POWER_RADIUS = 15;
const MINE_RADIUS = 14;
const WORKER_VERSION = "tank-duel-powerups-v2";

const POWER_TYPES = ["speed", "shield", "spread", "mine", "pierce"];
const POWER_LABELS = {
  speed: "加速",
  shield: "护盾",
  spread: "散弹",
  mine: "地雷",
  pierce: "穿墙弹"
};

const MAPS = [
  [
    { x: 176, y: 90, w: 34, h: 170 },
    { x: 176, y: 340, w: 34, h: 170 },
    { x: 750, y: 90, w: 34, h: 170 },
    { x: 750, y: 340, w: 34, h: 170 },
    { x: 318, y: 134, w: 324, h: 30 },
    { x: 318, y: 436, w: 324, h: 30 },
    { x: 462, y: 244, w: 36, h: 112 }
  ],
  [
    { x: 230, y: 74, w: 34, h: 190 },
    { x: 696, y: 336, w: 34, h: 190 },
    { x: 322, y: 285, w: 316, h: 30 },
    { x: 472, y: 86, w: 34, h: 132 },
    { x: 472, y: 382, w: 34, h: 132 },
    { x: 96, y: 430, w: 210, h: 30 },
    { x: 654, y: 140, w: 210, h: 30 }
  ],
  [
    { x: 166, y: 136, w: 240, h: 30 },
    { x: 554, y: 434, w: 240, h: 30 },
    { x: 166, y: 434, w: 240, h: 30 },
    { x: 554, y: 136, w: 240, h: 30 },
    { x: 292, y: 232, w: 34, h: 136 },
    { x: 634, y: 232, w: 34, h: 136 },
    { x: 448, y: 270, w: 64, h: 60 }
  ],
  [
    { x: 130, y: 132, w: 210, h: 28 },
    { x: 620, y: 440, w: 210, h: 28 },
    { x: 130, y: 440, w: 210, h: 28 },
    { x: 620, y: 132, w: 210, h: 28 },
    { x: 450, y: 86, w: 60, h: 150 },
    { x: 450, y: 364, w: 60, h: 150 },
    { x: 390, y: 286, w: 180, h: 28 }
  ]
];

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "content-type": "application/json; charset=utf-8" })
  });
}

function makeRoomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return code;
}

function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "fairyrose-tank-duel", version: WORKER_VERSION });

    if (url.pathname === "/api/create") {
      let code = makeRoomCode();
      let stub = env.TANK_ROOMS.get(env.TANK_ROOMS.idFromName(code));
      let response = await stub.fetch("https://room.internal/init", { method: "POST" });
      let attempts = 0;
      while (response.status === 409 && attempts < 8) {
        code = makeRoomCode();
        stub = env.TANK_ROOMS.get(env.TANK_ROOMS.idFromName(code));
        response = await stub.fetch("https://room.internal/init", { method: "POST" });
        attempts++;
      }
      if (!response.ok) return json({ error: "创建房间失败，请重试。" }, 500);
      return json({ roomCode: code });
    }

    const roomMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]{1,8})\/(status|websocket)$/);
    if (!roomMatch) return json({ error: "接口不存在。" }, 404);

    const roomCode = normalizeRoomCode(roomMatch[1]);
    if (roomCode.length !== 6) return json({ error: "房间码需要 6 位。" }, 400);
    const stub = env.TANK_ROOMS.get(env.TANK_ROOMS.idFromName(roomCode));
    return stub.fetch(request);
  }
};

export class TankRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.players = new Map();
    this.inputs = new Map();
    this.mapIndex = 0;
    this.walls = MAPS[0];
    this.tanks = null;
    this.bullets = [];
    this.powerups = [];
    this.mines = [];
    this.effects = [];
    this.scores = { p1: 0, p2: 0 };
    this.phase = "waiting";
    this.winner = null;
    this.roundResetAt = 0;
    this.nextPowerAt = 0;
    this.started = false;
    this.effectSeq = 1;
    this.powerSeq = 1;
    this.mineSeq = 1;
    this.bulletSeq = 1;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const created = await this.state.storage.get("created");
      if (created) return json({ error: "房间已存在。" }, 409);
      this.mapIndex = Math.floor(Math.random() * MAPS.length);
      this.walls = MAPS[this.mapIndex];
      await this.state.storage.put({ created: true, mapIndex: this.mapIndex, version: WORKER_VERSION });
      this.resetMatch();
      return json({ ok: true });
    }

    const created = await this.state.storage.get("created");
    if (!created) return json({ error: "房间不存在。" }, 404);

    const storedMap = await this.state.storage.get("mapIndex");
    this.mapIndex = Number.isInteger(storedMap) ? storedMap : this.mapIndex;
    this.walls = MAPS[this.mapIndex] || MAPS[0];

    if (url.pathname.endsWith("/status")) {
      return json({ exists: true, players: this.sessions.size, full: this.sessions.size >= 2, version: WORKER_VERSION });
    }

    if (!url.pathname.endsWith("/websocket")) return json({ error: "房间接口不存在。" }, 404);
    if (request.headers.get("upgrade") !== "websocket") return json({ error: "需要 WebSocket 连接。" }, 426);

    const playerId = String(url.searchParams.get("playerId") || crypto.randomUUID()).slice(0, 80);
    const seat = this.assignSeat(playerId);
    if (!seat) return json({ error: "房间已满。" }, 409);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.set(playerId, { socket: server, seat });
    this.inputs.set(playerId, { turn: 0, move: 0, fire: false, usePower: false });

    server.addEventListener("message", event => this.onMessage(playerId, event.data));
    server.addEventListener("close", () => this.onClose(playerId));
    server.addEventListener("error", () => this.onClose(playerId));

    this.send(server, {
      type: "hello",
      playerId,
      seat,
      arena: ARENA,
      mapIndex: this.mapIndex,
      walls: this.walls,
      winScore: WIN_SCORE,
      powerLabels: POWER_LABELS,
      version: WORKER_VERSION
    });
    this.updatePhase();
    this.ensureLoop();
    this.broadcastSnapshot();

    return new Response(null, { status: 101, webSocket: client });
  }

  assignSeat(playerId) {
    if (this.players.has(playerId)) {
      const existing = this.players.get(playerId);
      existing.connected = true;
      return existing.seat;
    }
    const occupied = new Set([...this.players.values()].filter(player => player.connected).map(player => player.seat));
    const seat = occupied.has("p1") ? (occupied.has("p2") ? null : "p2") : "p1";
    if (!seat) return null;
    this.players.set(playerId, { seat, connected: true });
    if (!this.tanks || !this.tanks[seat]) this.resetRound(false);
    return seat;
  }

  onMessage(playerId, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "input") {
      this.inputs.set(playerId, {
        turn: clamp(Number(msg.turn) || 0, -1, 1),
        move: clamp(Number(msg.move) || 0, -1, 1),
        fire: Boolean(msg.fire),
        usePower: Boolean(msg.usePower)
      });
    }
    if (msg.type === "restart" && this.phase === "finished") {
      this.resetMatch();
      this.broadcast({ type: "notice", text: "新对局开始。" });
    }
  }

  onClose(playerId) {
    const session = this.sessions.get(playerId);
    if (session) this.sessions.delete(playerId);
    this.inputs.delete(playerId);
    const player = this.players.get(playerId);
    if (player) player.connected = false;
    this.updatePhase();
    this.broadcastSnapshot();
  }

  ensureLoop() {
    if (this.started) return;
    this.started = true;
    const tick = () => {
      this.step();
      if (this.sessions.size) {
        setTimeout(tick, TICK_MS);
      } else {
        this.started = false;
      }
    };
    setTimeout(tick, TICK_MS);
  }

  updatePhase() {
    if (this.phase === "finished") return;
    const connectedSeats = new Set([...this.sessions.values()].map(session => session.seat));
    this.phase = connectedSeats.has("p1") && connectedSeats.has("p2") ? "playing" : "waiting";
  }

  resetMatch() {
    this.scores = { p1: 0, p2: 0 };
    this.winner = null;
    this.phase = this.sessions.size >= 2 ? "playing" : "waiting";
    this.resetRound(false);
  }

  resetRound(delay = true) {
    this.tanks = {
      p1: this.createTank(108, ARENA.height / 2, 0),
      p2: this.createTank(ARENA.width - 108, ARENA.height / 2, Math.PI)
    };
    this.bullets = [];
    this.mines = [];
    this.powerups = [];
    this.effects = [];
    this.nextPowerAt = Date.now() + 2200;
    this.roundResetAt = delay ? Date.now() + 1200 : 0;
  }

  createTank(x, y, angle) {
    return {
      x,
      y,
      angle,
      cooldown: 0,
      alive: true,
      power: null,
      shield: false,
      speedUntil: 0,
      flashUntil: 0,
      lastUsePower: false
    };
  }

  step() {
    const now = Date.now();
    this.updatePhase();
    this.effects = this.effects.filter(effect => now - effect.at < effect.ttl);

    if (this.phase !== "playing") {
      this.broadcastSnapshot();
      return;
    }
    if (this.roundResetAt && now < this.roundResetAt) {
      this.broadcastSnapshot();
      return;
    }
    if (this.roundResetAt) this.resetRound(false);

    for (const [playerId, player] of this.players) {
      if (!this.sessions.has(playerId)) continue;
      const tank = this.tanks[player.seat];
      const input = this.inputs.get(playerId) || { turn: 0, move: 0, fire: false, usePower: false };
      this.updateTank(tank, input, player.seat, now);
    }

    this.spawnPowerups(now);
    this.collectPowerups(now);
    this.updateBullets(now);
    this.updateMines(now);
    this.broadcastSnapshot();
  }

  updateTank(tank, input, owner, now) {
    if (!tank.alive) return;

    tank.angle += input.turn * 0.09;
    const boosted = now < tank.speedUntil;
    const speed = (input.move >= 0 ? 2.85 : 2.15) * (boosted ? 1.55 : 1);
    const nx = tank.x + Math.cos(tank.angle) * input.move * speed;
    const ny = tank.y + Math.sin(tank.angle) * input.move * speed;
    if (!this.circleHitsWall(nx, ny, TANK_RADIUS)) {
      tank.x = clamp(nx, TANK_RADIUS, ARENA.width - TANK_RADIUS);
      tank.y = clamp(ny, TANK_RADIUS, ARENA.height - TANK_RADIUS);
    }

    tank.cooldown = Math.max(0, tank.cooldown - 1);
    if (input.usePower && !tank.lastUsePower) this.usePower(tank, owner, now);
    tank.lastUsePower = input.usePower;

    if (input.fire && tank.cooldown <= 0) this.fire(tank, owner, now);
  }

  usePower(tank, owner, now) {
    if (!tank.power || !tank.alive) return;
    const power = tank.power;
    tank.power = null;

    if (power === "speed") {
      tank.speedUntil = now + 5200;
      this.addEffect("boost", tank.x, tank.y, owner, 900, { label: "加速" });
    }
    if (power === "shield") {
      tank.shield = true;
      this.addEffect("shield", tank.x, tank.y, owner, 900, { label: "护盾" });
    }
    if (power === "mine") {
      if (this.mines.filter(mine => mine.owner === owner).length < 3) {
        this.mines.push({ id: this.mineSeq++, owner, x: tank.x - Math.cos(tank.angle) * 26, y: tank.y - Math.sin(tank.angle) * 26, armedAt: now + 650 });
        this.addEffect("mine", tank.x, tank.y, owner, 900, { label: "地雷" });
      }
    }
    if (power === "spread" || power === "pierce") {
      tank.power = power;
      this.addEffect("ready", tank.x, tank.y, owner, 800, { label: POWER_LABELS[power] });
    }
  }

  fire(tank, owner, now) {
    if (!tank.alive) return;
    const owned = this.bullets.filter(bullet => bullet.owner === owner).length;
    if (owned >= 4) return;

    const queuedPower = tank.power;
    const angles = queuedPower === "spread" ? [-0.22, 0, 0.22] : [0];
    const pierce = queuedPower === "pierce" ? 1 : 0;
    for (const offset of angles) {
      const angle = tank.angle + offset;
      this.bullets.push({
        id: this.bulletSeq++,
        owner,
        x: tank.x + Math.cos(angle) * 28,
        y: tank.y + Math.sin(angle) * 28,
        vx: Math.cos(angle) * 7.5,
        vy: Math.sin(angle) * 7.5,
        born: now,
        bounces: 0,
        pierce,
        kind: queuedPower === "spread" ? "spread" : queuedPower === "pierce" ? "pierce" : "normal"
      });
    }
    if (queuedPower === "spread" || queuedPower === "pierce") tank.power = null;
    tank.cooldown = queuedPower === "spread" ? 31 : 24;
    this.addEffect("muzzle", tank.x + Math.cos(tank.angle) * 34, tank.y + Math.sin(tank.angle) * 34, owner, 180);
  }

  spawnPowerups(now) {
    if (now < this.nextPowerAt || this.powerups.length >= 3) return;
    const point = this.findSafePoint();
    if (point) {
      const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
      this.powerups.push({ id: this.powerSeq++, type, x: point.x, y: point.y, born: now });
      this.addEffect("spawn", point.x, point.y, null, 900, { label: POWER_LABELS[type] });
    }
    this.nextPowerAt = now + 5000 + Math.random() * 3500;
  }

  collectPowerups(now) {
    for (const power of this.powerups) {
      for (const seat of ["p1", "p2"]) {
        const tank = this.tanks[seat];
        if (!tank.alive) continue;
        if (distance(power.x, power.y, tank.x, tank.y) < TANK_RADIUS + POWER_RADIUS) {
          tank.power = power.type;
          power.dead = true;
          this.addEffect("pickup", power.x, power.y, seat, 900, { label: POWER_LABELS[power.type] });
        }
      }
    }
    this.powerups = this.powerups.filter(power => !power.dead && now - power.born < 18000);
  }

  updateBullets(now) {
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;

      if (bullet.x < BULLET_RADIUS || bullet.x > ARENA.width - BULLET_RADIUS) {
        bullet.vx *= -1;
        bullet.x = clamp(bullet.x, BULLET_RADIUS, ARENA.width - BULLET_RADIUS);
        bullet.bounces++;
      }
      if (bullet.y < BULLET_RADIUS || bullet.y > ARENA.height - BULLET_RADIUS) {
        bullet.vy *= -1;
        bullet.y = clamp(bullet.y, BULLET_RADIUS, ARENA.height - BULLET_RADIUS);
        bullet.bounces++;
      }

      for (const wall of this.walls) {
        if (!circleRect(bullet.x, bullet.y, BULLET_RADIUS, wall)) continue;
        if (bullet.pierce > 0) {
          bullet.pierce--;
          this.addEffect("spark", bullet.x, bullet.y, bullet.owner, 260);
          continue;
        }
        const prevX = bullet.x - bullet.vx;
        const prevY = bullet.y - bullet.vy;
        const hitX = prevX < wall.x || prevX > wall.x + wall.w;
        const hitY = prevY < wall.y || prevY > wall.y + wall.h;
        if (hitX) bullet.vx *= -1;
        if (hitY) bullet.vy *= -1;
        if (!hitX && !hitY) bullet.vx *= -1;
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        bullet.bounces++;
        this.addEffect("spark", bullet.x, bullet.y, bullet.owner, 260);
        break;
      }

      for (const seat of ["p1", "p2"]) {
        if (seat === bullet.owner) continue;
        const tank = this.tanks[seat];
        if (!tank.alive) continue;
        if (distance(bullet.x, bullet.y, tank.x, tank.y) < TANK_RADIUS + BULLET_RADIUS) {
          bullet.dead = true;
          this.damageTank(seat, bullet.owner, tank.x, tank.y, now);
        }
      }

      if (now - bullet.born > 6500 || bullet.bounces > 5) bullet.dead = true;
    }
    this.bullets = this.bullets.filter(bullet => !bullet.dead);
  }

  updateMines(now) {
    for (const mine of this.mines) {
      for (const seat of ["p1", "p2"]) {
        if (seat === mine.owner || now < mine.armedAt) continue;
        const tank = this.tanks[seat];
        if (tank.alive && distance(mine.x, mine.y, tank.x, tank.y) < TANK_RADIUS + MINE_RADIUS + 6) {
          mine.dead = true;
          this.damageTank(seat, mine.owner, mine.x, mine.y, now);
        }
      }
      if (now - mine.armedAt > 16000) mine.dead = true;
    }
    this.mines = this.mines.filter(mine => !mine.dead);
  }

  damageTank(victimSeat, attackerSeat, x, y, now) {
    const victim = this.tanks[victimSeat];
    if (victim.shield) {
      victim.shield = false;
      victim.flashUntil = now + 500;
      this.addEffect("shieldBreak", x, y, victimSeat, 700, { label: "护盾破裂" });
      return;
    }
    victim.alive = false;
    this.addEffect("explosion", x, y, attackerSeat, 1200, { victim: victimSeat });
    this.scorePoint(attackerSeat);
  }

  scorePoint(seat) {
    this.scores[seat]++;
    if (this.scores[seat] >= WIN_SCORE) {
      this.phase = "finished";
      this.winner = seat;
      this.roundResetAt = 0;
      this.bullets = [];
      this.mines = [];
      this.powerups = [];
    } else {
      this.roundResetAt = Date.now() + 1350;
    }
  }

  findSafePoint() {
    for (let i = 0; i < 40; i++) {
      const x = 80 + Math.random() * (ARENA.width - 160);
      const y = 70 + Math.random() * (ARENA.height - 140);
      if (this.circleHitsWall(x, y, POWER_RADIUS + 8)) continue;
      if (this.tanks && Object.values(this.tanks).some(tank => distance(x, y, tank.x, tank.y) < 95)) continue;
      if (this.powerups.some(power => distance(x, y, power.x, power.y) < 90)) continue;
      return { x, y };
    }
    return null;
  }

  circleHitsWall(x, y, r) {
    if (x < r || y < r || x > ARENA.width - r || y > ARENA.height - r) return true;
    return this.walls.some(wall => circleRect(x, y, r, wall));
  }

  addEffect(kind, x, y, owner = null, ttl = 700, extra = {}) {
    this.effects.push({ id: this.effectSeq++, kind, x, y, owner, at: Date.now(), ttl, ...extra });
    if (this.effects.length > 40) this.effects = this.effects.slice(-40);
  }

  snapshot() {
    return {
      type: "snapshot",
      arena: ARENA,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      tanks: this.tanks,
      bullets: this.bullets.map(({ id, owner, x, y, kind }) => ({ id, owner, x, y, kind })),
      mines: this.mines.map(({ id, owner, x, y, armedAt }) => ({ id, owner, x, y, armed: Date.now() >= armedAt })),
      powerups: this.powerups,
      effects: this.effects,
      walls: this.walls,
      players: [...this.players.values()].map(player => ({ seat: player.seat, connected: player.connected })),
      roundResetAt: this.roundResetAt,
      powerLabels: POWER_LABELS,
      version: WORKER_VERSION
    };
  }

  broadcastSnapshot() {
    this.broadcast(this.snapshot());
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const [playerId, session] of this.sessions) {
      try {
        session.socket.send(text);
      } catch {
        this.onClose(playerId);
      }
    }
  }

  send(socket, message) {
    socket.send(JSON.stringify(message));
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function circleRect(cx, cy, cr, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  return distance(cx, cy, closestX, closestY) < cr;
}
