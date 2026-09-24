// Cosmetic spring motion only; collisions and positions stay authoritative.
const blobBodies = new Map();
const reducedBlobMotion = matchMedia('(prefers-reduced-motion: reduce)');
function drawBlob(ctx, p, radius, color, now) {
  let body = blobBodies.get(p.id);
  if (!body) {
    body = { x: p.x, y: p.y, tailX: p.x, tailY: p.y, vx: 0, vy: 0,
      angle: 0, stretch: 0, stretchVelocity: 0, phase: Number(p.id) || 0, time: now };
    blobBodies.set(p.id, body);
  }
  const dt = Math.min(0.05, Math.max(0, (now - body.time) / 1000));
  body.time = now;
  const dx = p.x - body.x, dy = p.y - body.y;
  const moving = !p.duel && Math.hypot(dx, dy) > 0.5;
  const targetAngle = moving ? Math.atan2(dy, dx) : body.angle;
  const turn = Math.atan2(Math.sin(targetAngle - body.angle), Math.cos(targetAngle - body.angle));
  body.angle += turn * (1 - Math.exp(-14 * dt));
  const follow = p.duel ? 1 : 1 - Math.exp(-24 * dt);
  body.x += dx * follow;
  body.y += dy * follow;
  const activity = reducedBlobMotion.matches || p.duel ? 0 : Math.min(1, Math.hypot(dx, dy) / 9);
  body.phase += dt * (4 + activity * 8);
  // The rear follows a damped spring: it catches up after each forward pulse.
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  for (let i = 0; i < steps; i++) {
    const step = dt / steps;
    body.vx += ((body.x - body.tailX) * 100 - body.vx * 17) * step;
    body.vy += ((body.y - body.tailY) * 100 - body.vy * 17) * step;
    body.tailX += body.vx * step;
    body.tailY += body.vy * step;
    const target = activity * (0.22 + Math.sin(body.phase) * 0.12);
    body.stretchVelocity += ((target - body.stretch) * 170 - body.stretchVelocity * 14) * step;
    body.stretch += body.stretchVelocity * step;
  }
  const spitAge = (now - (body.spitAt ?? -1000)) / 340;
  const recoil = spitAge >= 0 && spitAge < 1 ? Math.sin(spitAge * Math.PI * 2) * .22 * (1 - spitAge) : 0;
  const stretch = reducedBlobMotion.matches ? 0 : body.stretch - recoil;
  const lagX = body.tailX - body.x, lagY = body.tailY - body.y;
  const lagLimit = Math.min(1, radius * 0.6 / (Math.hypot(lagX, lagY) || 1));
  const points = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
    const rear = Math.max(0, -cos) ** 2;
    const ripple = reducedBlobMotion.matches ? 0 : Math.sin(a * 3 - body.phase) * (0.014 + activity * 0.025);
    const x = cos * radius * (1 + stretch + ripple);
    const y = sin * radius * (1 - stretch * 0.35 + ripple);
    points.push({
      x: body.x + x * Math.cos(body.angle) - y * Math.sin(body.angle) + rear * lagX * lagLimit * (reducedBlobMotion.matches ? 0 : 1),
      y: body.y + x * Math.sin(body.angle) + y * Math.cos(body.angle) + rear * lagY * lagLimit * (reducedBlobMotion.matches ? 0 : 1),
    });
  }
  ctx.save();
  const gradient = ctx.createRadialGradient(body.x - radius * .35, body.y - radius * .4, radius * .05, body.x, body.y, radius * 1.5);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(.25, color);
  gradient.addColorStop(1, color + '88');
  ctx.fillStyle = gradient;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  const last = points[points.length - 1];
  ctx.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  });
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff66';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Eyes stay above the central mass number and glance toward travel.
  for (const side of [-1, 1]) {
    const x = body.x + side * radius * .23, y = body.y - radius * .57;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y, radius * .15, radius * .19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#171b35';
    ctx.beginPath(); ctx.arc(x + Math.cos(body.angle) * radius * .055, y + Math.sin(body.angle) * radius * .055, radius * .075, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return body;
}

function drawSlimeProjectile(ctx, slime, now) {
  ctx.save();
  ctx.translate(slime.x, slime.y);
  ctx.rotate(slime.angle);
  const color = slime.color || '#6ee7f9';
  const wobble = reducedBlobMotion.matches ? 0 : Math.sin(now / 65) * 3;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  // A tapered, sticky strand connects the expelled blob to its droplets.
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-54, wobble); ctx.quadraticCurveTo(-25, -wobble * 2, 0, 0); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = .85 - i * .2;
    ctx.beginPath(); ctx.ellipse(-28 - i * 16, Math.sin(now / 90 + i) * (i + 1) * 2, 7 - i * 1.5, 4 - i * .7, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-30,0);
  ctx.bezierCurveTo(-12,-8-wobble,3,-23,20,-14);
  ctx.bezierCurveTo(39,-4,26,21,10,17);
  ctx.bezierCurveTo(-5,14+wobble,-12,4,-30,0);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffffb0';
  ctx.beginPath();ctx.ellipse(15,-7,7,3,-.3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawAttachedSlime(ctx, player, now) {
  const slime = player.slime, r = 10 + Math.sqrt(player.mass) * 3;
  ctx.save();ctx.translate(player.x,player.y);ctx.rotate(slime.angle);
  ctx.fillStyle = slime.color || '#6ee7f9';
  ctx.strokeStyle = '#ffffff99';ctx.lineWidth=2;
  const pulse = reducedBlobMotion.matches ? 1 : 1 + Math.sin(now / 140) * .05;
  ctx.beginPath();ctx.ellipse(r * .83,0,r * .26 * pulse,r * .65,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  for (let i=-1;i<=1;i++) {
    ctx.beginPath();ctx.ellipse(r*(1.03+Math.abs(i)*.03),i*r*.4,r*.16,r*.2,0,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#ffffffaa';ctx.beginPath();ctx.ellipse(r*.9,-r*.24,3,r*.15,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
