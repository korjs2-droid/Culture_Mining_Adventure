const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const stageEl = document.getElementById('stage');
const coinEl = document.getElementById('coin');
const timeEl = document.getElementById('time');
const lifeEl = document.getElementById('life');
const touchLeftBtn = document.getElementById('touch-left');
const touchRightBtn = document.getElementById('touch-right');
const touchJumpBtn = document.getElementById('touch-jump');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const WORLD_WIDTH = 3600;
const FLOOR_Y = 470;
const GRAVITY = 1900;

const keys = {
  left: false,
  right: false,
  jump: false,
};
const DOUBLE_TAP_WINDOW_MS = 260;
const BOOST_DURATION = 0.35;
const BOOST_COOLDOWN = 0.45;
const JUMP_BOOST_WINDOW_MS = 260;
const JUMP_BOOST_COOLDOWN = 0.35;

const playerImage = new Image();
playerImage.src = 'character.png';
let playerImageReady = false;
playerImage.addEventListener('load', () => {
  playerImageReady = true;
});
const playerVisualOffsetY = 18;
const playerVisualExtraHeight = 22;

let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
}

function beep(freq, duration, type, volume) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
}

function sfxJump() {
  beep(420, 0.11, 'triangle', 0.07);
}

function sfxCoin() {
  beep(980, 0.07, 'square', 0.08);
  beep(1320, 0.08, 'square', 0.05);
}

function sfxHit() {
  beep(200, 0.18, 'sawtooth', 0.07);
}

function sfxWin() {
  beep(760, 0.12, 'triangle', 0.07);
  setTimeout(() => beep(1020, 0.12, 'triangle', 0.07), 120);
  setTimeout(() => beep(1320, 0.16, 'triangle', 0.08), 240);
}

function sfxBoost() {
  beep(650, 0.06, 'square', 0.07);
  setTimeout(() => beep(880, 0.08, 'square', 0.06), 60);
}

const state = {
  cameraX: 0,
  timeLeft: 120,
  timerTick: 0,
  coins: 0,
  lives: 3,
  introSeen: false,
  intro: true,
  introTime: 0,
  gameOver: false,
  win: false,
  lastTapLeft: -Infinity,
  lastTapRight: -Infinity,
  lastTapJump: -Infinity,
  boostTimer: 0,
  boostCooldown: 0,
  boostDir: 0,
  jumpBoostCooldown: 0,
  player: {
    x: 90,
    y: FLOOR_Y - 108,
    w: 78,
    h: 108,
    vx: 0,
    vy: 0,
    onGround: false,
    onWallSlide: false,
    wallSlideDir: 0,
    facing: 1,
  },
  clouds: [
    { x: 100, y: 80, s: 0.9 },
    { x: 540, y: 120, s: 1.2 },
    { x: 970, y: 70, s: 0.8 },
    { x: 1500, y: 110, s: 1.1 },
    { x: 2200, y: 85, s: 1.0 },
    { x: 3000, y: 130, s: 0.9 },
  ],
};

const platforms = [
  { x: 0, y: FLOOR_Y, w: 580, h: 90 },
  { x: 660, y: FLOOR_Y - 40, w: 250, h: 130 },
  { x: 1020, y: FLOOR_Y - 90, w: 200, h: 180 },
  { x: 1280, y: FLOOR_Y - 30, w: 330, h: 120 },
  { x: 1720, y: FLOOR_Y - 80, w: 240, h: 170 },
  { x: 2060, y: FLOOR_Y - 25, w: 260, h: 115 },
  { x: 2410, y: FLOOR_Y - 100, w: 280, h: 190 },
  { x: 2790, y: FLOOR_Y - 60, w: 260, h: 150 },
  { x: 3120, y: FLOOR_Y, w: 540, h: 90 },
  { x: 830, y: 300, w: 140, h: 24 },
  { x: 1470, y: 260, w: 130, h: 24 },
  { x: 2240, y: 280, w: 140, h: 24 },
  { x: 2870, y: 250, w: 130, h: 24 },
];

const coins = [
  { x: 740, y: 370, r: 12, got: false },
  { x: 850, y: 255, r: 12, got: false },
  { x: 1080, y: 315, r: 12, got: false },
  { x: 1160, y: 315, r: 12, got: false },
  { x: 1330, y: 340, r: 12, got: false },
  { x: 1510, y: 220, r: 12, got: false },
  { x: 1790, y: 335, r: 12, got: false },
  { x: 2140, y: 355, r: 12, got: false },
  { x: 2290, y: 240, r: 12, got: false },
  { x: 2500, y: 310, r: 12, got: false },
  { x: 2670, y: 310, r: 12, got: false },
  { x: 2890, y: 210, r: 12, got: false },
  { x: 2990, y: 210, r: 12, got: false },
  { x: 3210, y: 400, r: 12, got: false },
];

const enemies = [
  { x: 900, y: FLOOR_Y - 38, w: 42, h: 38, vx: 70, minX: 820, maxX: 980, dead: false },
  { x: 1860, y: FLOOR_Y - 118, w: 42, h: 38, vx: 65, minX: 1740, maxX: 1940, dead: false },
  { x: 2570, y: FLOOR_Y - 138, w: 42, h: 38, vx: 75, minX: 2430, maxX: 2670, dead: false },
  { x: 3270, y: FLOOR_Y - 38, w: 42, h: 38, vx: 90, minX: 3180, maxX: 3420, dead: false },
];

const goal = {
  x: WORLD_WIDTH - 160,
  y: FLOOR_Y - 190,
  w: 18,
  h: 190,
};

function resetPlayerPosition() {
  state.player.x = 90;
  state.player.y = FLOOR_Y - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onWallSlide = false;
  state.player.wallSlideDir = 0;
  state.boostTimer = 0;
  state.boostDir = 0;
  state.jumpBoostCooldown = 0;
}

function resetGame() {
  state.cameraX = 0;
  state.timeLeft = 120;
  state.timerTick = 0;
  state.coins = 0;
  state.lives = 3;
  state.intro = !state.introSeen;
  state.introTime = 0;
  state.gameOver = false;
  state.win = false;
  state.lastTapLeft = -Infinity;
  state.lastTapRight = -Infinity;
  state.lastTapJump = -Infinity;
  state.boostCooldown = 0;

  for (const coin of coins) coin.got = false;
  for (const enemy of enemies) enemy.dead = false;

  resetPlayerPosition();
  updateHud();
}

function updateHud() {
  stageEl.textContent = '1-1';
  coinEl.textContent = String(state.coins).padStart(2, '0');
  timeEl.textContent = String(Math.max(0, Math.ceil(state.timeLeft))).padStart(3, '0');
  lifeEl.textContent = String(state.lives);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function overlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function respawnOrLose() {
  state.lives -= 1;
  sfxHit();
  if (state.lives <= 0) {
    state.gameOver = true;
  } else {
    resetPlayerPosition();
  }
  updateHud();
}

function updatePlayer(dt) {
  const p = state.player;

  const boosting = state.boostTimer > 0;
  const accel = boosting ? 2600 : 1500;
  const maxSpeed = boosting ? 520 : 300;
  const friction = 1900;

  if (boosting) {
    p.vx += state.boostDir * 1000 * dt;
    state.boostTimer = Math.max(0, state.boostTimer - dt);
  } else {
    state.boostDir = 0;
  }
  state.boostCooldown = Math.max(0, state.boostCooldown - dt);

  if (keys.left) {
    p.vx -= accel * dt;
    p.facing = -1;
  }
  if (keys.right) {
    p.vx += accel * dt;
    p.facing = 1;
  }

  if (!keys.left && !keys.right) {
    if (p.vx > 0) p.vx = Math.max(0, p.vx - friction * dt);
    if (p.vx < 0) p.vx = Math.min(0, p.vx + friction * dt);
  }

  p.vx = clamp(p.vx, -maxSpeed, maxSpeed);

  p.vy += GRAVITY * dt;
  if (p.vy > 1200) p.vy = 1200;

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  p.onGround = false;
  p.onWallSlide = false;
  p.wallSlideDir = 0;
  let wallOnLeft = false;
  let wallOnRight = false;
  for (const plat of platforms) {
    if (!overlap(p, plat)) continue;

    const prevY = p.y - p.vy * dt;
    const prevBottom = prevY + p.h;

    if (p.vy >= 0 && prevBottom <= plat.y + 6) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.onGround = true;
      continue;
    }

    const prevX = p.x - p.vx * dt;
    if (prevX + p.w <= plat.x + 4) {
      p.x = plat.x - p.w;
      p.vx = 0;
      wallOnRight = true;
    } else if (prevX >= plat.x + plat.w - 4) {
      p.x = plat.x + plat.w;
      p.vx = 0;
      wallOnLeft = true;
    } else if (p.vy < 0) {
      p.y = plat.y + plat.h;
      p.vy = 30;
    }
  }

  if (!p.onGround && p.vy > 0) {
    if (wallOnLeft && keys.left) {
      p.onWallSlide = true;
      p.wallSlideDir = -1;
    } else if (wallOnRight && keys.right) {
      p.onWallSlide = true;
      p.wallSlideDir = 1;
    }
  }
  if (p.onWallSlide) {
    p.vy = Math.min(p.vy, 210);
  }

  if (p.x < 0) p.x = 0;
  if (p.x + p.w > WORLD_WIDTH) p.x = WORLD_WIDTH - p.w;

  if (p.y > HEIGHT + 200) {
    respawnOrLose();
  }
}

function handleJump() {
  handleJumpWithBoost(false);
}

function handleJumpWithBoost(boosted) {
  if (state.gameOver || state.win) return;
  const p = state.player;
  const wallJump = !p.onGround && p.onWallSlide && p.wallSlideDir !== 0;
  if (!p.onGround && !wallJump) return;

  if (wallJump) {
    const jumpDir = p.wallSlideDir === 1 ? -1 : 1;
    p.vy = boosted ? -980 : -840;
    p.vx = (boosted ? 470 : 400) * jumpDir;
    p.facing = jumpDir;
    p.onWallSlide = false;
    p.wallSlideDir = 0;
  } else {
    p.vy = boosted ? -930 : -760;
    p.onGround = false;
  }

  sfxJump();
  if (boosted) {
    sfxBoost();
  }
}

function updateEnemies(dt) {
  const p = state.player;
  for (const e of enemies) {
    if (e.dead) continue;
    e.x += e.vx * dt;
    if (e.x < e.minX || e.x + e.w > e.maxX) {
      e.vx *= -1;
      e.x = clamp(e.x, e.minX, e.maxX - e.w);
    }

    if (!overlap(p, e)) continue;

    const pBottom = p.y + p.h;
    if (p.vy > 220 && pBottom - e.y < 24) {
      e.dead = true;
      p.vy = -420;
      sfxCoin();
    } else {
      respawnOrLose();
    }
  }
}

function updateCoins() {
  const p = state.player;
  for (const coin of coins) {
    if (coin.got) continue;
    const hit =
      p.x < coin.x + coin.r &&
      p.x + p.w > coin.x - coin.r &&
      p.y < coin.y + coin.r &&
      p.y + p.h > coin.y - coin.r;

    if (hit) {
      coin.got = true;
      state.coins += 1;
      sfxCoin();
      updateHud();
    }
  }
}

function updateGoal() {
  if (state.win) return;
  const p = state.player;
  const area = { x: goal.x - 28, y: goal.y, w: 70, h: goal.h };
  if (overlap(p, area)) {
    state.win = true;
    sfxWin();
  }
}

function updateTimer(dt) {
  if (state.gameOver || state.win) return;
  state.timerTick += dt;
  if (state.timerTick >= 1) {
    state.timeLeft -= 1;
    state.timerTick = 0;
    updateHud();
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.gameOver = true;
    }
  }
}

function tryStartBoost(dir) {
  if (state.boostCooldown > 0 || state.gameOver || state.win) return;
  state.boostDir = dir;
  state.boostTimer = BOOST_DURATION;
  state.boostCooldown = BOOST_COOLDOWN;
  state.player.vx = dir * Math.max(Math.abs(state.player.vx), 360);
  state.player.facing = dir;
  sfxBoost();
}

function pressLeft(now = performance.now()) {
  if (!keys.left && now - state.lastTapLeft <= DOUBLE_TAP_WINDOW_MS) {
    tryStartBoost(-1);
  }
  state.lastTapLeft = now;
  keys.left = true;
}

function pressRight(now = performance.now()) {
  if (!keys.right && now - state.lastTapRight <= DOUBLE_TAP_WINDOW_MS) {
    tryStartBoost(1);
  }
  state.lastTapRight = now;
  keys.right = true;
}

function pressJump(now = performance.now()) {
  if (!keys.jump) {
    const canJumpBoost =
      now - state.lastTapJump <= JUMP_BOOST_WINDOW_MS && state.jumpBoostCooldown <= 0;
    handleJumpWithBoost(canJumpBoost);
    if (canJumpBoost) {
      state.jumpBoostCooldown = JUMP_BOOST_COOLDOWN;
    }
  }
  state.lastTapJump = now;
  keys.jump = true;
}

function releaseLeft() {
  keys.left = false;
}

function releaseRight() {
  keys.right = false;
}

function releaseJump() {
  keys.jump = false;
}

function updateCamera() {
  const target = state.player.x - WIDTH * 0.35;
  state.cameraX = clamp(target, 0, WORLD_WIDTH - WIDTH);
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#87dcff');
  grad.addColorStop(0.65, '#b8ecff');
  grad.addColorStop(1, '#e7fbff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Intro title watermark in gameplay background.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = 'rgba(18, 74, 120, 0.45)';
  roundedRectPath(WIDTH / 2 - 290, 70, 580, 120, 24);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(14, 55, 96, 0.75)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(18, 74, 120, 0.95)';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Trebuchet MS';
  ctx.strokeText('カルチャーマイニング', WIDTH / 2, 120);
  ctx.fillText('カルチャーマイニング', WIDTH / 2, 120);
  ctx.shadowBlur = 6;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(18, 74, 120, 0.9)';
  ctx.font = 'bold 32px Trebuchet MS';
  ctx.strokeText('ADVENTURE', WIDTH / 2, 164);
  ctx.fillText('ADVENTURE', WIDTH / 2, 164);
  ctx.restore();

  ctx.fillStyle = '#fff3a7';
  ctx.beginPath();
  ctx.arc(820, 90, 42, 0, Math.PI * 2);
  ctx.fill();

  for (const cloud of state.clouds) {
    const x = cloud.x - state.cameraX * 0.35;
    const y = cloud.y;
    const s = cloud.s;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 24 * s, 0, Math.PI * 2);
    ctx.arc(x + 30 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 58 * s, y, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHills() {
  ctx.fillStyle = '#88d58a';
  for (let i = 0; i < 8; i += 1) {
    const baseX = i * 470 - state.cameraX * 0.55;
    ctx.beginPath();
    ctx.moveTo(baseX - 100, HEIGHT);
    ctx.quadraticCurveTo(baseX + 120, 300, baseX + 340, HEIGHT);
    ctx.fill();
  }
}

function drawPlatform(plat) {
  const x = plat.x - state.cameraX;
  const y = plat.y;
  ctx.fillStyle = '#6bcf65';
  ctx.fillRect(x, y, plat.w, plat.h);
  ctx.fillStyle = '#4cab4d';
  ctx.fillRect(x, y, plat.w, 10);

  for (let px = x; px < x + plat.w; px += 34) {
    ctx.fillStyle = '#5bb35a';
    ctx.fillRect(px, y + 16, 18, 9);
  }
}

function drawCoins() {
  for (const coin of coins) {
    if (coin.got) continue;
    const x = coin.x - state.cameraX;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(x, coin.y, coin.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, coin.y, coin.r - 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemy(e) {
  if (e.dead) return;
  const x = e.x - state.cameraX;
  ctx.fillStyle = '#9a66ff';
  roundedRectPath(x, e.y, e.w, e.h, 12);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + 14, e.y + 14, 5, 0, Math.PI * 2);
  ctx.arc(x + 28, e.y + 14, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2e1663';
  ctx.beginPath();
  ctx.arc(x + 14, e.y + 14, 2, 0, Math.PI * 2);
  ctx.arc(x + 28, e.y + 14, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoal() {
  const x = goal.x - state.cameraX;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, goal.y, goal.w, goal.h);

  const wobble = Math.sin(performance.now() * 0.006) * 8;
  ctx.fillStyle = '#4a6bff';
  ctx.beginPath();
  ctx.moveTo(x + goal.w, goal.y + 20);
  ctx.lineTo(x + goal.w + 54 + wobble, goal.y + 42);
  ctx.lineTo(x + goal.w, goal.y + 64);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const p = state.player;
  const x = p.x - state.cameraX;
  const drawY = p.y + playerVisualOffsetY;
  const drawH = p.h + playerVisualExtraHeight;

  if (playerImageReady) {
    ctx.save();
    if (p.facing < 0) {
      ctx.translate(x + p.w, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(playerImage, 0, 0, p.w, drawH);
    } else {
      ctx.drawImage(playerImage, x, drawY, p.w, drawH);
    }
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#ffe56c';
  roundedRectPath(x + 18, p.y + 6, 42, 88, 26);
  ctx.fill();

  ctx.fillStyle = '#2148b8';
  roundedRectPath(x + 8, p.y + 54, 62, 42, 20);
  ctx.fill();
}

function drawOverlay() {
  if (!state.gameOver && !state.win) return;

  ctx.fillStyle = 'rgba(14, 28, 46, 0.45)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px Trebuchet MS';
  ctx.fillText(state.win ? 'ステージクリア!' : 'ゲームオーバー', WIDTH / 2, HEIGHT / 2 - 30);

  ctx.font = 'bold 24px Trebuchet MS';
  const msg = state.win
    ? `コイン ${state.coins}枚を集めました!`
    : 'Rキーでリスタート';
  ctx.fillText(msg, WIDTH / 2, HEIGHT / 2 + 18);
}

function drawIntro() {
  const t = state.introTime;
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#041427');
  bg.addColorStop(1, '#0b2f52');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = Math.sin(t * 4) * 0.12 + 0.88;
  ctx.fillStyle = `rgba(100, 210, 255, ${0.32 * glow})`;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2 + 15, 170, 0, Math.PI * 2);
  ctx.fill();

  const pop = Math.min(1, t / 0.9);
  const bob = Math.sin(t * 3.2) * 10;
  const pw = 180 * pop;
  const ph = 260 * pop;
  const px = WIDTH / 2 - pw / 2;
  const py = HEIGHT / 2 - ph / 2 - 14 + bob;

  if (playerImageReady) {
    ctx.drawImage(playerImage, px, py, pw, ph);
  } else {
    ctx.fillStyle = '#ffe56c';
    roundedRectPath(px + 44, py + 20, 92, 170, 46);
    ctx.fill();
    ctx.fillStyle = '#2148b8';
    roundedRectPath(px + 24, py + 130, 132, 84, 28);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Trebuchet MS';
  ctx.fillText('カルチャーマイニング', WIDTH / 2, 122);
  ctx.font = 'bold 30px Trebuchet MS';
  ctx.fillStyle = '#ffe26a';
  ctx.fillText('ADVENTURE', WIDTH / 2, 162);

  ctx.font = 'bold 24px Trebuchet MS';
  ctx.fillStyle = '#dff3ff';
  ctx.fillText('Space / Enter でスタート', WIDTH / 2, HEIGHT - 68);
}

function render() {
  if (state.intro) {
    drawIntro();
    return;
  }
  drawSky();
  drawHills();
  for (const plat of platforms) drawPlatform(plat);
  drawCoins();
  for (const enemy of enemies) drawEnemy(enemy);
  drawGoal();
  drawPlayer();
  drawOverlay();
}

function update(dt) {
  if (state.intro) {
    state.introTime += dt;
    return;
  }
  if (state.gameOver || state.win) {
    updateCamera();
    return;
  }

  updatePlayer(dt);
  updateEnemies(dt);
  updateCoins();
  updateGoal();
  updateTimer(dt);
  state.jumpBoostCooldown = Math.max(0, state.jumpBoostCooldown - dt);
  updateCamera();
}

window.addEventListener('keydown', (e) => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (state.intro) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      startGameFromIntro();
    }
    return;
  }

  const now = performance.now();

  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    pressLeft(now);
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    pressRight(now);
  }

  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    pressJump(now);
  }

  if (e.code === 'KeyR') resetGame();
});

window.addEventListener('keyup', (e) => {
  if (state.intro) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') releaseLeft();
  if (e.code === 'ArrowRight' || e.code === 'KeyD') releaseRight();
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') releaseJump();
});

canvas.addEventListener('pointerdown', () => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  startGameFromIntro();
});

function beginTouchInput() {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  startGameFromIntro();
}

function bindTouchControl(button, onPress, onRelease) {
  if (!button) return;

  const press = (e) => {
    e.preventDefault();
    beginTouchInput();
    onPress(performance.now());
  };
  const release = (e) => {
    e.preventDefault();
    onRelease();
  };

  button.addEventListener('pointerdown', press, { passive: false });
  button.addEventListener('pointerup', release, { passive: false });
  button.addEventListener('pointercancel', release, { passive: false });
  button.addEventListener('pointerleave', release, { passive: false });
}

bindTouchControl(touchLeftBtn, pressLeft, releaseLeft);
bindTouchControl(touchRightBtn, pressRight, releaseRight);
bindTouchControl(touchJumpBtn, pressJump, releaseJump);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

function startGameFromIntro() {
  if (!state.intro) return;
  state.intro = false;
  state.introSeen = true;
}

resetGame();
requestAnimationFrame(loop);
