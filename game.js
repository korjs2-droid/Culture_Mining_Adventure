const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const hiScoreEl = document.getElementById('hiscore');
const score2El = document.getElementById('score2');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const creditEl = document.getElementById('credit');

const W = canvas.width;
const H = canvas.height;

let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
}

function playTone({ type = 'square', frequency = 440, duration = 0.08, volume = 0.08, sweepTo = null }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (sweepTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function playShootSound() {
  playTone({ type: 'square', frequency: 820, sweepTo: 340, duration: 0.07, volume: 0.06 });
}

function playExplosionSound() {
  playTone({ type: 'sawtooth', frequency: 240, sweepTo: 90, duration: 0.12, volume: 0.07 });
}

const colors = {
  bg: '#140000',
  ink: '#fff7c2',
  enemy: '#fff3bf',
  player: '#fff7cf',
  bunker: '#fff3be',
  bullet: '#fff7e1',
  enemyBullet: '#ffd58f',
  line: '#8f6a6a',
};

const enemyLayouts = [
  {
    shapeA: [
      '00111100',
      '11111111',
      '11011011',
      '11111111',
      '00100100',
      '01000010',
    ],
    shapeB: [
      '00111100',
      '11111111',
      '11011011',
      '11111111',
      '01011010',
      '10000001',
    ],
    score: 30,
  },
  {
    shapeA: [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '11111111',
      '00100100',
    ],
    shapeB: [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '11111111',
      '01000010',
    ],
    score: 20,
  },
  {
    shapeA: [
      '00011000',
      '00111100',
      '01111110',
      '11111111',
      '01111110',
      '00100100',
    ],
    shapeB: [
      '00011000',
      '00111100',
      '01111110',
      '11111111',
      '00111100',
      '01000010',
    ],
    score: 10,
  },
];

const state = {
  running: true,
  paused: false,
  gameOver: false,
  score: 0,
  hiScore: 0,
  lives: 3,
  level: 1,
  credit: 3,
  player: null,
  playerBullet: null,
  enemies: [],
  enemyBullets: [],
  bunkers: [],
  enemyDir: 1,
  enemySpeed: 28,
  enemyStepDown: 18,
  enemyMoveTimer: 0,
  enemyMoveDelay: 0.6,
  enemyAnimFrame: 0,
  shootTimer: 0,
  moveLeft: false,
  moveRight: false,
};

function formatScore(v) {
  return String(v).padStart(4, '0');
}

function updateHud() {
  scoreEl.textContent = formatScore(state.score);
  hiScoreEl.textContent = formatScore(state.hiScore);
  score2El.textContent = '0000';
  livesEl.textContent = '▲'.repeat(Math.max(state.lives, 0));
  levelEl.textContent = String(state.level);
  creditEl.textContent = String(state.credit).padStart(2, '0');
}

function drawPixelSprite(x, y, sprite, scale, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < sprite.length; r += 1) {
    for (let c = 0; c < sprite[r].length; c += 1) {
      if (sprite[r][c] === '1') {
        ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
  }
}

function createPlayer() {
  return {
    x: W / 2 - 16,
    y: H - 64,
    w: 32,
    h: 16,
    speed: 190,
    sprite: [
      '00011000011000',
      '00111100111100',
      '01111111111110',
      '11111111111111',
      '11111011011111',
      '11111111111111',
      '01111000011110',
      '00110000001100',
    ],
  };
}

function createBunkers() {
  const bunkers = [];
  const count = 4;
  const spacing = W / (count + 1);
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(spacing * (i + 1) - 28);
    const y = H - 130;
    const pixels = [
      '00111111111100',
      '01111111111110',
      '11111111111111',
      '11111111111111',
      '11110000111111',
      '11100000011111',
      '11000000001111',
      '11000000001111',
    ].map((row) => row.split('').map((ch) => (ch === '1' ? 2 : 0)));
    bunkers.push({ x, y, pixels, scale: 4 });
  }
  return bunkers;
}

function createEnemies() {
  const enemies = [];
  const rows = 5;
  const cols = 11;
  const startX = 40;
  const startY = 58;
  const gapX = 32;
  const gapY = 24;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let type;
      if (r === 0) type = 0;
      else if (r < 3) type = 1;
      else type = 2;
      enemies.push({
        x: startX + c * gapX,
        y: startY + r * gapY,
        w: 24,
        h: 18,
        type,
        alive: true,
      });
    }
  }
  return enemies;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function damageBunkerAt(bullet, power) {
  for (const bunker of state.bunkers) {
    const bw = bunker.pixels[0].length * bunker.scale;
    const bh = bunker.pixels.length * bunker.scale;
    const area = { x: bunker.x, y: bunker.y, w: bw, h: bh };
    if (!rectsOverlap(bullet, area)) continue;

    const localX = Math.floor((bullet.x - bunker.x) / bunker.scale);
    const localY = Math.floor((bullet.y - bunker.y) / bunker.scale);

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = localX + dx;
        const py = localY + dy;
        if (py >= 0 && py < bunker.pixels.length && px >= 0 && px < bunker.pixels[0].length) {
          bunker.pixels[py][px] = Math.max(0, bunker.pixels[py][px] - power);
        }
      }
    }
    return true;
  }
  return false;
}

function resetWave() {
  state.enemies = createEnemies();
  state.enemyBullets = [];
  state.playerBullet = null;
  state.enemyDir = 1;
  state.enemyMoveDelay = Math.max(0.11, 0.6 - (state.level - 1) * 0.07);
  state.enemySpeed = 28 + (state.level - 1) * 4;
  state.enemyMoveTimer = 0;
  state.enemyAnimFrame = 0;
}

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.gameOver = false;
  state.paused = false;
  state.player = createPlayer();
  state.bunkers = createBunkers();
  resetWave();
  updateHud();
}

function firePlayerBullet() {
  if (state.playerBullet || state.gameOver || state.paused) return;
  state.playerBullet = {
    x: state.player.x + state.player.w / 2 - 2,
    y: state.player.y - 10,
    w: 4,
    h: 10,
    vy: -360,
  };
  playShootSound();
}

function fireEnemyBullet() {
  const aliveEnemies = state.enemies.filter((e) => e.alive);
  if (!aliveEnemies.length) return;

  const columns = new Map();
  for (const enemy of aliveEnemies) {
    const col = Math.round(enemy.x / 8);
    if (!columns.has(col) || columns.get(col).y < enemy.y) {
      columns.set(col, enemy);
    }
  }

  const shooters = Array.from(columns.values());
  const shooter = shooters[Math.floor(Math.random() * shooters.length)];
  state.enemyBullets.push({
    x: shooter.x + shooter.w / 2 - 2,
    y: shooter.y + shooter.h,
    w: 4,
    h: 10,
    vy: 210 + state.level * 12,
  });
}

function updateEnemies(dt) {
  state.enemyMoveTimer += dt;
  if (state.enemyMoveTimer < state.enemyMoveDelay) return;
  state.enemyMoveTimer = 0;
  state.enemyAnimFrame = (state.enemyAnimFrame + 1) % 2;

  const alive = state.enemies.filter((e) => e.alive);
  if (!alive.length) return;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const enemy of alive) {
    minX = Math.min(minX, enemy.x);
    maxX = Math.max(maxX, enemy.x + enemy.w);
  }

  const moveAmount = state.enemySpeed * state.enemyMoveDelay;
  let touchEdge = false;
  if ((state.enemyDir > 0 && maxX + moveAmount > W - 18) || (state.enemyDir < 0 && minX - moveAmount < 18)) {
    touchEdge = true;
  }

  if (touchEdge) {
    state.enemyDir *= -1;
    for (const enemy of alive) {
      enemy.y += state.enemyStepDown;
      if (enemy.y + enemy.h >= state.player.y) {
        state.gameOver = true;
      }
    }
  } else {
    for (const enemy of alive) {
      enemy.x += moveAmount * state.enemyDir;
    }
  }

  const speedBoost = Math.max(0.2, alive.length / 55);
  state.enemyMoveDelay = Math.max(0.08, (0.55 - (state.level - 1) * 0.05) * speedBoost + 0.05);
}

function updateBullets(dt) {
  if (state.playerBullet) {
    state.playerBullet.y += state.playerBullet.vy * dt;
    if (state.playerBullet.y < -20) {
      state.playerBullet = null;
    }
  }

  for (const bullet of state.enemyBullets) {
    bullet.y += bullet.vy * dt;
  }
  state.enemyBullets = state.enemyBullets.filter((b) => b.y < H + 20);
}

function handleCollisions() {
  if (state.playerBullet) {
    for (const enemy of state.enemies) {
      if (enemy.alive && rectsOverlap(state.playerBullet, enemy)) {
        enemy.alive = false;
        state.playerBullet = null;
        playExplosionSound();
        state.score += enemyLayouts[enemy.type].score;
        state.hiScore = Math.max(state.hiScore, state.score);
        updateHud();
        break;
      }
    }
  }

  if (state.playerBullet && damageBunkerAt(state.playerBullet, 2)) {
    state.playerBullet = null;
    playExplosionSound();
  }

  for (const bullet of state.enemyBullets) {
    if (damageBunkerAt(bullet, 1)) {
      bullet.y = H + 99;
      continue;
    }

    if (!state.gameOver && rectsOverlap(bullet, state.player)) {
      bullet.y = H + 99;
      playExplosionSound();
      state.lives -= 1;
      updateHud();
      if (state.lives <= 0) {
        state.gameOver = true;
      } else {
        state.player.x = W / 2 - state.player.w / 2;
      }
    }
  }

  state.enemyBullets = state.enemyBullets.filter((b) => b.y < H + 20);

  const aliveLeft = state.enemies.some((e) => e.alive);
  if (!aliveLeft) {
    state.level += 1;
    state.credit = Math.max(0, state.credit - 1);
    state.bunkers = createBunkers();
    resetWave();
    updateHud();
  }
}

function update(dt) {
  if (state.paused || state.gameOver) return;

  if (state.moveLeft) state.player.x -= state.player.speed * dt;
  if (state.moveRight) state.player.x += state.player.speed * dt;
  state.player.x = Math.max(10, Math.min(W - state.player.w - 10, state.player.x));

  state.shootTimer += dt;
  if (state.shootTimer >= Math.max(0.2, 0.9 - state.level * 0.07)) {
    fireEnemyBullet();
    state.shootTimer = 0;
  }

  updateEnemies(dt);
  updateBullets(dt);
  handleCollisions();
}

function drawBunkers() {
  for (const bunker of state.bunkers) {
    for (let r = 0; r < bunker.pixels.length; r += 1) {
      for (let c = 0; c < bunker.pixels[r].length; c += 1) {
        const hp = bunker.pixels[r][c];
        if (hp <= 0) continue;
        const shade = hp === 2 ? colors.bunker : '#e4d09b';
        ctx.fillStyle = shade;
        ctx.fillRect(
          bunker.x + c * bunker.scale,
          bunker.y + r * bunker.scale,
          bunker.scale,
          bunker.scale
        );
      }
    }
  }
}

function drawPlayer() {
  drawPixelSprite(state.player.x, state.player.y, state.player.sprite, 2, colors.player);
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const layout = enemyLayouts[enemy.type];
    const sprite = state.enemyAnimFrame === 0 ? layout.shapeA : layout.shapeB;
    drawPixelSprite(enemy.x, enemy.y, sprite, 3, colors.enemy);
  }
}

function drawBullets() {
  if (state.playerBullet) {
    ctx.fillStyle = colors.bullet;
    ctx.fillRect(state.playerBullet.x, state.playerBullet.y, state.playerBullet.w, state.playerBullet.h);
  }

  ctx.fillStyle = colors.enemyBullet;
  for (const bullet of state.enemyBullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  }
}

function drawOverlayText() {
  if (!state.paused && !state.gameOver) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px Courier New';
  const title = state.gameOver ? 'GAME OVER' : 'PAUSED';
  ctx.fillText(title, W / 2, H / 2 - 10);
  ctx.font = '16px Courier New';
  const subtitle = state.gameOver ? 'R 키로 재시작' : 'P 키로 계속';
  ctx.fillText(subtitle, W / 2, H / 2 + 24);
}

function render() {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  drawEnemies();
  drawBunkers();
  drawPlayer();
  drawBullets();

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, H - 38);
  ctx.lineTo(W - 10, H - 38);
  ctx.stroke();

  drawOverlayText();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (state.running) {
    update(dt);
    render();
  }
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (e.code === 'ArrowLeft') state.moveLeft = true;
  if (e.code === 'ArrowRight') state.moveRight = true;
  if (e.code === 'Space') {
    e.preventDefault();
    firePlayerBullet();
  }
  if (e.code === 'KeyP' && !state.gameOver) {
    state.paused = !state.paused;
  }
  if (e.code === 'KeyR') {
    resetGame();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') state.moveLeft = false;
  if (e.code === 'ArrowRight') state.moveRight = false;
});

resetGame();
requestAnimationFrame(loop);
