// Grind Down: fall forever, dodge the blades, stay ahead of the grinder.
import { W, H, L, R, STEP, GRIND_Y, PX_PER_M, PAL, BLOOD_BG } from './config.js';
import { rand, randi, pick, chance, store } from './util.js';
import { buildSprites } from './sprites.js';
import { Decals } from './decals.js';
import { Particles } from './particles.js';
import { World, START_Y } from './world.js';
import { Player } from './player.js';
import { Grinder } from './grinder.js';
import { Input } from './input.js';
import { sfx, initAudio, startMusic, stopMusic, toggleMute, isMuted, setTempo } from './audio.js';
import { drawBackground, drawWalls } from './render.js';
import { drawHUD, drawTitle, drawReady, drawDead, drawPaused, drawDanger, Lens } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const sp = buildSprites();
const fx = { fg: new Decals(), bg: new Decals(), sfx, particles: null };
fx.particles = new Particles(fx);
const world = new World();
const lens = new Lens();
let grinder = new Grinder();

const touchRoot = document.getElementById('touch');
let touchMode = false;
function enableTouch() {
  if (touchMode) return;
  touchMode = true;
  touchRoot.hidden = false;
}

const muteBtn = document.getElementById('mute');
muteBtn.setAttribute('aria-pressed', String(isMuted()));
muteBtn.addEventListener('click', (e) => {
  initAudio();
  muteBtn.setAttribute('aria-pressed', String(toggleMute()));
  e.currentTarget.blur();
});

const input = new Input({
  canvas,
  touchRoot,
  onAny() { initAudio(); if (!document.hidden && state !== 'paused') startMusic(); },
  onTouch: enableTouch,
});

// --- Persistent stats --------------------------------------------------------------
const stats = {
  best: store.get('best', 0),
  deaths: store.get('deaths', 0),
  graves: store.get('graves', []), // depths (px) where you died before
};

// --- State ---------------------------------------------------------------------------
let state = 'title';
function setState(s) {
  state = s;
  document.body.dataset.state = s;
}
let t = 0, camY = 0, depth = 0, readyT = 0, deadT = 0;
let player = null, corpse = null, deathInfo = null;
let emitters = [];
let shakeT = 0, shakeA = 0, flashA = 0, hitstop = 0, alarmT = 0;
let danger = 0;

world.onRow = decorateRow;

function decorateRow(row) {
  if (row.idx < 2) return;
  const grave = stats.graves.some((y) => Math.abs(y - row.y) < 40);
  if (!grave && !chance(0.14)) return;
  const segs = row.segs.filter((s) => s.x1 - s.x0 >= 12);
  if (!segs.length) return;
  const s = pick(segs);
  const x = randi(s.x0 + 3, s.x1 - 6);
  fx.bg.splat(x, row.y - randi(6, 14), randi(grave ? 10 : 6, grave ? 16 : 11), BLOOD_BG);
  for (let i = -8; i <= 8; i++) {
    if (x + i >= s.x0 && x + i < s.x1 && chance(0.8 - Math.abs(i) / 12)) fx.fg.pset(x + i, row.y, pick([PAL.blood, PAL.bloodD]));
  }
  for (let k = 0; k < randi(1, 4); k++) {
    const dx = randi(-5, 5);
    if (x + dx >= s.x0 && x + dx < s.x1) {
      for (let j = 0, n = randi(1, 4); j < n; j++) fx.fg.pset(x + dx, row.y + 6 + j, PAL.bloodD);
    }
  }
  if (grave || chance(0.5)) fx.particles.gib(x - 2, row.y - 5, 0, 0, sp.skull, 0);
  if (chance(0.6)) fx.particles.gib(x + randi(2, 5), row.y - 3, 0, 0, pick([sp.bone, sp.rib]), 0);
}

function shake(a, d = 0.35) { shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, d); }

function resetWorld() {
  fx.fg.clear(); fx.bg.clear(); fx.particles.clear(); lens.clear();
  world.reset();
  grinder = new Grinder();
  emitters = [];
  corpse = null;
  camY = 0;
  world.generate(camY + H + 80);
}

function startRun() {
  resetWorld();
  player = new Player(W / 2 - 3, START_Y - 8);
  depth = 0;
  readyT = 1.1;
  setState('play');
  sfx.start();
}

function toTitle() {
  resetWorld();
  setState('title');
}

// --- Death ---------------------------------------------------------------------------
function kill(cause, src) {
  if (state !== 'play') return;
  setState('dead');
  deadT = 0;
  hitstop = 0.09;
  flashA = 0.7;
  shake(cause === 'SQUISHED' ? 6 : 4, 0.5);

  const p = fx.particles;
  const cx = player.x + 3, cy = player.y + 4;
  stats.deaths++;
  stats.graves = [...stats.graves, player.y].slice(-30);
  const newBest = depth > stats.best;
  if (newBest) stats.best = depth;
  store.set('deaths', stats.deaths);
  store.set('best', stats.best);
  store.set('graves', stats.graves);
  deathInfo = { cause, depth, best: stats.best, newBest, deaths: stats.deaths };

  const gibs = (n, vyMin, vyMax) => {
    for (let i = 0; i < n; i++) p.gib(cx - 1, cy - 1, rand(-110, 110), rand(vyMin, vyMax), pick(sp.gibs), rand(0.4, 1.4), 30);
  };

  if (cause === 'SLICED') {
    const dir = Math.sign(cx - (src.cx ?? cx)) || (chance(0.5) ? 1 : -1);
    p.gib(player.x - 1, player.y - 1, dir * rand(50, 90), -rand(150, 200), sp.halfTop, 2.5, 60);
    p.gib(player.x - 1, player.y + 4, -dir * rand(10, 40), -rand(40, 90), sp.halfBot, 2, 50);
    p.burst(cx, cy, 200, { speed: [40, 230] });
    p.burst(cx, cy, 80, { speed: [120, 280], spread: 0.9 });
    p.mist(cx, cy, 30, { speed: 90 });
    gibs(6, -220, -60);
    p.gib(cx, cy - 2, rand(-60, 60), -rand(150, 220), sp.eyeball, 0.5);
    fx.bg.splat(Math.round(cx), Math.round(cy), 16, BLOOD_BG);
    src.bloody = true;
    sfx.slice();
  } else if (cause === 'IMPALED') {
    corpse = { sprite: sp.corpse, x: player.x - 1, y: player.y - 1, flat: false };
    p.burst(cx, cy, 120, { speed: [40, 180] });
    p.mist(cx, cy, 20);
    gibs(3, -160, -60);
    emitters.push({ x: cx, y: cy - 2, life: 1.6, rate: 140, angle: -Math.PI / 2, spread: 1.3, speed: [80, 220] });
    fx.bg.splat(Math.round(cx), Math.round(cy - 4), 13, BLOOD_BG);
    src.stain?.(src.x0 !== undefined ? player.x - 2 : player.y - 2, src.x0 !== undefined ? player.x + 8 : player.y + 10);
    sfx.splat();
  } else if (cause === 'SQUISHED') {
    const gy = camY + GRIND_Y;
    corpse = { sprite: sp.corpse, x: cx - 7, y: gy - 1, flat: true };
    p.burst(cx, gy + 1, 280, { angle: Math.PI / 2, spread: Math.PI * 0.95, speed: [60, 280] });
    p.burst(cx, gy + 1, 60, { angle: Math.PI / 2, spread: 0.5, speed: [200, 320] });
    p.mist(cx, gy + 3, 40, { speed: 110 });
    for (let i = 0; i < 9; i++) p.gib(cx - 1, gy + 2, rand(-120, 120), rand(20, 160), pick(sp.gibs), rand(0.5, 1.5), 30);
    p.gib(cx, gy + 2, rand(-50, 50), rand(40, 120), sp.eyeball, 0.6);
    emitters.push({ x: cx, y: gy + 1, life: 2.2, rate: 120, angle: Math.PI / 2, spread: 1.2, speed: [20, 140], screen: true });
    fx.bg.splat(Math.round(cx), Math.round(gy + 6), 22, BLOOD_BG);
    grinder.bloody = true;
    sfx.squish();
  } else {
    // FRIED
    p.gib(player.x - 1, player.y - 1, player.vx * 0.3, -60, sp.charred, 1.2, 40);
    p.burst(cx, cy, 110, { speed: [40, 200] });
    p.smoke(cx, cy, 30);
    gibs(3, -180, -60);
    fx.bg.splat(Math.round(cx), Math.round(cy), 12, BLOOD_BG);
    sfx.fry();
  }
  lens.add(cx, cy - camY, cause === 'SQUISHED' ? randi(6, 9) : randi(3, 6));
  stopMusic();
}

function updateEmitters(dt) {
  for (const e of emitters) {
    e.life -= dt;
    const n = e.rate * dt * Math.min(1, e.life);
    const count = Math.floor(n) + (chance(n % 1) ? 1 : 0);
    fx.particles.burst(e.x, e.y, count, { angle: e.angle, spread: e.spread, speed: e.speed, jitter: 1 });
  }
  emitters = emitters.filter((e) => e.life > 0);
}

// --- Simulation ----------------------------------------------------------------------
const speedFor = (m) => 26 + Math.min(70, m * 0.11);

function step(dt) {
  t += dt;
  if (input.mutePressed) muteBtn.setAttribute('aria-pressed', String(toggleMute()));

  if (state === 'title') {
    camY += 20 * dt;
    world.generate(camY + H + 80);
    world.update(dt, fx, camY);
    grinder.update(dt, fx, camY, false);
    fx.particles.update(dt, camY, world);
    world.prune(camY); fx.fg.prune(camY); fx.bg.prune(camY);
    if (input.anyPressed) startRun();
    return;
  }

  if (state === 'paused') {
    if (input.anyPressed || input.pausePressed) { setState('play'); startMusic(); }
    return;
  }

  if (state === 'play') {
    if (input.pausePressed) { setState('paused'); stopMusic(); return; }
    readyT -= dt;
    const speed = speedFor(depth);
    if (readyT <= 0) camY += speed * dt;
    setTempo(124 + speed * 0.5);

    player.update(dt, input, world, fx);
    const follow = player.y - H * 0.6;
    if (follow > camY) camY = follow;

    const m = Math.max(depth, Math.floor((player.y - START_Y + 8) / PX_PER_M));
    if (Math.floor(m / 50) > Math.floor(depth / 50)) sfx.tick();
    depth = m;

    const dist = player.y - (camY + GRIND_Y);
    danger = Math.max(0, Math.min(1, 1 - dist / 55));
    alarmT -= dt;
    if (danger > 0.35 && alarmT <= 0) { sfx.warn(); alarmT = 0.5 - danger * 0.3; }

    if (player.y < camY + GRIND_Y - 1) kill('SQUISHED', grinder);
    else {
      const hit = world.hitTest(player);
      if (hit) kill(hit.cause, hit.trap);
    }
  } else if (state === 'dead') {
    deadT += dt;
    danger = 0;
    if (deadT > 0.5 && input.anyPressed) { startRun(); return; }
  }

  world.generate(camY + H + 80);
  world.update(dt, fx, camY);
  grinder.update(dt, fx, camY, true);
  updateEmitters(dt);
  fx.particles.update(dt, camY, world);
  world.prune(camY); fx.fg.prune(camY); fx.bg.prune(camY);
}

// --- Drawing ---------------------------------------------------------------------------
function render(dt) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shakeT > 0) ctx.translate(Math.round(rand(-shakeA, shakeA)), Math.round(rand(-shakeA, shakeA)));
  const cy = Math.round(camY);

  drawBackground(ctx, sp, cy);
  fx.bg.draw(ctx, cy);
  drawWalls(ctx, sp, cy);
  world.drawTraps(ctx, cy, sp, 0);
  world.drawRows(ctx, cy);
  world.drawTraps(ctx, cy, sp, 1);
  fx.fg.draw(ctx, cy);
  world.drawTraps(ctx, cy, sp, 2);
  if (corpse) {
    const x = Math.round(corpse.x), y = Math.round(corpse.y - cy);
    if (corpse.flat) ctx.drawImage(corpse.sprite, x, y, 14, 3);
    else ctx.drawImage(corpse.sprite, x, y);
  }
  fx.particles.draw(ctx, cy);
  if (state === 'play' || state === 'paused') player.draw(ctx, cy, sp);
  grinder.draw(ctx, sp, state === 'play' ? danger : 0);
  ctx.restore();

  if (state === 'play') drawDanger(ctx, danger, t);
  lens.draw(ctx);
  if (flashA > 0) {
    ctx.fillStyle = `rgb(255 48 72 / ${flashA})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state !== 'title') drawHUD(ctx, sp, { depth, best: stats.best, deaths: stats.deaths });
  if (state === 'title') drawTitle(ctx, t, stats.best, touchMode);
  else if (state === 'play' && readyT > 0) drawReady(ctx, readyT);
  else if (state === 'dead') drawDead(ctx, deadT, deathInfo, touchMode);
  else if (state === 'paused') drawPaused(ctx, t, touchMode);

  shakeT = Math.max(0, shakeT - dt);
  if (shakeT === 0) shakeA = 0;
  flashA = Math.max(0, flashA - dt * 3);
  lens.update(dt);
}

// --- Loop -------------------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  const realDt = dt;
  if (hitstop > 0) { hitstop -= dt; dt = 0; }
  acc += dt;
  let stepped = false;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
    if (!stepped) { stepped = true; input.consume(); }
  }
  render(realDt);
  requestAnimationFrame(frame);
}

// --- Layout -------------------------------------------------------------------------------
// Whole device pixels per game pixel, so the pixel art stays crisp at any size.
function resize() {
  const dpr = devicePixelRatio || 1;
  const s = Math.min(innerWidth / W, (innerHeight - 24) / H);
  const scale = Math.max(1, Math.floor(s * dpr)) / dpr;
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
}
addEventListener('resize', resize);
if (matchMedia('(pointer: coarse)').matches) enableTouch();
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopMusic();
    if (state === 'play') setState('paused');
  }
});

toTitle();
requestAnimationFrame(frame);

// Exposed for debugging in the console.
window.grindDown = {
  get state() { return state; },
  get camY() { return camY; },
  set camY(v) { camY = v; },
  kill: (c = 'SLICED') => kill(c, { cx: 0 }),
  stats,
};
