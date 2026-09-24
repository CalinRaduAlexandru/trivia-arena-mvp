const $ = (s) => document.querySelector(s),
  socket = io();
const netStatus = document.createElement("div");
netStatus.id = "net-status";
netStatus.style.cssText =
  "background:#e8fff4;border-radius:13px;padding:10px 16px;min-width:142px;text-align:center;box-shadow:0 6px 20px #05071628;color:#26a96f;font:800 12px 'Space Grotesk';letter-spacing:1px";
netStatus.textContent = "PLASĂ · GATA";
document.querySelector(".hud")?.append(netStatus);
const roomBadge = document.createElement("div");
roomBadge.id = "room-badge";
roomBadge.hidden = true;
document.body.append(roomBadge);
const roomInput = $("#room-code");
roomInput.inputMode = "numeric";
roomInput.pattern = "[0-9]{4}";
roomInput.placeholder = "1234";
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
const mobileControls = document.createElement("div");
mobileControls.id = "mobile-controls";
mobileControls.innerHTML = `<div id="minimap"><canvas id="minimap-canvas"></canvas></div><button id="mobile-attack" aria-label="Aruncă plasa"><span>ATAC</span><b>GATA</b></button><div id="joystick"><div id="joystick-thumb"></div></div>`;
mobileControls.style.cssText =
  "display:none;position:absolute;inset:0;z-index:20;pointer-events:none;touch-action:none";
document.querySelector(".game-wrap")?.append(mobileControls);
const mobileStyle = document.createElement("style");
mobileStyle.textContent = `
  #room-badge { position:fixed; z-index:35; bottom:calc(8px + env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); padding:6px 12px; border-radius:20px; background:#171b35e8; color:#fff; font:600 13px 'DM Sans',sans-serif; white-space:nowrap; pointer-events:none; }
  @media (pointer: coarse), (max-width: 700px) {
    .in-game .top { display:none; }
    .in-game, .in-game #app, .in-game main, .in-game .game-screen { width:100vw; height:100dvh; min-height:100dvh; overflow:hidden; }
    .in-game .game-screen { min-height:100vh; }
    .in-game .game-wrap { height:100vh; }
    #mobile-controls { display: block !important; }
    #minimap { pointer-events:none; position:absolute; left:14px; top:14px; width:152px; height:96px; border:3px solid #ffffffaa; border-radius:12px; background:#171b35; box-shadow:0 7px 20px #080b2455; overflow:hidden; }
    #minimap-canvas { display:block; width:100%; height:100%; }
    #mobile-attack { pointer-events:auto; position:absolute; left:24px; bottom:26px; width:116px; height:116px; border-radius:50%; border:5px solid #fff; background:#ff6b63; color:#fff; box-shadow:0 8px 24px #080b2455, inset 0 -10px 0 #d84d52; font:900 20px 'Space Grotesk'; transition:background .05s linear, box-shadow .2s; }
    #mobile-attack b { display:block; font-size:16px; margin-top:5px; color:#ffe59a; }
    #mobile-attack.cooldown { background:#68708f; box-shadow:0 8px 24px #080b2455, inset 0 -8px 0 #4d5573; }
    #joystick { pointer-events:auto; position:absolute; right:24px; bottom:26px; width:156px; height:156px; border:4px solid #ffffff66; background:#ffffff18; border-radius:50%; }
    #joystick-thumb { position:absolute; left:43px; top:43px; width:66px; height:66px; border-radius:50%; background:#ffffffdd; border:5px solid #6ee7f9; box-shadow:0 5px 15px #080b2455; }
    .game-screen .hud { top:calc(10px + env(safe-area-inset-top)); left:auto; right:12px; width:58px; height:58px; display:block; }
    .game-screen .hud > .hud-pill:not(#sound), .game-screen #net-status, .game-screen .hud-center { display:none !important; }
    .game-screen #sound { display:block; width:58px; height:58px; min-width:58px; font-size:25px; padding:8px 4px; }
    .game-screen .duel-card { z-index:30; }
  }
  @media (max-width:700px) and (orientation:portrait) { #mobile-controls::after { display:none; } }
`;
document.head.append(mobileStyle);
const mobileMode = () =>
  window.matchMedia("(pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0;
const minimapCanvas = document.querySelector("#minimap-canvas");
const minimapCtx = minimapCanvas?.getContext("2d");
if (minimapCanvas) {
  minimapCanvas.width = 304;
  minimapCanvas.height = 192;
}
let token = localStorage.getItem("ta_token"),
  me = null,
  room = null,
  config = null,
  mode = "login",
  gameState = null,
  muted = false,
  audio;
const screens = ["auth", "lobby", "room", "game", "results"];
function show(id) {
  screens.forEach((x) => $("#" + x).classList.toggle("hidden", x !== id));
  roomBadge.hidden = !room || !["room", "game", "results"].includes(id);
  document.body.classList.toggle("in-game", id === "game");
}
function api(path, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
  return fetch(path, opts).then(async (r) => {
    const x = await r.json();
    if (!r.ok) throw Error(x.error || "Something went wrong");
    return x;
  });
}
function setMe(u) {
  me = u;
  $("#welcome-name").textContent = u.username;
  $("#stat-correct").textContent = u.correct;
  $("#stat-answered").textContent = u.answered;
  $("#stat-wins").textContent = u.duelWins;
  $("#stat-losses").textContent = u.duelLosses;
  $("#hud-correct").textContent = u.correct;
  const skin = config?.skins.find((s) => s.id === u.equippedSkin);
  $("#stat-level").textContent = (skin?.name || "DEFAULT").toUpperCase();
  if (config) {
    $("#skin-select").innerHTML = config.skins
      .map(
        (s) =>
          `<option value="${s.id}" ${u.unlockedSkins.includes(s.id) ? "" : "disabled"}>${s.name}${u.unlockedSkins.includes(s.id) ? "" : " — " + s.threshold + " correct"}</option>`,
      )
      .join("");
    $("#skin-select").value = u.equippedSkin;
  }
}
async function boot() {
  try {
    config = await api("/api/config");
    if (token) {
      const x = await api("/api/me");
      setMe(x.user);
      show("lobby");
    } else show("auth");
  } catch {
    localStorage.removeItem("ta_token");
    show("auth");
  }
}
document.querySelectorAll(".tab").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.mode;
      document
        .querySelectorAll(".tab")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("#auth-submit").innerHTML =
        mode === "login"
          ? "ENTER ARENA <span>→</span>"
          : "CREATE PROFILE <span>→</span>";
      $("#auth-error").textContent = "";
    }),
);
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  $("#auth-error").textContent = "";
  try {
    const x = await api(
      "/api/auth/" + (mode === "login" ? "login" : "signup"),
      {
        method: "POST",
        body: JSON.stringify({
          username: $("#username").value,
          password: $("#password").value,
        }),
      },
    );
    token = x.token;
    localStorage.setItem("ta_token", token);
    setMe(x.user);
    show("lobby");
  } catch (err) {
    $("#auth-error").textContent = err.message;
  }
};
$("#logout").onclick = () => {
  token = null;
  localStorage.removeItem("ta_token");
  location.reload();
};
$("#create-room").onclick = () =>
  socket.emit("room:create", { token }, roomAck);
$("#join-form").onsubmit = (e) => {
  e.preventDefault();
  socket.emit("room:join", { token, code: $("#room-code").value }, roomAck);
};
function roomAck(x) {
  if (x?.error) {
    $("#room-error").textContent = x.error;
    return;
  }
  room = x.room;
  renderRoom(room);
  show("room");
}
function renderRoom(r) {
  roomBadge.textContent = `CAMERA · ${r.code}`;
  $("#room-error").textContent = "";
  $("#room-code-display").textContent = r.code;
  $("#player-count").textContent = r.players.length;
  $("#start-game").disabled = !r.players.length || r.players.length < 2;
  $("#start-game").style.opacity = r.players.length < 2 ? 0.5 : 1;
  $("#player-list").innerHTML = r.players
    .map(
      (p) =>
        `<div class="player-row"><div class="avatar-mini" style="--skin:${config.skins.find((s) => s.id === p.skin)?.color || "#6ee7f9"}"></div><div><b>${escapeHtml(p.username)}</b><small>${config.skins.find((s) => s.id === p.skin)?.name || "Default"} · ${p.correct} correct</small></div>${p.id == r.hostId ? '<span class="you">HOST</span>' : ""}</div>`,
    )
    .join("");
}
$("#start-game").onclick = () => socket.emit("room:start");
$("#leave-room").onclick = () => {
  location.reload();
};
socket.on("room:update", (r) => {
  room = r;
  renderRoom(r);
});
socket.on("game:started", (x) => {
  show("game");
  $("#hud-room").textContent = room.code;
  requestAnimationFrame(() => resize());
  startGame(x.roundEndsAt);
});
socket.on("game:state", (s) => {
  gameState = s;
});
socket.on("duel:started", (d) => openDuel(d));
socket.on("duel:visible", (d) => {
  if (d.a.id !== String(me.id) && d.b.id !== String(me.id)) {
    $("#spectator-duel").classList.remove("hidden");
    $("#spectator-names").textContent = d.a.username + " ⚔ " + d.b.username;
    spectatorEnds = d.endsAt;
  }
});
socket.on("duel:resolved", (r) => {
  showMassDelta(r.a);
  showMassDelta(r.b);
  if (r.winnerId) {
    toast(
      r.winnerId === String(me.id)
        ? "DUEL WON · +10 MASS"
        : "DUEL LOST · -10 MASS",
    );
  } else
    toast(
      r.a.correct && r.b.correct
        ? "BOTH CORRECT · +1 PERMANENT EACH"
        : "BOTH MISSED · MASS LOST",
    );
  refreshMe();
});
socket.on("game:results", (r) => {
  showResults(r);
  refreshMe();
});
function refreshMe() {
  api("/api/me")
    .then((x) => setMe(x.user))
    .catch(() => {});
}
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
let spectatorEnds = 0;
let massDeltas = [];
function showMassDelta(playerResult) {
  const player = gameState?.players.find(
    (p) => p.id === String(playerResult.id),
  );
  if (!player || !playerResult.massDelta) return;
  massDeltas.push({
    x: player.x,
    y: player.y,
    value: playerResult.massDelta,
    color: playerResult.massDelta > 0 ? "#53e09a" : "#ff6f76",
    expiresAt: Date.now() + 1600,
  });
}
function openDuel(d) {
  $("#duel-card").classList.remove("hidden");
  $("#duel-opponent").textContent = d.opponent.username;
  $("#duel-question").textContent = d.question.prompt;
  $("#answers").innerHTML = d.question.options
    .map(
      (x, i) =>
        `<button class="answer" data-index="${i}">${escapeHtml(x)}</button>`,
    )
    .join("");
  document.querySelectorAll(".answer").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll(".answer")
          .forEach((x) => (x.disabled = true));
        b.classList.add("selected");
        socket.emit("duel:answer", { index: Number(b.dataset.index) });
      }),
  );
  window.duelEnds = d.endsAt;
}
let arenaAnimationFrame = null;
function startGame(end) {
  cancelAnimationFrame(arenaAnimationFrame);
  blobBodies.clear();
  function frame() {
    draw();
    updateHud(end);
    arenaAnimationFrame = requestAnimationFrame(frame);
  }
  arenaAnimationFrame = requestAnimationFrame(frame);
}
function updateHud(end) {
  const left = Math.max(0, end - Date.now());
  $("#hud-timer").textContent =
    Math.floor(left / 60000)
      .toString()
      .padStart(2, "0") +
    ":" +
    Math.floor((left % 60000) / 1000)
      .toString()
      .padStart(2, "0");
  const mep = gameState?.players.find((p) => p.id === String(me.id));
  if (mep) {
    $("#hud-mass").textContent = Math.round(mep.mass);
    const netLeft = Math.max(0, mep.netCooldownUntil - Date.now());
    netStatus.textContent =
      netLeft > 0 ? `PLASĂ · ${(netLeft / 1000).toFixed(1)}s` : "PLASĂ · GATA";
    netStatus.style.color = netLeft > 0 ? "#d66b32" : "#26a96f";
    netStatus.style.background = netLeft > 0 ? "#fff0df" : "#e8fff4";
    if (mobileAttack) {
      mobileAttack.classList.toggle("cooldown", netLeft > 0);
      const progress = Math.min(1, Math.max(0, 1 - netLeft / 3000));
      mobileAttack.style.background =
        netLeft > 0
          ? `conic-gradient(from -90deg, #ffb15c ${progress * 360}deg, #59627f ${progress * 360}deg)`
          : "#ff6b63";
      mobileAttack.querySelector("b").textContent =
        netLeft > 0 ? `${(netLeft / 1000).toFixed(1)}s` : "GATA";
    }
    if (mep.duel && !$("#duel-card").classList.contains("hidden")) {
      $("#duel-time").textContent = Math.max(
        0,
        (mep.duel.endsAt - Date.now()) / 1000,
      ).toFixed(1);
    } else if (!mep.duel) $("#duel-card").classList.add("hidden");
  }
  if (spectatorEnds) {
    $("#spectator-progress").style.width =
      Math.max(0, ((spectatorEnds - Date.now()) / 8000) * 100) + "%";
    if (Date.now() > spectatorEnds) {
      spectatorEnds = 0;
      $("#spectator-duel").classList.add("hidden");
    }
  }
}
const canvas = $("#arena"),
  ctx = canvas.getContext("2d");
function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener("resize", resize);
resize();
let keys = {};
function canUseGameKeys(event) {
  const editable = (element) => element instanceof Element &&
    (element.matches("input, textarea, select") || element.isContentEditable);
  return !$("#game").classList.contains("hidden") &&
    !editable(event.target) && !editable(document.activeElement);
}
addEventListener("keydown", (e) => {
  if (!canUseGameKeys(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space") {
    const currentPlayer = gameState?.players.find(
      (p) => p.id === String(me?.id),
    );
    if (currentPlayer?.netCooldownUntil > Date.now()) {
      toast(
        `PLASA SE REINCARCA · ${((currentPlayer.netCooldownUntil - Date.now()) / 1000).toFixed(1)}s`,
      );
      e.preventDefault();
      return;
    }
    socket.emit("player:net");
    e.preventDefault();
    return;
  }
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "w",
      "a",
      "s",
      "d",
    ].map((key) => key.toLowerCase()).includes(e.key.toLowerCase())
  ) {
    keys[e.key.toLowerCase()] = true;
    e.preventDefault();
    sendInput();
  }
});
addEventListener("keyup", (e) => {
  if (!canUseGameKeys(e) || !Object.hasOwn(keys, e.key.toLowerCase())) return;
  keys[e.key.toLowerCase()] = false;
  sendInput();
});
addEventListener("blur", () => {
  keys = {};
  if (!$("#game").classList.contains("hidden")) sendInput();
});
function sendInput() {
  const x =
      (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
    y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  socket.emit("player:input", { x, y });
}
const joystick = document.querySelector("#joystick");
const joystickThumb = document.querySelector("#joystick-thumb");
let joystickTouch = null;
function updateJoystick(touch) {
  const rect = joystick.getBoundingClientRect();
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  let dx = touch.clientX - center.x,
    dy = touch.clientY - center.y;
  const max = rect.width * 0.31,
    distance = Math.hypot(dx, dy) || 1;
  if (distance > max) {
    dx = (dx / distance) * max;
    dy = (dy / distance) * max;
  }
  joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
  socket.emit("player:input", { x: dx / max, y: dy / max });
}
joystick?.addEventListener(
  "touchstart",
  (event) => {
    joystickTouch = event.changedTouches[0].identifier;
    updateJoystick(event.changedTouches[0]);
    event.preventDefault();
  },
  { passive: false },
);
joystick?.addEventListener(
  "touchmove",
  (event) => {
    const touch = [...event.changedTouches].find(
      (item) => item.identifier === joystickTouch,
    );
    if (touch) updateJoystick(touch);
    event.preventDefault();
  },
  { passive: false },
);
function stopJoystick() {
  joystickTouch = null;
  joystickThumb.style.transform = "translate(0, 0)";
  socket.emit("player:input", { x: 0, y: 0 });
}
joystick?.addEventListener("touchend", stopJoystick);
joystick?.addEventListener("touchcancel", stopJoystick);
const mobileAttack = document.querySelector("#mobile-attack");
const camera = { x: null, y: null };
mobileAttack?.addEventListener(
  "touchstart",
  (event) => {
    event.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  },
  { passive: false },
);
function draw() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (
    canvas.width !== Math.floor(w * devicePixelRatio) ||
    canvas.height !== Math.floor(h * devicePixelRatio)
  ) {
    resize();
    return;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#171B35";
  ctx.fillRect(0, 0, w, h);
  if (!gameState) return;
  const focus =
    gameState.players.find((p) => p.id === String(me?.id)) ||
    gameState.players[0];
  const zoom = mobileMode() ? 1.15 : 1.18;
  const scale =
    Math.max(w / config.arena.width, h / config.arena.height) * zoom;
  const halfWorldW = w / (2 * scale),
    halfWorldH = h / (2 * scale);
  const edgePadding = 16 / scale;
  const bottomPadding = mobileMode()
    ? (joystick.getBoundingClientRect().height + parseFloat(getComputedStyle(joystick).bottom) + 16) / scale
    : edgePadding;
  const targetCameraX = Math.max(
    halfWorldW - edgePadding,
    Math.min(
      config.arena.width - halfWorldW + edgePadding,
      focus?.x || config.arena.width / 2,
    ),
  );
  const targetCameraY = Math.max(
    halfWorldH - edgePadding,
    Math.min(
      config.arena.height - halfWorldH + bottomPadding,
      focus?.y || config.arena.height / 2,
    ),
  );
  camera.x =
    camera.x === null
      ? targetCameraX
      : camera.x + (targetCameraX - camera.x) * 0.12;
  camera.y =
    camera.y === null
      ? targetCameraY
      : camera.y + (targetCameraY - camera.y) * 0.12;
  ctx.save();
  ctx.translate(w / 2 - camera.x * scale, h / 2 - camera.y * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#20264a";
  ctx.fillRect(0, 0, config.arena.width, config.arena.height);
  ctx.strokeStyle = "#ffffff0d";
  ctx.lineWidth = 2;
  for (let x = 0; x < config.arena.width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, config.arena.height);
    ctx.stroke();
  }
  for (let y = 0; y < config.arena.height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(config.arena.width, y);
    ctx.stroke();
  }
  for (const net of gameState.nets || []) {
    ctx.save();
    ctx.translate(net.x, net.y);
    ctx.rotate(net.angle);
    ctx.strokeStyle = "#ffd76a";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#ffd76a";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(-20, -24);
    ctx.lineTo(20, -24);
    ctx.lineTo(26, 24);
    ctx.lineTo(-26, 24);
    ctx.closePath();
    for (let x = -20; x <= 20; x += 10) {
      ctx.moveTo(x, -24);
      ctx.lineTo(x * 1.3, 24);
    }
    for (let y = -14; y <= 14; y += 14) {
      ctx.moveTo(-24, y);
      ctx.lineTo(24, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  const blobNow = performance.now();
  for (const id of blobBodies.keys()) {
    if (!gameState.players.some((p) => p.id === id)) blobBodies.delete(id);
  }
  for (const player of gameState.players) {
    const body = drawBlob(ctx, player, 10 + Math.sqrt(player.mass) * 3,
      (config.skins.find((s) => s.id === player.skin) || config.skins[0]).color, blobNow);
    const p = { ...player, x: body.x, y: body.y };
    const skin = config.skins.find((s) => s.id === p.skin) || config.skins[0],
      r = 10 + Math.sqrt(p.mass) * 3;
    ctx.save();
    if (p.duel) {
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        r + 18 + Math.sin(Date.now() / 150) * 3,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = "#ffbe5c";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.font = `900 ${mobileMode() ? 36 : 24}px Space Grotesk`;
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#11162f";
    ctx.strokeText(Math.round(p.mass), p.x, p.y + (mobileMode() ? 13 : 9));
    ctx.fillText(Math.round(p.mass), p.x, p.y + (mobileMode() ? 13 : 9));
    ctx.font = `800 ${mobileMode() ? 32 : 21}px DM Sans`;
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 7;
    ctx.strokeText(p.username, p.x, p.y + r + 31);
    ctx.fillText(p.username, p.x, p.y + r + 31);
    ctx.restore();
  }
  massDeltas = massDeltas.filter((delta) => {
    const remaining = delta.expiresAt - Date.now();
    if (remaining <= 0) return false;
    ctx.save();
    ctx.globalAlpha = Math.min(1, remaining / 500);
    ctx.fillStyle = delta.color;
    ctx.font = `900 ${mobileMode() ? 54 : 42}px Space Grotesk`;
    ctx.textAlign = "center";
    ctx.shadowColor = delta.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#11162f";
    ctx.strokeText(
      `${delta.value > 0 ? "+" : ""}${delta.value}`,
      delta.x,
      delta.y - 42 - (1600 - remaining) * 0.035,
    );
    ctx.fillText(
      `${delta.value > 0 ? "+" : ""}${delta.value}`,
      delta.x,
      delta.y - 42 - (1600 - remaining) * 0.035,
    );
    ctx.restore();
    return true;
  });
  ctx.restore();
  drawMinimap();
}
function drawMinimap() {
  if (!minimapCtx || !gameState || !config) return;
  const width = minimapCanvas.width,
    height = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, width, height);
  minimapCtx.fillStyle = "#20264a";
  minimapCtx.fillRect(0, 0, width, height);
  minimapCtx.strokeStyle = "#ffffff12";
  minimapCtx.lineWidth = 2;
  for (let x = 0; x <= config.arena.width; x += 240) {
    minimapCtx.beginPath();
    minimapCtx.moveTo((x / config.arena.width) * width, 0);
    minimapCtx.lineTo((x / config.arena.width) * width, height);
    minimapCtx.stroke();
  }
  for (let y = 0; y <= config.arena.height; y += 240) {
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, (y / config.arena.height) * height);
    minimapCtx.lineTo(width, (y / config.arena.height) * height);
    minimapCtx.stroke();
  }
  const local = gameState.players.find((p) => p.id === String(me?.id));
  const visibleWorldW =
    canvas.clientWidth /
    (Math.max(
      canvas.clientWidth / config.arena.width,
      canvas.clientHeight / config.arena.height,
    ) *
      (mobileMode() ? 1.15 : 1.18));
  const visibleWorldH =
    canvas.clientHeight /
    (Math.max(
      canvas.clientWidth / config.arena.width,
      canvas.clientHeight / config.arena.height,
    ) *
      (mobileMode() ? 1.15 : 1.18));
  const viewX = camera.x - visibleWorldW / 2,
    viewY = camera.y - visibleWorldH / 2;
  minimapCtx.strokeStyle = "#ffffffcc";
  minimapCtx.lineWidth = 3;
  minimapCtx.strokeRect(
    (viewX / config.arena.width) * width,
    (viewY / config.arena.height) * height,
    (visibleWorldW / config.arena.width) * width,
    (visibleWorldH / config.arena.height) * height,
  );
  for (const player of gameState.players) {
    const skin =
      config.skins.find((s) => s.id === player.skin) || config.skins[0];
    const x = (player.x / config.arena.width) * width,
      y = (player.y / config.arena.height) * height,
      isLocal = player.id === String(me?.id);
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, isLocal ? 8 : 6, 0, Math.PI * 2);
    minimapCtx.fillStyle = isLocal ? "#ffffff" : skin.color;
    minimapCtx.shadowColor = skin.color;
    minimapCtx.shadowBlur = isLocal ? 10 : 5;
    minimapCtx.fill();
    minimapCtx.shadowBlur = 0;
  }
}
function toast(t) {
  const x = $("#toast");
  x.textContent = t;
  x.classList.add("show");
  setTimeout(() => x.classList.remove("show"), 2500);
}
function showResults(r) {
  const rows = r.players
    .map(
      (p) =>
        `<div class="result-row"><b>${escapeHtml(p.username)}${p.id === String(me.id) ? " (you)" : ""}</b><span><b>${p.mass}</b> mass</span><span>${p.correct} correct</span><span>${p.wins} W</span><span class="answered">${p.losses} L</span></div>`,
    )
    .join("");
  $("#results-table").innerHTML =
    '<div class="result-row result-header"><span>PLAYER</span><span>MASS</span><span>CORRECT</span><span>WINS</span><span class="answered">LOSSES</span></div>' +
    rows;
}
$("#play-again").onclick = () => socket.emit("game:again");
$("#return-lobby").onclick = () => {
  show("room");
  renderRoom(room);
};
$("#skin-select").onchange = async (e) => {
  try {
    const x = await api("/api/profile/skin", {
      method: "POST",
      body: JSON.stringify({ skin: e.target.value }),
    });
    setMe(x.user);
  } catch (err) {
    toast(err.message);
  }
};
$("#sound").onclick = () => {
  muted = !muted;
  $("#sound").textContent = muted ? "×" : "♫";
};
boot();
