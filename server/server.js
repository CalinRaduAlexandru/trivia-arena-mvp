require("dotenv").config?.();
const http = require("http"),
  crypto = require("crypto"),
  express = require("express"),
  bcrypt = require("bcryptjs"),
  jwt = require("jsonwebtoken"),
  rateLimit = require("express-rate-limit"),
  { Server } = require("socket.io");
const cfg = require("./config"),
  { stmts, publicUser, saveUser } = require("./db"),
  { nextQuestion } = require("./questions");
const app = express(),
  httpServer = http.createServer(app),
  io = new Server(httpServer);
const rooms = new Map();
app.use(express.json());
app.set("trust proxy", 1);
app.use(express.static(require("path").join(__dirname, "..", "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, max: 120 }));
function cleanName(v) {
  return String(v || "")
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .slice(0, 18);
}
function tokenFor(u) {
  const token = jwt.sign({ id: u.id }, cfg.jwtSecret, { expiresIn: "30d" });
  stmts.session.run(token, u.id);
  return token;
}
function auth(req, res, next) {
  try {
    const p = jwt.verify(
        req.headers.authorization?.replace("Bearer ", "") || "",
        cfg.jwtSecret,
      ),
      u = stmts.byId.get(p.id);
    if (!u) throw Error();
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: "Please log in again." });
  }
}
app.post("/api/auth/signup", async (req, res) => {
  const name = cleanName(req.body.username),
    password = String(req.body.password || "");
  if (name.length < 2 || password.length < 4)
    return res.status(400).json({
      error: "Username needs 2+ characters and PIN/password needs 4+.",
    });
  if (stmts.byName.get(name))
    return res.status(409).json({ error: "That username is already taken." });
  const hash = await bcrypt.hash(password, 10),
    info = stmts.create.run(name, hash),
    u = stmts.byId.get(info.lastInsertRowid);
  res.json({ token: tokenFor(u), user: publicUser(u) });
});
app.post("/api/auth/login", async (req, res) => {
  const u = stmts.byName.get(cleanName(req.body.username));
  if (
    !u ||
    !(await bcrypt.compare(String(req.body.password || ""), u.password_hash))
  )
    return res.status(401).json({ error: "Incorrect username or password." });
  res.json({ token: tokenFor(u), user: publicUser(u) });
});
app.get("/api/me", auth, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);
app.post("/api/profile/skin", auth, (req, res) => {
  const u = req.user,
    skin = String(req.body.skin);
  const unlocked = JSON.parse(u.unlocked_skins);
  if (!unlocked.includes(skin))
    return res.status(400).json({ error: "Skin is locked." });
  u.equipped_skin = skin;
  saveUser(u);
  res.json({ user: publicUser(u) });
});
app.get("/api/config", (req, res) =>
  res.json({ arena: cfg.arena, skins: cfg.skins, debug: cfg.debug }),
);
function roomView(r) {
  return {
    code: r.code,
    hostId: r.hostId,
    status: r.status,
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      username: p.user.username,
      skin: p.user.equipped_skin,
      correct: p.user.correct,
      ready: p.ready,
    })),
  };
}
function emitRoom(r) {
  io.to(r.code).emit("room:update", roomView(r));
}
function spawn(r) {
  r.nets = [];
  let a = 0;
  for (const p of r.players.values()) {
    const angle = (a++ * Math.PI * 2) / r.players.size;
    p.x = cfg.arena.width / 2 + Math.cos(angle) * 300;
    p.y = cfg.arena.height / 2 + Math.sin(angle) * 220;
    p.vx = 0;
    p.vy = 0;
    p.mass = cfg.arena.baseMass + Math.log1p(p.user.correct) * 18;
    p.roundCorrect = 0;
    p.roundWins = 0;
    p.roundLosses = 0;
    p.duel = null;
    p.cooldownUntil = 0;
    p.lastDirection = { x: 1, y: 0 };
    p.netCooldownUntil = 0;
  }
}
function publicState(r) {
  return {
    now: Date.now(),
    roundEndsAt: r.roundEndsAt,
    nets: r.nets.map((net) => ({
      id: net.id,
      x: net.x,
      y: net.y,
      angle: net.angle,
      expiresAt: net.expiresAt,
      color: net.color,
      bornAt: net.bornAt,
    })),
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      username: p.user.username,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      mass: p.mass,
      skin: p.user.equipped_skin,
      duel: p.duel
        ? { opponentId: p.duel.opponentId, endsAt: p.duel.endsAt }
        : null,
      cooldownUntil: p.cooldownUntil,
      netCooldownUntil: p.netCooldownUntil,
      slime: p.duel ? p.slime : null,
    })),
  };
}
function startGame(r) {
  if (r.players.size < 2) return;
  r.status = "playing";
  r.roundEndsAt = Date.now() + cfg.arena.roundMs;
  r.usedQuestions = new Set();
  spawn(r);
  emitRoom(r);
  io.to(r.code).emit("game:started", { roundEndsAt: r.roundEndsAt });
}
function finish(r) {
  if (r.status !== "playing") return;
  r.status = "results";
  for (const p of r.players.values()) saveUser(p.user);
  io.to(r.code).emit("game:results", {
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      username: p.user.username,
      mass: Math.round(p.mass),
      correct: p.roundCorrect,
      wins: p.roundWins,
      losses: p.roundLosses,
      totalCorrect: p.user.correct,
    })),
  });
}
function beginDuel(r, a, b) {
  a.slime = b.slime = null;
  const q = nextQuestion(r),
    endsAt = Date.now() + cfg.arena.duelMs,
    duel = { question: q, endsAt, answers: new Map(), opponentId: b.id };
  a.duel = duel;
  b.duel = { question: q, endsAt, answers: duel.answers, opponentId: a.id };
  io.to(a.socketId).emit("duel:started", {
    opponent: { id: b.id, username: b.user.username },
    question: { id: q.id, prompt: q.prompt, options: q.options },
    endsAt,
  });
  io.to(b.socketId).emit("duel:started", {
    opponent: { id: a.id, username: a.user.username },
    question: { id: q.id, prompt: q.prompt, options: q.options },
    endsAt,
  });
  io.to(r.code).emit("duel:visible", {
    a: { id: a.id, username: a.user.username },
    b: { id: b.id, username: b.user.username },
    endsAt,
  });
}
function resolveDuel(r, a, b) {
  if (!a.duel || !b.duel) return;
  const startingMassA = a.mass,
    startingMassB = b.mass;
  const q = a.duel.question,
    aa = a.duel.answers.get(a.id),
    bb = a.duel.answers.get(b.id),
    ac = aa === q.correctIndex,
    bc = bb === q.correctIndex;
  a.user.answered++;
  b.user.answered++;
  if (ac) (a.user.correct++, a.roundCorrect++);
  if (bc) (b.user.correct++, b.roundCorrect++);
  let winner = null;
  if (ac && !bc) {
    winner = a;
    a.mass += cfg.arena.transfer;
    b.mass = Math.max(cfg.arena.minMass, b.mass - cfg.arena.transfer);
    a.user.duel_wins++;
    b.user.duel_losses++;
    a.roundWins++;
    b.roundLosses++;
  } else if (bc && !ac) {
    winner = b;
    b.mass += cfg.arena.transfer;
    a.mass = Math.max(cfg.arena.minMass, a.mass - cfg.arena.transfer);
    b.user.duel_wins++;
    a.user.duel_losses++;
    b.roundWins++;
    a.roundLosses++;
  } else if (!ac && !bc) {
    a.mass = Math.max(cfg.arena.minMass, a.mass - cfg.arena.wrongPenalty);
    b.mass = Math.max(cfg.arena.minMass, b.mass - cfg.arena.wrongPenalty);
  }
  saveUser(a.user);
  saveUser(b.user);
  const result = {
    a: { id: a.id, correct: ac, massDelta: Math.round(a.mass - startingMassA) },
    b: { id: b.id, correct: bc, massDelta: Math.round(b.mass - startingMassB) },
    winnerId: winner?.id || null,
  };
  a.duel = null;
  b.duel = null;
  a.cooldownUntil = b.cooldownUntil = Date.now() + cfg.arena.cooldownMs;
  io.to(r.code).emit("duel:resolved", result);
}
function tick(r, dt) {
  if (r.status !== "playing") return;
  const now = Date.now();
  if (now >= r.roundEndsAt) {
    finish(r);
    return;
  }
  const ps = [...r.players.values()];
  r.nets = r.nets.filter((net) => {
    net.x += Math.cos(net.angle) * cfg.arena.netSpeed * dt;
    net.y += Math.sin(net.angle) * cfg.arena.netSpeed * dt;
    if (Date.now() >= net.expiresAt) return false;
    for (const target of ps) {
      if (
        target.id === net.ownerId ||
        target.duel ||
        target.cooldownUntil > now
      )
        continue;
      if (
        Math.hypot(target.x - net.x, target.y - net.y) <
        45 + Math.sqrt(target.mass) * 2.2
      ) {
        const owner = r.players.get(net.ownerId);
        if (owner && !owner.duel && owner.cooldownUntil <= now) {
          beginDuel(r, owner, target);
          target.slime = { angle: net.angle + Math.PI, color: net.color, hitAt: now };
          io.to(r.code).emit('slime:hit', { targetId: target.id, ...target.slime });
        }
        return false;
      }
    }
    return true;
  });
  for (const p of ps) {
    if (p.duel) continue;
    p.x = Math.max(35, Math.min(cfg.arena.width - 35, p.x + p.vx * dt));
    p.y = Math.max(35, Math.min(cfg.arena.height - 35, p.y + p.vy * dt));
  }
  for (const p of ps)
    if (p.duel && now >= p.duel.endsAt) {
      const other = r.players.get(p.duel.opponentId);
      if (other) resolveDuel(r, p, other);
    }
  io.to(r.code).emit("game:state", publicState(r));
}
io.on("connection", (socket) => {
  socket.on("room:create", ({ token }, ack) =>
    joinRoom(socket, token, null, ack, true),
  );
  socket.on("room:join", ({ token, code }, ack) =>
    joinRoom(socket, token, String(code || "").toUpperCase(), ack, false),
  );
  socket.on("room:start", () => {
    const p = findPlayer(socket);
    if (p && String(p.room.hostId) === String(p.id)) startGame(p.room);
  });
  socket.on("player:input", (data) => {
    const p = findPlayer(socket);
    if (!p || p.room.status !== "playing" || p.duel) return;
    let x = Number(data.x) || 0,
      y = Number(data.y) || 0,
      n = Math.hypot(x, y) || 1;
    p.vx = Math.max(-1, Math.min(1, x / n)) * cfg.arena.speed;
    p.vy = Math.max(-1, Math.min(1, y / n)) * cfg.arena.speed;
    if (x || y) p.lastDirection = { x: x / n, y: y / n };
  });
  socket.on("player:net", () => {
    const p = findPlayer(socket),
      now = Date.now();
    if (!p || p.room.status !== "playing" || p.duel || p.netCooldownUntil > now)
      return;
    const direction = p.lastDirection || { x: 1, y: 0 };
    p.netCooldownUntil = now + 3000;
    p.room.nets.push({
      color: cfg.skins.find(s => s.id === p.user.equipped_skin)?.color || '#6ee7f9',
      bornAt: now,
      id: `${p.id}-${now}`,
      ownerId: p.id,
      x: p.x + direction.x * 35,
      y: p.y + direction.y * 35,
      angle: Math.atan2(direction.y, direction.x),
      expiresAt: now + (cfg.arena.netRange / cfg.arena.netSpeed) * 1000,
    });
    io.to(p.room.code).emit('slime:cast', { playerId: p.id });
  });
  socket.on("duel:answer", ({ index }, ack) => {
    const p = findPlayer(socket);
    if (!p || !p.duel) return ack?.({ ok: false });
    if (p.duel.answers.has(p.id)) return ack?.({ ok: false });
    p.duel.answers.set(p.id, Number(index));
    ack?.({ ok: true });
    const o = p.room.players.get(p.duel.opponentId);
    if (o && o.duel && o.duel.answers.has(o.id)) resolveDuel(p.room, p, o);
  });
  socket.on("game:again", () => {
    const p = findPlayer(socket);
    if (p && String(p.room.hostId) === String(p.id)) startGame(p.room);
  });
  socket.on("disconnect", () => {
    const p = findPlayer(socket);
    if (!p) return;
    p.room.players.delete(p.id);
    if (p.room.players.size === 0) rooms.delete(p.room.code);
    else {
      if (String(p.room.hostId) === String(p.id))
        p.room.hostId = [...p.room.players.keys()][0];
      emitRoom(p.room);
    }
  });
});
function findPlayer(socket) {
  for (const r of rooms.values())
    for (const p of r.players.values())
      if (p.socketId === socket.id) {
        p.room = r;
        return p;
      }
  return null;
}
function joinRoom(socket, token, code, ack, create) {
  try {
    const p = stmts.getSession.get(token),
      u = p || null;
    if (!u) return ack?.({ error: "Please log in again." });
    if (!create && !rooms.has(code)) return ack?.({ error: "Room not found." });
    let r = create ? null : rooms.get(code);
    if (create) {
      if (rooms.size >= 9000) return ack?.({ error: "All rooms are busy. Try again later." });
      do code = String(crypto.randomInt(1000, 10000));
      while (rooms.has(code));
      r = {
        code,
        hostId: u.id,
        status: "lobby",
        players: new Map(),
        usedQuestions: new Set(),
        nets: [],
      };
      rooms.set(code, r);
    }
    if (r.status !== "lobby")
      return ack?.({ error: "This game has already started." });
    if (r.players.size >= 8) return ack?.({ error: "Room is full." });
    const id = String(u.id);
    r.players.set(id, {
      id,
      user: u,
      socketId: socket.id,
      ready: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      mass: 0,
      duel: null,
      cooldownUntil: 0,
      lastDirection: { x: 1, y: 0 },
      netCooldownUntil: 0,
    });
    socket.join(r.code);
    emitRoom(r);
    ack?.({ room: roomView(r) });
  } catch (e) {
    ack?.({ error: "Could not join room." });
  }
}
setInterval(() => {
  for (const r of rooms.values()) tick(r, cfg.arena.tickMs / 1000);
}, cfg.arena.tickMs);
httpServer.listen(cfg.port, () =>
  console.log(`Trivia Arena running at http://localhost:${cfg.port}`),
);
