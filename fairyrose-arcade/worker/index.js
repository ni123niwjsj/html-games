const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ARENA = { width: 960, height: 600 };
const TICK_MS = 1000 / 30;
const WIN_SCORE = 5;
const TANK_RADIUS = 18;
const BULLET_RADIUS = 5;

const MAPS = [
  [
    { x: 140, y: 80, w: 34, h: 180 },
    { x: 140, y: 340, w: 34, h: 180 },
    { x: 786, y: 80, w: 34, h: 180 },
    { x: 786, y: 340, w: 34, h: 180 },
    { x: 310, y: 130, w: 340, h: 30 },
    { x: 310, y: 440, w: 340, h: 30 },
    { x: 460, y: 240, w: 40, h: 120 }
  ],
  [
    { x: 220, y: 70, w: 34, h: 200 },
    { x: 706, y: 330, w: 34, h: 200 },
    { x: 320, y: 285, w: 320, h: 30 },
    { x: 470, y: 80, w: 34, h: 145 },
    { x: 470, y: 375, w: 34, h: 145 },
    { x: 80, y: 430, w: 220, h: 30 },
    { x: 660, y: 140, w: 220, h: 30 }
  ],
  [
    { x: 165, y: 135, w: 250, h: 30 },
    { x: 545, y: 435, w: 250, h: 30 },
    { x: 165, y: 435, w: 250, h: 30 },
    { x: 545, y: 135, w: 250, h: 30 },
    { x: 290, y: 230, w: 34, h: 140 },
    { x: 636, y: 230, w: 34, h: 140 },
    { x: 448, y: 270, w: 64, h: 60 }
  ]
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "content-type": "application/json; charset=utf-8" })
  });
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra
  };
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
    if (url.pathname === "/api/health") return json({ ok: true, service: "fairyrose-tank-duel" });

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
    if (!roomMatch) {
      return json({ error: "接口不存在。" }, 404);
    }

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
    this.bullets = [];
    this.scores = { p1: 0, p2: 0 };
    this.phase = "waiting";
    this.winner = null;
    this.roundResetAt = 0;
    this.started = false;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const created = await this.state.storage.get("created");
      if (created) return json({ error: "房间已存在。" }, 409);
      this.mapIndex = Math.floor(Math.random() * MAPS.length);
      this.walls = MAPS[this.mapIndex];
      await this.state.storage.put({ created: true, mapIndex: this.mapIndex });
      this.resetMatch();
      return json({ ok: true });
    }

    const created = await this.state.storage.get("created");
    if (!created) return json({ error: "房间不存在。" }, 404);

    const storedMap = await this.state.storage.get("mapIndex");
    this.mapIndex = Number.isInteger(storedMap) ? storedMap : this.mapIndex;
    this.walls = MAPS[this.mapIndex] || MAPS[0];

    if (url.pathname.endsWith("/status")) {
      return json({ exists: true, players: this.players.size, full: this.players.size >= 2 });
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
    this.inputs.set(playerId, { turn: 0, move: 0, fire: false });

    server.addEventListener("message", event => this.onMessage(playerId, event.data));
    server.addEventListener("close", () => this.onClose(playerId));
    server.addEventListener("error", () => this.onClose(playerId));

    this.send(server, { type: "hello", playerId, seat, arena: ARENA, mapIndex: this.mapIndex, walls: this.walls, winScore: WIN_SCORE });
    this.updatePhase();
    this.ensureLoop();
    this.broadcastSnapshot();

    return new Response(null, { status: 101, webSocket: client });
  }

  assignSeat(playerId) {
    if (this.players.has(playerId)) return this.players.get(playerId).seat;
    const occupied = new Set([...this.players.values()].map(player => player.seat));
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
        fire: Boolean(msg.fire)
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
      p1: { x: 105, y: ARENA.height / 2, angle: 0, cooldown: 0, alive: true },
      p2: { x: ARENA.width - 105, y: ARENA.height / 2, angle: Math.PI, cooldown: 0, alive: true }
    };
    this.bullets = [];
    this.roundResetAt = delay ? Date.now() + 1100 : 0;
  }

  step() {
    this.updatePhase();
    if (this.phase !== "playing") {
      this.broadcastSnapshot();
      return;
    }
    if (this.roundResetAt && Date.now() < this.roundResetAt) {
      this.broadcastSnapshot();
      return;
    }
    if (this.roundResetAt) {
      this.resetRound(false);
    }

    for (const [playerId, player] of this.players) {
      const tank = this.tanks[player.seat];
      const input = this.inputs.get(playerId) || { turn: 0, move: 0, fire: false };
      this.updateTank(tank, input, player.seat);
    }

    this.updateBullets();
    this.broadcastSnapshot();
  }

  updateTank(tank, input, owner) {
    if (!tank.alive) return;
    tank.angle += input.turn * 0.085;
    const speed = input.move >= 0 ? 2.7 : 2.05;
    const nx = tank.x + Math.cos(tank.angle) * input.move * speed;
    const ny = tank.y + Math.sin(tank.angle) * input.move * speed;
    if (!this.circleHitsWall(nx, ny, TANK_RADIUS)) {
      tank.x = clamp(nx, TANK_RADIUS, ARENA.width - TANK_RADIUS);
      tank.y = clamp(ny, TANK_RADIUS, ARENA.height - TANK_RADIUS);
    }
    tank.cooldown = Math.max(0, tank.cooldown - 1);
    if (input.fire && tank.cooldown <= 0 && this.bullets.filter(b => b.owner === owner).length < 3) {
      this.bullets.push({
        owner,
        x: tank.x + Math.cos(tank.angle) * 27,
        y: tank.y + Math.sin(tank.angle) * 27,
        vx: Math.cos(tank.angle) * 7.2,
        vy: Math.sin(tank.angle) * 7.2,
        born: Date.now(),
        bounces: 0
      });
      tank.cooldown = 24;
    }
  }

  updateBullets() {
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
        break;
      }

      for (const seat of ["p1", "p2"]) {
        if (seat === bullet.owner) continue;
        const tank = this.tanks[seat];
        if (tank.alive && distance(bullet.x, bullet.y, tank.x, tank.y) < TANK_RADIUS + BULLET_RADIUS) {
          tank.alive = false;
          this.scorePoint(bullet.owner);
          bullet.dead = true;
        }
      }

      if (Date.now() - bullet.born > 6000 || bullet.bounces > 4) bullet.dead = true;
    }
    this.bullets = this.bullets.filter(bullet => !bullet.dead);
  }

  scorePoint(seat) {
    this.scores[seat]++;
    if (this.scores[seat] >= WIN_SCORE) {
      this.phase = "finished";
      this.winner = seat;
      this.roundResetAt = 0;
      this.bullets = [];
    } else {
      this.roundResetAt = Date.now() + 1200;
    }
  }

  circleHitsWall(x, y, r) {
    if (x < r || y < r || x > ARENA.width - r || y > ARENA.height - r) return true;
    return this.walls.some(wall => circleRect(x, y, r, wall));
  }

  snapshot() {
    return {
      type: "snapshot",
      arena: ARENA,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      tanks: this.tanks,
      bullets: this.bullets.map(({ owner, x, y }) => ({ owner, x, y })),
      walls: this.walls,
      players: [...this.players.values()].map(player => ({ seat: player.seat, connected: player.connected })),
      roundResetAt: this.roundResetAt
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
