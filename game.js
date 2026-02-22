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
const WORLD_WIDTH = 4320;
const FLOOR_Y = 470;
const GRAVITY = 1900;

const keys = {
  left: false,
  right: false,
  jump: false,
  up: false,
  down: false,
};
const DOUBLE_TAP_WINDOW_MS = 260;
const BOOST_DURATION = 0.35;
const BOOST_COOLDOWN = 0.45;
const JUMP_BOOST_WINDOW_MS = 260;
const JUMP_BOOST_COOLDOWN = 0.35;

const spriteSheet = {
  image: new Image(),
  renderImage: null,
  ready: false,
  frameWidth: 256,
  frameHeight: 384,
  frames: [],
  animations: {
    idle: [0],
    walk: [0],
    run: [0],
    jump: [0],
  },
  frontFrameIndex: 0,
  backFrameIndex: -1,
};
let playerImageReady = false;

const playerAnim = {
  name: 'idle',
  frameCursor: 0,
  timer: 0,
};

const introCharacterImage = new Image();
let introCharacterReady = false;
introCharacterImage.onload = () => {
  introCharacterReady = true;
};
introCharacterImage.src = 'character.png';

const lavyImage = new Image();
let lavyImageReady = false;
lavyImage.onload = () => {
  lavyImageReady = true;
};
lavyImage.src = 'lavy.png';

const upPoseImage = new Image();
let upPoseReady = false;
upPoseImage.onload = () => {
  upPoseReady = true;
};
upPoseImage.src = 'ch/character_exact_01.png';

function buildVisibleSpriteSheetImage() {
  const src = spriteSheet.image;
  if (!src.width || !src.height) return;

  const off = document.createElement('canvas');
  off.width = src.width;
  off.height = src.height;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.drawImage(src, 0, 0);

  const imageData = octx.getImageData(0, 0, off.width, off.height);
  const d = imageData.data;
  const w = off.width;
  const h = off.height;

  // Estimate matte/background color from the 4 corners.
  const corner = (x, y) => {
    const idx = (y * w + x) * 4;
    return [d[idx], d[idx + 1], d[idx + 2]];
  };
  const c1 = corner(0, 0);
  const c2 = corner(w - 1, 0);
  const c3 = corner(0, h - 1);
  const c4 = corner(w - 1, h - 1);
  const bgR = Math.round((c1[0] + c2[0] + c3[0] + c4[0]) / 4);
  const bgG = Math.round((c1[1] + c2[1] + c3[1] + c4[1]) / 4);
  const bgB = Math.round((c1[2] + c2[2] + c3[2] + c4[2]) / 4);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a === 0) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const bgDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

    // Remove matte-like fringe, but preserve thin head-tip details.
    if (
      (luma > 242 && sat < 0.1) ||
      (a < 52 && luma > 170 && sat < 0.22) ||
      (a < 95 && bgDist < 30)
    ) {
      d[i + 3] = 0;
      continue;
    }

    d[i] = Math.min(255, Math.round(r * 1.02 + 3));
    d[i + 1] = Math.min(255, Math.round(g * 1.02 + 3));
    d[i + 2] = Math.min(255, Math.round(b * 1.02 + 3));
    d[i + 3] = Math.min(255, Math.round(a * 1.28));
  }

  // Remove only truly isolated speckles.
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      alpha[y * w + x] = d[(y * w + x) * 4 + 3];
    }
  }
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = y * w + x;
      const a = alpha[idx];
      if (a === 0) continue;
      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          if (alpha[(y + oy) * w + (x + ox)] > 40) neighbors += 1;
        }
      }
      if (neighbors === 0 && a < 120) {
        d[idx * 4 + 3] = 0;
      }
    }
  }
  octx.putImageData(imageData, 0, 0);
  spriteSheet.renderImage = off;
}

function cropAlphaBounds(img) {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0);
  const d = octx.getImageData(0, 0, off.width, off.height).data;
  let minX = off.width;
  let minY = off.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < off.height; y += 1) {
    for (let x = 0; x < off.width; x += 1) {
      if (d[(y * off.width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: img.width, h: img.height };
  }
  const pad = 6;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(img.width - Math.max(0, minX - pad), (maxX - minX + 1) + pad * 2),
    h: Math.min(img.height - Math.max(0, minY - pad), (maxY - minY + 1) + pad * 2),
  };
}

function drawCharacterPoseFrame(srcImg, srcRect, pose, frameW, frameH) {
  const frame = document.createElement('canvas');
  frame.width = frameW;
  frame.height = frameH;
  const g = frame.getContext('2d');

  const anchorX = frameW * 0.5;
  const anchorY = frameH * 0.95;
  const drawH = frameH * 0.86;
  const drawW = frameW * 0.66;

  const headRatio = 0.42;
  const torsoRatio = 0.34;
  const legsRatio = 1 - headRatio - torsoRatio;

  const srcHeadH = srcRect.h * headRatio;
  const srcTorsoY = srcHeadH;
  const srcTorsoH = srcRect.h * torsoRatio;
  const srcLegY = srcTorsoY + srcTorsoH;
  const srcLegH = srcRect.h - srcLegY;

  const dstHeadH = drawH * headRatio;
  const dstTorsoY = -drawH * 0.95 + dstHeadH;
  const dstTorsoH = drawH * torsoRatio;
  const dstLegY = dstTorsoY + dstTorsoH;
  const dstLegH = drawH * legsRatio;

  const step = pose.step || 0;
  const bob = pose.bob || 0;
  const tilt = pose.tilt || 0;
  const bodyLift = pose.bodyLift || 0;
  const headLift = pose.headLift || 0;
  const yaw = pose.yaw == null ? 1 : pose.yaw;
  const sideBias = pose.sideBias || 0;
  const legWidthScale = pose.legWidthScale == null ? 1 : pose.legWidthScale;
  const torsoWidthScale = pose.torsoWidthScale == null ? 1 : pose.torsoWidthScale;
  const headWidthScale = pose.headWidthScale == null ? 1 : pose.headWidthScale;
  const legSwing = step * 5.5;
  const legLiftL = Math.max(0, -step) * 4.6 + (pose.legTuck || 0);
  const legLiftR = Math.max(0, step) * 4.6 + (pose.legTuck || 0);

  g.save();
  g.translate(anchorX, anchorY - bob);
  g.rotate(tilt);
  g.scale((1 + (pose.stretchX || 0)) * yaw, 1 + (pose.stretchY || 0));

  g.save();
  g.beginPath();
  g.rect(-drawW / 2, dstLegY, drawW / 2, dstLegH + 12);
  g.clip();
  g.drawImage(
    srcImg,
    srcRect.x,
    srcRect.y + srcLegY,
    srcRect.w,
    srcLegH,
    -drawW / 2 - legSwing + sideBias * 0.2,
    dstLegY - legLiftL,
    drawW * legWidthScale,
    dstLegH + legLiftL * 0.5
  );
  g.restore();

  g.save();
  g.beginPath();
  g.rect(0, dstLegY, drawW / 2, dstLegH + 12);
  g.clip();
  g.drawImage(
    srcImg,
    srcRect.x,
    srcRect.y + srcLegY,
    srcRect.w,
    srcLegH,
    -drawW / 2 + legSwing + sideBias * 0.2,
    dstLegY - legLiftR,
    drawW * legWidthScale,
    dstLegH + legLiftR * 0.5
  );
  g.restore();

  g.save();
  g.translate(step * 1.4 + sideBias, -bodyLift);
  g.drawImage(
    srcImg,
    srcRect.x,
    srcRect.y + srcTorsoY,
    srcRect.w,
    srcTorsoH,
    -drawW * torsoWidthScale / 2,
    dstTorsoY,
    drawW * torsoWidthScale,
    dstTorsoH
  );
  g.restore();

  g.save();
  g.translate(step * 0.8 + sideBias * 0.7, -bodyLift - headLift);
  g.drawImage(
    srcImg,
    srcRect.x,
    srcRect.y,
    srcRect.w,
    srcHeadH,
    -drawW * headWidthScale / 2,
    -drawH * 0.95,
    drawW * headWidthScale,
    dstHeadH
  );
  g.restore();

  g.restore();
  return frame;
}

function buildGeneratedCharacterAtlas(baseImg) {
  const frameWidth = 256;
  const frameHeight = 384;
  const srcRect = cropAlphaBounds(baseImg);

  const idlePoses = [
    { step: -0.12, bob: 0.2, tilt: -0.004, bodyLift: 0.2, headLift: 0.1, stretchX: 0.004, stretchY: -0.004, yaw: 0.96, sideBias: -0.6 },
    { step: 0.15, bob: 0.9, tilt: 0.008, bodyLift: 0.4, headLift: 0.25, stretchX: 0.008, stretchY: -0.008, yaw: 0.94, sideBias: 0.8 },
    { step: 0.1, bob: 0.5, tilt: 0.003, bodyLift: 0.2, headLift: 0.1, stretchX: 0.003, stretchY: -0.003, yaw: 0.95, sideBias: 0.5 },
    { step: -0.16, bob: 0.9, tilt: -0.008, bodyLift: 0.4, headLift: 0.25, stretchX: 0.008, stretchY: -0.008, yaw: 0.94, sideBias: -0.8 },
  ];
  const walkPoses = [
    { step: -0.62, bob: 1.2, tilt: -0.014, bodyLift: 0.7, headLift: 0.55, stretchX: 0.018, stretchY: -0.017, yaw: 0.9, sideBias: 1.4, legWidthScale: 0.95, torsoWidthScale: 0.94, headWidthScale: 0.92 },
    { step: -0.28, bob: 0.7, tilt: -0.008, bodyLift: 0.45, headLift: 0.35, stretchX: 0.013, stretchY: -0.012, yaw: 0.92, sideBias: 1.2, legWidthScale: 0.96, torsoWidthScale: 0.95, headWidthScale: 0.93 },
    { step: 0.08, bob: 0.45, tilt: -0.002, bodyLift: 0.28, headLift: 0.2, stretchX: 0.01, stretchY: -0.01, yaw: 0.93, sideBias: 1.0, legWidthScale: 0.97, torsoWidthScale: 0.96, headWidthScale: 0.94 },
    { step: 0.62, bob: 1.2, tilt: 0.014, bodyLift: 0.7, headLift: 0.55, stretchX: 0.018, stretchY: -0.017, yaw: 0.9, sideBias: 1.4, legWidthScale: 0.95, torsoWidthScale: 0.94, headWidthScale: 0.92 },
    { step: 0.28, bob: 0.7, tilt: 0.008, bodyLift: 0.45, headLift: 0.35, stretchX: 0.013, stretchY: -0.012, yaw: 0.92, sideBias: 1.2, legWidthScale: 0.96, torsoWidthScale: 0.95, headWidthScale: 0.93 },
    { step: -0.08, bob: 0.45, tilt: 0.002, bodyLift: 0.28, headLift: 0.2, stretchX: 0.01, stretchY: -0.01, yaw: 0.93, sideBias: 1.0, legWidthScale: 0.97, torsoWidthScale: 0.96, headWidthScale: 0.94 },
  ];
  const runPoses = [
    { step: -1.0, bob: 2.8, tilt: -0.03, bodyLift: 1.4, headLift: 1.2, stretchX: 0.034, stretchY: -0.032, yaw: 0.78, sideBias: 2.8, legWidthScale: 0.88, torsoWidthScale: 0.86, headWidthScale: 0.83 },
    { step: -0.7, bob: 2.1, tilt: -0.024, bodyLift: 1.0, headLift: 0.9, stretchX: 0.03, stretchY: -0.028, yaw: 0.8, sideBias: 2.5, legWidthScale: 0.9, torsoWidthScale: 0.88, headWidthScale: 0.84 },
    { step: -0.3, bob: 1.2, tilt: -0.014, bodyLift: 0.7, headLift: 0.5, stretchX: 0.024, stretchY: -0.022, yaw: 0.84, sideBias: 2.2, legWidthScale: 0.92, torsoWidthScale: 0.9, headWidthScale: 0.86 },
    { step: 0.2, bob: 1.1, tilt: -0.006, bodyLift: 0.6, headLift: 0.4, stretchX: 0.02, stretchY: -0.02, yaw: 0.87, sideBias: 2.0, legWidthScale: 0.94, torsoWidthScale: 0.92, headWidthScale: 0.88 },
    { step: 0.95, bob: 2.8, tilt: 0.028, bodyLift: 1.4, headLift: 1.2, stretchX: 0.034, stretchY: -0.032, yaw: 0.78, sideBias: 2.8, legWidthScale: 0.88, torsoWidthScale: 0.86, headWidthScale: 0.83 },
    { step: 0.7, bob: 2.1, tilt: 0.024, bodyLift: 1.0, headLift: 0.9, stretchX: 0.03, stretchY: -0.028, yaw: 0.8, sideBias: 2.5, legWidthScale: 0.9, torsoWidthScale: 0.88, headWidthScale: 0.84 },
    { step: 0.3, bob: 1.2, tilt: 0.014, bodyLift: 0.7, headLift: 0.5, stretchX: 0.024, stretchY: -0.022, yaw: 0.84, sideBias: 2.2, legWidthScale: 0.92, torsoWidthScale: 0.9, headWidthScale: 0.86 },
    { step: -0.2, bob: 1.1, tilt: 0.006, bodyLift: 0.6, headLift: 0.4, stretchX: 0.02, stretchY: -0.02, yaw: 0.87, sideBias: 2.0, legWidthScale: 0.94, torsoWidthScale: 0.92, headWidthScale: 0.88 },
  ];
  const jumpPoses = [
    { step: -0.2, bob: 0.8, tilt: -0.016, bodyLift: 1.1, headLift: 1.7, legTuck: 2.7, stretchX: 0.012, stretchY: -0.02, yaw: 0.86, sideBias: 1.8 },
    { step: -0.05, bob: 0.45, tilt: -0.006, bodyLift: 1.5, headLift: 2.1, legTuck: 3.7, stretchX: 0.015, stretchY: -0.024, yaw: 0.85, sideBias: 1.8 },
    { step: 0.08, bob: 0.3, tilt: 0.004, bodyLift: 1.3, headLift: 1.8, legTuck: 3.1, stretchX: 0.012, stretchY: -0.022, yaw: 0.85, sideBias: 1.8 },
    { step: 0.22, bob: 1.0, tilt: 0.016, bodyLift: 0.9, headLift: 1.2, legTuck: 2.2, stretchX: 0.009, stretchY: -0.016, yaw: 0.87, sideBias: 1.8 },
  ];

  const allPoses = [...idlePoses, ...walkPoses, ...runPoses, ...jumpPoses];
  const cols = 4;
  const rows = Math.ceil(allPoses.length / cols);
  const atlas = document.createElement('canvas');
  atlas.width = cols * frameWidth;
  atlas.height = rows * frameHeight;
  const g = atlas.getContext('2d');

  const frames = [];
  allPoses.forEach((pose, i) => {
    const fx = (i % cols) * frameWidth;
    const fy = Math.floor(i / cols) * frameHeight;
    const frame = drawCharacterPoseFrame(baseImg, srcRect, pose, frameWidth, frameHeight);
    g.drawImage(frame, fx, fy);
    frames.push({ x: fx, y: fy, w: frameWidth, h: frameHeight });
  });

  spriteSheet.frameWidth = frameWidth;
  spriteSheet.frameHeight = frameHeight;
  spriteSheet.frames = frames;
  spriteSheet.animations.idle = [0, 1, 2, 3];
  spriteSheet.animations.walk = [4, 5, 6, 7, 8, 9];
  spriteSheet.animations.run = [10, 11, 12, 13, 14, 15, 16, 17];
  spriteSheet.animations.jump = [18, 19, 20, 21];
  spriteSheet.image = atlas;
  spriteSheet.renderImage = atlas;
  spriteSheet.ready = true;
  playerImageReady = true;
}

async function loadBananaSpritePack() {
  try {
    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });

    // 1) Preferred: use pre-cut frames from exports
    const frameSets = [
      Array.from({ length: 20 }, (_, i) => `ch/character_exact_${String(i + 1).padStart(2, '0')}.png`),
      Array.from({ length: 16 }, (_, i) => `exports/character_16_nukki_frames/frame_${String(i).padStart(2, '0')}.png`),
      Array.from({ length: 16 }, (_, i) => `frames/banana_${String(i).padStart(2, '0')}.png`),
    ];
    try {
      let frameImgs = null;
      let usedNames = null;
      for (const paths of frameSets) {
        try {
          frameImgs = await Promise.all(paths.map((p) => loadImage(p)));
          usedNames = paths.map((p) => p.split('/').pop() || p);
          break;
        } catch (_) {
          // try next frame set
        }
      }
      if (!frameImgs || !usedNames) {
        throw new Error('No frame set found');
      }

      const fw = frameImgs[0].width;
      const fh = frameImgs[0].height;
      const count = frameImgs.length;
      const cols = count >= 20 ? 5 : 4;
      const rows = Math.ceil(count / cols);
      const atlas = document.createElement('canvas');
      atlas.width = fw * cols;
      atlas.height = fh * rows;
      const g = atlas.getContext('2d');
      const frames = [];

      frameImgs.forEach((img, i) => {
        const x = (i % cols) * fw;
        const y = Math.floor(i / cols) * fh;
        g.drawImage(img, x, y);
        frames.push({ filename: usedNames[i], x, y, w: fw, h: fh });
      });

      // Optional front-facing idle start frame (kept same size as other frames).
      const frontCandidates = [
        'ch/character_exact_0.PNG',
        'ch/character_exact_0.png',
        'ch/front.png',
        'ch/front.PNG',
        'ch.PNG',
      ];
      for (const frontPath of frontCandidates) {
        try {
          const front = await loadImage(`${frontPath}?v=${Date.now()}`);
          const fx = frames[0]?.x ?? 0;
          const fy = frames[0]?.y ?? 0;
          g.clearRect(fx, fy, fw, fh);

          // Normalize the source first, remove dark matte, then trim content bounds.
          const raw = document.createElement('canvas');
          raw.width = front.width;
          raw.height = front.height;
          const rg = raw.getContext('2d', { willReadFrequently: true });
          rg.drawImage(front, 0, 0);
          const rawData = rg.getImageData(0, 0, raw.width, raw.height);
          const px = rawData.data;
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i];
            const gg = px[i + 1];
            const b = px[i + 2];
            // Remove near-black backdrop around character.
            if (r < 20 && gg < 24 && b < 28) px[i + 3] = 0;
          }
          rg.putImageData(rawData, 0, 0);

          let minX = raw.width;
          let minY = raw.height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < raw.height; y += 1) {
            for (let x = 0; x < raw.width; x += 1) {
              const a = px[(y * raw.width + x) * 4 + 3];
              if (a > 18) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          const hasBounds = maxX >= minX && maxY >= minY;
          const cropX = hasBounds ? minX : 0;
          const cropY = hasBounds ? minY : 0;
          const cropW = hasBounds ? maxX - minX + 1 : raw.width;
          const cropH = hasBounds ? maxY - minY + 1 : raw.height;

          const fitScale = Math.min((fw * 0.9) / cropW, (fh * 0.95) / cropH) * 0.8;
          const dw = Math.round(cropW * fitScale);
          const dh = Math.round(cropH * fitScale);
          const dx = fx + Math.round((fw - dw) * 0.5);
          const dy = fy + fh - dh; // exact ground contact like other frames
          g.drawImage(raw, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
          frames[0].filename = frontPath.split('/').pop() || frontPath;
          break;
        } catch (_) {
          // try next candidate
        }
      }

      spriteSheet.frameWidth = fw;
      spriteSheet.frameHeight = fh;
      spriteSheet.frames = frames;
      spriteSheet.frontFrameIndex = 0;
      spriteSheet.backFrameIndex = frames.findIndex((f) =>
        /^character_exact_01\.png$/i.test(String(f.filename || ''))
      );
      if (spriteSheet.backFrameIndex < 0 && frames.length > 1) {
        spriteSheet.backFrameIndex = 1;
      }
      if (count >= 20) {
        // ch folder: 20 frames
        spriteSheet.animations.idle = [0, 1, 2, 3];
        spriteSheet.animations.walk = [4, 5, 6, 7, 8, 9];
        spriteSheet.animations.run = [10, 11, 12, 13, 14, 15];
        spriteSheet.animations.jump = [16, 17, 18];
      } else {
        // 16-frame fallback sets
        spriteSheet.animations.idle = [0, 1, 2, 3];
        spriteSheet.animations.walk = [4, 5, 6, 7];
        spriteSheet.animations.run = [8, 9, 10, 11];
        spriteSheet.animations.jump = [12, 13, 14];
      }
      spriteSheet.image = atlas;
      spriteSheet.renderImage = atlas;
      spriteSheet.ready = true;
      playerImageReady = true;
      return;
    } catch (_) {
      // continue to json-based fallback
    }

    // 2) Fallback: atlas json+png
    let data = null;
    const jsonCandidates = [
      'assets/character_sheet_cut.json',
      'assets/character_reference_sheet.json',
      'assets/character_fullbody_sprite.json',
    ];
    for (const path of jsonCandidates) {
      const res = await fetch(path);
      if (res.ok) {
        data = await res.json();
        break;
      }
    }
    if (!data) throw new Error('No sprite json found');

    spriteSheet.frameWidth = data.frameWidth || spriteSheet.frameWidth;
    spriteSheet.frameHeight = data.frameHeight || spriteSheet.frameHeight;
    spriteSheet.frames = Array.isArray(data.frames) ? data.frames : [];

    const anims = data.animations || {};
    const asNums = (arr) =>
      (Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : []);
    const idle = asNums(anims.idle);
    const walk = asNums(anims.walk);
    const run = asNums(anims.run);
    const jump = asNums(anims.jump);

    if (idle.length) spriteSheet.animations.idle = idle;
    if (walk.length) spriteSheet.animations.walk = walk;
    if (run.length) spriteSheet.animations.run = run;
    if (jump.length) spriteSheet.animations.jump = jump;
    // Derive walk from run when a dedicated walk strip is absent.
    if (!walk.length) spriteSheet.animations.walk = run.length >= 4
      ? [run[1], run[3], run[5] ?? run[1], run[7] ?? run[3]]
      : (run.length ? run.slice() : spriteSheet.animations.idle.slice());

    spriteSheet.image.onload = () => {
      // This atlas is already clean output for direct game usage.
      spriteSheet.renderImage = spriteSheet.image;
      spriteSheet.ready = true;
      playerImageReady = true;
    };
    const imageFile = data.image || 'character_reference_sheet.png';
    spriteSheet.image.src = `assets/${imageFile}`;
  } catch (err) {
    // Fallback: generate frames from the base art at runtime.
    const baseImg = new Image();
    baseImg.onload = () => {
      buildGeneratedCharacterAtlas(baseImg);
    };
    baseImg.src = 'character.png';
    console.error('Failed to load prebuilt character sprite, fallback to runtime generation:', err);
  }
}

loadBananaSpritePack();
const playerVisualOffsetY = 18;
const playerVisualExtraHeight = 22;
const playerSpriteOriginX = 0.5;
const playerSpriteOriginY = 0.95;
const playerSpriteRenderScale = 1.2;
const playerGroundSnapOffset = 24;
const frontPoseExtraGroundOffset = 8;

let audioCtx = null;
let audioUnlocked = false;
const gameBgm = new Audio('clear.mp3');
gameBgm.loop = true;
gameBgm.preload = 'auto';
gameBgm.volume = 0.42;

const clearBgm = new Audio('super.mp3');
clearBgm.loop = false;
clearBgm.preload = 'auto';
clearBgm.volume = 0.5;

let activeBgm = 'none';

function initAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
}

function stopAllBgm() {
  gameBgm.pause();
  clearBgm.pause();
}

function playBgmTrack(kind) {
  if (!audioUnlocked) return;
  const target = kind === 'clear' ? clearBgm : gameBgm;
  const next = kind === 'clear' ? 'clear' : 'game';
  if (activeBgm === next && !target.paused) return;

  stopAllBgm();
  target.currentTime = 0;
  target.play().then(() => {
    activeBgm = next;
  }).catch(() => {});
}

function ensureAudioReady() {
  initAudio();
  if (!audioCtx) return;

  const start = () => {
    audioUnlocked = true;
    if (!state.intro) {
      playBgmTrack(state.win ? 'clear' : 'game');
    }
  };

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(start).catch(() => {});
  } else {
    start();
  }
}

function unlockAudioByGesture() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  audioUnlocked = true;
  if (!state.intro) {
    playBgmTrack(state.win ? 'clear' : 'game');
  }
}

function scheduleBgm() {
  // BGM now uses mp3 tracks; keep function for update loop compatibility.
}

function beep(freq, duration, type, volume) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
    return;
  }
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
  beep(980, 0.07, 'square', 0.13);
  beep(1320, 0.08, 'square', 0.09);
}

function sfxHit() {
  beep(200, 0.18, 'sawtooth', 0.07);
}

function sfxWin() {
  beep(760, 0.12, 'triangle', 0.07);
  setTimeout(() => beep(1020, 0.12, 'triangle', 0.07), 120);
  setTimeout(() => beep(1320, 0.16, 'triangle', 0.08), 240);
}

function sfxFlagDrop() {
  const notes = [900, 820, 740, 660, 600, 540];
  notes.forEach((n, i) => {
    setTimeout(() => beep(n, 0.08, 'triangle', 0.06), i * 85);
  });
}

function sfxBoost() {
  beep(650, 0.06, 'square', 0.07);
  setTimeout(() => beep(880, 0.08, 'square', 0.06), 60);
}

function sfxItem() {
  beep(740, 0.08, 'triangle', 0.13);
  setTimeout(() => beep(988, 0.11, 'triangle', 0.1), 70);
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
  clearTimer: 0,
  flagDrop: 0,
  lastTapLeft: -Infinity,
  lastTapRight: -Infinity,
  lastTapJump: -Infinity,
  boostTimer: 0,
  boostCooldown: 0,
  boostDir: 0,
  jumpBoostCooldown: 0,
  speedItemTimer: 0,
  shieldTimer: 0,
  damageInvuln: 0,
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
    facingVisual: 1,
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
  { x: 560, y: 400, r: 12, got: false },
  { x: 620, y: 400, r: 12, got: false },
  { x: 680, y: 400, r: 12, got: false },
  { x: 940, y: 255, r: 12, got: false },
  { x: 1240, y: 350, r: 12, got: false },
  { x: 1400, y: 350, r: 12, got: false },
  { x: 1600, y: 220, r: 12, got: false },
  { x: 1700, y: 220, r: 12, got: false },
  { x: 1980, y: 340, r: 12, got: false },
  { x: 2050, y: 340, r: 12, got: false },
  { x: 2210, y: 240, r: 12, got: false },
  { x: 2390, y: 240, r: 12, got: false },
  { x: 2720, y: 310, r: 12, got: false },
  { x: 2810, y: 210, r: 12, got: false },
  { x: 3070, y: 390, r: 12, got: false },
  { x: 3370, y: 390, r: 12, got: false },
  { x: 3460, y: 390, r: 12, got: false },
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

const spikes = [];

const items = [
  { x: 1110, y: 265, r: 14, type: 'time', got: false },
  { x: 1760, y: 305, r: 14, type: 'boost', got: false },
  { x: 2320, y: 230, r: 14, type: 'shield', got: false },
  { x: 2960, y: 190, r: 14, type: 'time', got: false },
  { x: 3330, y: 360, r: 14, type: 'boost', got: false },
];

const LAND_GAP_SCALE = 1.2;
if (LAND_GAP_SCALE !== 1) {
  const sx = (x) => Math.round(x * LAND_GAP_SCALE);

  for (const cloud of state.clouds) cloud.x = sx(cloud.x);
  for (const plat of platforms) plat.x = sx(plat.x);
  for (const coin of coins) coin.x = sx(coin.x);
  for (const enemy of enemies) {
    enemy.x = sx(enemy.x);
    enemy.minX = sx(enemy.minX);
    enemy.maxX = sx(enemy.maxX);
  }
  for (const item of items) item.x = sx(item.x);
  goal.x = WORLD_WIDTH - 160;
}

function resetPlayerPosition() {
  state.player.x = 90;
  state.player.y = FLOOR_Y - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onWallSlide = false;
  state.player.wallSlideDir = 0;
  state.player.facing = 1;
  state.player.facingVisual = 1;
  state.boostTimer = 0;
  state.boostDir = 0;
  state.jumpBoostCooldown = 0;
  state.damageInvuln = 0.7;
}

function resetGame() {
  activeBgm = 'none';
  stopAllBgm();
  state.cameraX = 0;
  state.timeLeft = 120;
  state.timerTick = 0;
  state.coins = 0;
  state.lives = 3;
  state.intro = !state.introSeen;
  state.introTime = 0;
  state.gameOver = false;
  state.win = false;
  state.clearTimer = 0;
  state.flagDrop = 0;
  state.lastTapLeft = -Infinity;
  state.lastTapRight = -Infinity;
  state.lastTapJump = -Infinity;
  state.boostCooldown = 0;
  state.speedItemTimer = 0;
  state.shieldTimer = 0;
  state.damageInvuln = 0;

  for (const coin of coins) coin.got = false;
  for (const enemy of enemies) enemy.dead = false;
  for (const item of items) item.got = false;

  setPlayerAnimation('idle');
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

function setPlayerAnimation(name) {
  if (playerAnim.name === name) return;
  playerAnim.name = name;
  playerAnim.frameCursor = 0;
  playerAnim.timer = 0;
}

function updatePlayerAnimation(dt) {
  const p = state.player;
  if (!p.onGround) {
    setPlayerAnimation('jump');
  } else {
    const speed = Math.abs(p.vx);
    if (speed > 210) {
      setPlayerAnimation('run');
    } else if (speed > 26) {
      setPlayerAnimation('walk');
    } else {
      setPlayerAnimation('idle');
    }
  }

  const frames = spriteSheet.animations[playerAnim.name] || [0];
  if (playerAnim.name === 'idle') {
    playerAnim.frameCursor = 0;
    playerAnim.timer = 0;
    return;
  }
  const fps = playerAnim.name === 'run'
    ? 16
    : playerAnim.name === 'walk'
      ? 10
      : playerAnim.name === 'jump'
        ? 12
        : 6;
  playerAnim.timer += dt;
  const frameDuration = 1 / fps;
  while (playerAnim.timer >= frameDuration) {
    playerAnim.timer -= frameDuration;
    if (playerAnim.name === 'jump') {
      playerAnim.frameCursor = Math.min(playerAnim.frameCursor + 1, frames.length - 1);
    } else {
      playerAnim.frameCursor = (playerAnim.frameCursor + 1) % frames.length;
    }
  }
}

function getCurrentPlayerFrame() {
  const fw = spriteSheet.frameWidth;
  const fh = spriteSheet.frameHeight;
  const img = spriteSheet.image;
  const frames = spriteSheet.animations[playerAnim.name] || [0];
  const frameListIndex = frames[Math.min(playerAnim.frameCursor, frames.length - 1)] ?? 0;

  if (!state.intro) {
    if (keys.up) {
      const backIdx = spriteSheet.backFrameIndex >= 0 ? spriteSheet.backFrameIndex : 1;
      const backFrame = spriteSheet.frames[backIdx];
      if (backFrame) return backFrame;
    }
    if (keys.down) {
      const frontIdx = spriteSheet.frontFrameIndex >= 0 ? spriteSheet.frontFrameIndex : 0;
      const frontFrame = spriteSheet.frames[frontIdx];
      if (frontFrame) return frontFrame;
    }
  }

  if (playerAnim.name === 'jump' && frames.length >= 3) {
    const vy = state.player.vy;
    if (vy < -220) {
      return spriteSheet.frames[frames[0]] || { x: frames[0] * fw, y: 0, w: fw, h: fh };
    }
    if (frames.length === 3) {
      if (vy < 220) {
        return spriteSheet.frames[frames[1]] || { x: frames[1] * fw, y: 0, w: fw, h: fh };
      }
      return spriteSheet.frames[frames[2]] || { x: frames[2] * fw, y: 0, w: fw, h: fh };
    }

    if (vy < -40) {
      return spriteSheet.frames[frames[1]] || { x: frames[1] * fw, y: 0, w: fw, h: fh };
    }
    if (vy < 220) {
      return spriteSheet.frames[frames[2]] || { x: frames[2] * fw, y: 0, w: fw, h: fh };
    }
    return spriteSheet.frames[frames[3]] || { x: frames[3] * fw, y: 0, w: fw, h: fh };
  }

  if (spriteSheet.frames[frameListIndex]) return spriteSheet.frames[frameListIndex];

  const cols = Math.max(1, Math.floor((img.width || fw) / fw));
  const sx = (frameListIndex % cols) * fw;
  const sy = Math.floor(frameListIndex / cols) * fh;
  return { x: sx, y: sy, w: fw, h: fh };
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

function getPlatformSurfaceY(plat, worldX) {
  const t = clamp((worldX - plat.x) / plat.w, 0, 1);
  const ridgeBase = plat.y + plat.h * 0.48;
  const amp = Math.min(44, Math.max(20, plat.h * 0.42));
  const softWave = Math.sin(t * Math.PI) * amp * 0.85;
  const detailWave = Math.sin(t * Math.PI * 2) * amp * 0.35;
  return ridgeBase - softWave - detailWave;
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
  if (state.damageInvuln > 0) return;
  if (state.shieldTimer > 0) {
    state.shieldTimer = 0;
    state.damageInvuln = 1.0;
    sfxItem();
    return;
  }
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

  const speedItem = state.speedItemTimer > 0;
  const boosting = state.boostTimer > 0;
  const accel = boosting ? 2600 : speedItem ? 2050 : 1500;
  const maxSpeed = boosting ? 520 : speedItem ? 420 : 300;
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
    const prevY = p.y - p.vy * dt;
    const prevBottom = prevY + p.h;
    const currBottom = p.y + p.h;
    const probeX = clamp(p.x + p.w * 0.5, plat.x + 2, plat.x + plat.w - 2);
    const surfaceY = getPlatformSurfaceY(plat, probeX);
    const inPlatformX = p.x + p.w > plat.x && p.x < plat.x + plat.w;

    if (inPlatformX && p.vy >= 0 && prevBottom <= surfaceY + 6 && currBottom >= surfaceY - 1) {
      p.y = surfaceY - p.h;
      p.vy = 0;
      p.onGround = true;
      continue;
    }

    if (!overlap(p, plat)) continue;

    // Ignore rectangular body collision while the player is on/near the ridge surface.
    // This prevents false "inside platform" hits during normal jumps on mountain slopes.
    const solidBodyTop = plat.y + plat.h * 0.58;
    if (p.y + p.h <= solidBodyTop) continue;

    if (p.vy >= 0 && prevBottom <= plat.y + 6) {
      p.y = surfaceY - p.h;
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

  // Face the actual movement direction and smoothly turn whole body.
  if (Math.abs(p.vx) > 10) {
    p.facing = p.vx < 0 ? -1 : 1;
  }
  p.facingVisual += (p.facing - p.facingVisual) * Math.min(1, dt * 16);

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

    const prevX = p.x - p.vx * dt;
    const prevY = p.y - p.vy * dt;
    const prevBottom = prevY + p.h;
    const currBottom = p.y + p.h;

    // Top landing: treat square enemies like climbable obstacles.
    if (p.vy >= 0 && prevBottom <= e.y + 8 && currBottom >= e.y) {
      p.y = e.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.onWallSlide = false;
      p.wallSlideDir = 0;
      // Follow moving obstacle slightly so the player does not slip off instantly.
      p.x += e.vx * dt;
      continue;
    }

    // Side blocking.
    if (prevX + p.w <= e.x + 4) {
      p.x = e.x - p.w;
      p.vx = Math.min(0, p.vx);
      continue;
    }
    if (prevX >= e.x + e.w - 4) {
      p.x = e.x + e.w;
      p.vx = Math.max(0, p.vx);
      continue;
    }

    // Bottom blocking when jumping into obstacle underside.
    if (p.vy < 0 && prevY >= e.y + e.h - 4) {
      p.y = e.y + e.h;
      p.vy = 30;
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

function updateItems() {
  const p = state.player;
  for (const item of items) {
    if (item.got) continue;
    const hit =
      p.x < item.x + item.r &&
      p.x + p.w > item.x - item.r &&
      p.y < item.y + item.r &&
      p.y + p.h > item.y - item.r;

    if (!hit) continue;
    item.got = true;
    sfxItem();
    if (item.type === 'time') {
      state.timeLeft += 18;
    } else if (item.type === 'boost') {
      state.speedItemTimer = 8;
    } else if (item.type === 'shield') {
      state.shieldTimer = 12;
    }
    updateHud();
  }
}

function updateHazards() {
  const p = state.player;
  for (const spike of spikes) {
    if (overlap(p, spike)) {
      respawnOrLose();
      break;
    }
  }
}

function updateGoal() {
  if (state.win) return;
  const p = state.player;
  const area = { x: goal.x - 28, y: goal.y, w: 70, h: goal.h };
  if (overlap(p, area)) {
    state.win = true;
    state.clearTimer = 0;
    state.flagDrop = 0;
    playBgmTrack('clear');
    sfxWin();
    sfxFlagDrop();
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
  if (state.intro || state.gameOver || state.win) return;
  if (!keys.left && now - state.lastTapLeft <= DOUBLE_TAP_WINDOW_MS) {
    tryStartBoost(-1);
  }
  state.lastTapLeft = now;
  keys.left = true;
}

function pressRight(now = performance.now()) {
  if (state.intro || state.gameOver || state.win) return;
  if (!keys.right && now - state.lastTapRight <= DOUBLE_TAP_WINDOW_MS) {
    tryStartBoost(1);
  }
  state.lastTapRight = now;
  keys.right = true;
}

function pressJump(now = performance.now()) {
  if (state.intro || state.gameOver || state.win) return;
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

  // Draw sun first so the title stays in front.
  ctx.fillStyle = '#fff3a7';
  ctx.beginPath();
  ctx.arc(820, 90, 42, 0, Math.PI * 2);
  ctx.fill();

  // Intro title watermark in gameplay background.
  ctx.save();
  ctx.textAlign = 'center';
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
  for (let i = 0; i < 7; i += 1) {
    const baseX = i * 560 - state.cameraX * 0.45;
    const topY = 290 + (i % 2) * 20;
    const w = 360 + (i % 3) * 40;
    const h = 170;

    // Floating shadow
    ctx.fillStyle = 'rgba(56, 120, 92, 0.22)';
    ctx.beginPath();
    ctx.ellipse(baseX + w * 0.5, topY + h + 28, w * 0.36, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Island body
    ctx.fillStyle = '#86d890';
    ctx.beginPath();
    ctx.moveTo(baseX, topY + 34);
    ctx.quadraticCurveTo(baseX + w * 0.24, topY - 42, baseX + w * 0.5, topY - 8);
    ctx.quadraticCurveTo(baseX + w * 0.76, topY - 44, baseX + w, topY + 30);
    ctx.quadraticCurveTo(baseX + w * 0.82, topY + h * 0.55, baseX + w * 0.5, topY + h);
    ctx.quadraticCurveTo(baseX + w * 0.18, topY + h * 0.55, baseX, topY + 34);
    ctx.closePath();
    ctx.fill();

    // Island highlight
    ctx.fillStyle = 'rgba(196, 246, 186, 0.45)';
    ctx.beginPath();
    ctx.moveTo(baseX + 24, topY + 26);
    ctx.quadraticCurveTo(baseX + w * 0.38, topY - 36, baseX + w * 0.6, topY + 8);
    ctx.quadraticCurveTo(baseX + w * 0.45, topY + 26, baseX + 24, topY + 26);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPlatform(plat) {
  const x = plat.x - state.cameraX;
  const y = plat.y;
  const baseY = y + plat.h;
  const samples = Math.max(10, Math.floor(plat.w / 20));
  const step = plat.w / samples;

  // Floating aura and soft drop shadow.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#d7fbe1';
  ctx.beginPath();
  ctx.ellipse(x + plat.w * 0.5, y + plat.h * 0.45, plat.w * 0.43, plat.h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#316b52';
  ctx.beginPath();
  ctx.ellipse(x + plat.w * 0.5, baseY + 18, plat.w * 0.36, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Smooth mountain body
  ctx.fillStyle = '#5ebc5c';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, getPlatformSurfaceY(plat, plat.x));
  for (let i = 1; i <= samples; i += 1) {
    const worldX = plat.x + step * i;
    ctx.lineTo(x + step * i, getPlatformSurfaceY(plat, worldX));
  }
  ctx.lineTo(x + plat.w, baseY);
  ctx.closePath();
  ctx.fill();

  // Hanging underside to emphasize floating-island look.
  ctx.fillStyle = '#3f8a43';
  ctx.beginPath();
  ctx.moveTo(x + plat.w * 0.18, baseY - 6);
  ctx.quadraticCurveTo(x + plat.w * 0.3, baseY + 28, x + plat.w * 0.38, baseY + 58);
  ctx.quadraticCurveTo(x + plat.w * 0.5, baseY + 74, x + plat.w * 0.62, baseY + 58);
  ctx.quadraticCurveTo(x + plat.w * 0.7, baseY + 28, x + plat.w * 0.82, baseY - 6);
  ctx.lineTo(x + plat.w * 0.18, baseY - 6);
  ctx.closePath();
  ctx.fill();

  // Soft shadow layer
  ctx.fillStyle = '#4aa34b';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, getPlatformSurfaceY(plat, plat.x) + 18);
  for (let i = 1; i <= samples; i += 1) {
    const worldX = plat.x + step * i;
    ctx.lineTo(x + step * i, getPlatformSurfaceY(plat, worldX) + 18);
  }
  ctx.lineTo(x + plat.w, baseY);
  ctx.closePath();
  ctx.fill();

  // Bright smooth ridge line
  ctx.strokeStyle = '#88e07d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, getPlatformSurfaceY(plat, plat.x));
  for (let i = 1; i <= samples; i += 1) {
    const worldX = plat.x + step * i;
    ctx.lineTo(x + step * i, getPlatformSurfaceY(plat, worldX));
  }
  ctx.stroke();
}

function drawCoins() {
  for (const coin of coins) {
    if (coin.got) continue;
    const x = coin.x - state.cameraX;
    const t = performance.now() * 0.006 + coin.x * 0.01;
    const floatY = Math.sin(t) * 6;
    const pulse = 1 + Math.sin(t * 1.7) * 0.08;
    const ry = coin.y + floatY;
    const outer = coin.r * pulse;
    const inner = outer * 0.5;

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#ffe7a1';
    ctx.beginPath();
    ctx.arc(x, ry, (coin.r + 10) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Star coin
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (Math.PI / 5) * i;
      const r = i % 2 === 0 ? outer : inner;
      const px = x + Math.cos(a) * r;
      const py = ry + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ff9f00';
    ctx.lineWidth = 3.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner sparkle
    ctx.fillStyle = 'rgba(255,245,210,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, ry - inner * 0.7);
    ctx.lineTo(x + inner * 0.22, ry - inner * 0.22);
    ctx.lineTo(x + inner * 0.7, ry);
    ctx.lineTo(x + inner * 0.22, ry + inner * 0.22);
    ctx.lineTo(x, ry + inner * 0.7);
    ctx.lineTo(x - inner * 0.22, ry + inner * 0.22);
    ctx.lineTo(x - inner * 0.7, ry);
    ctx.lineTo(x - inner * 0.22, ry - inner * 0.22);
    ctx.closePath();
    ctx.fill();

    // Clean star silhouette: remove top stem/spark shard.
  }
}

function drawSpikes() {
  for (const spike of spikes) {
    const x = spike.x - state.cameraX;
    const y = spike.y;
    const peaks = Math.max(2, Math.floor(spike.w / 14));
    const step = spike.w / peaks;

    ctx.fillStyle = '#d74f4f';
    ctx.beginPath();
    ctx.moveTo(x, y + spike.h);
    for (let i = 0; i < peaks; i += 1) {
      ctx.lineTo(x + step * i + step / 2, y);
      ctx.lineTo(x + step * (i + 1), y + spike.h);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8d2c2c';
    ctx.fillRect(x, y + spike.h - 4, spike.w, 4);
  }
}

function drawItems() {
  for (const item of items) {
    if (item.got) continue;
    const x = item.x - state.cameraX;
    const t = performance.now() * 0.006 + item.x * 0.01;
    const y = item.y + Math.sin(t) * 7;
    const pulse = 1 + Math.sin(t * 1.6) * 0.1;

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = item.type === 'time' ? '#9fe6ff' : item.type === 'boost' ? '#ffd18a' : '#b2ffd0';
    ctx.beginPath();
    ctx.arc(x, y, (item.r + 10) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (item.type === 'time') {
      ctx.fillStyle = '#7fd8ff';
      ctx.beginPath();
      ctx.arc(x, y, item.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#165e86';
      ctx.fillRect(x - 2, y - 8, 4, 10);
      ctx.fillRect(x - 2, y + 4, 8, 4);
    } else if (item.type === 'boost') {
      ctx.fillStyle = '#ffbd59';
      ctx.beginPath();
      ctx.arc(x, y, item.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a4e00';
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 6);
      ctx.lineTo(x + 2, y - 1);
      ctx.lineTo(x - 1, y - 1);
      ctx.lineTo(x + 5, y - 9);
      ctx.lineTo(x + 1, y - 1);
      ctx.lineTo(x + 4, y - 1);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#8be0aa';
      ctx.beginPath();
      ctx.arc(x, y, item.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2f7d4c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, item.r * pulse - 4, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  const wobble = state.win ? 0 : Math.sin(performance.now() * 0.006) * 8;
  const flagY = goal.y + 20 + state.flagDrop;
  ctx.fillStyle = '#4a6bff';
  ctx.beginPath();
  ctx.moveTo(x + goal.w, flagY);
  ctx.lineTo(x + goal.w + 54 + wobble, flagY + 22);
  ctx.lineTo(x + goal.w, flagY + 44);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const p = state.player;
  const x = p.x - state.cameraX;
  const bodyW = p.w;
  const bodyH = p.h;
  const drawH = (bodyH + playerVisualExtraHeight) * playerSpriteRenderScale;
  const drawW = bodyW * playerSpriteRenderScale;
  const anchorX = x + bodyW * 0.5;
  const anchorY = p.y + bodyH + playerGroundSnapOffset;
  const speedAbs = Math.abs(p.vx);
  const moving = speedAbs > 18;
  const running = speedAbs > 260 || state.boostTimer > 0 || state.speedItemTimer > 0;
  const now = performance.now();
  const lockFrontFacing =
    (playerAnim.name === 'idle' && playerAnim.frameCursor === 0) ||
    keys.down ||
    keys.up;
  const faceDirRaw = p.facingVisual ?? p.facing ?? 1;
  // Keep intro/idle front frame unflipped so chest text stays readable.
  const faceSign = lockFrontFacing ? 1 : (faceDirRaw < 0 ? 1 : -1);
  // Keep a minimum width while turning so sprite does not disappear.
  const faceTurnScale = lockFrontFacing ? 1 : (faceSign * Math.max(0.28, Math.abs(faceDirRaw)));

  if (state.shieldTimer > 0) {
    const aura = 0.2 + Math.sin(performance.now() * 0.01) * 0.08;
    ctx.save();
    ctx.globalAlpha = aura;
    ctx.fillStyle = '#73ffd0';
    ctx.beginPath();
    ctx.ellipse(anchorX, p.y + bodyH * 0.55, bodyW * 0.56, bodyH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (playerImageReady && spriteSheet.ready) {
    if (state.damageInvuln > 0 && Math.sin(performance.now() * 0.05) > 0.2) return;
    ctx.save();

    const phase = now * (running ? 0.03 : 0.02);
    const bob = p.onGround ? (moving ? Math.abs(Math.sin(phase)) * (running ? 5 : 3) : 0) : 2;
    const tilt = p.onGround
      ? clamp(p.vx / 450, -0.1, 0.1)
      : clamp(p.vy / 1200, -0.1, 0.1) * 0.45;

    // Contact shadow (aligned to sprite origin y=0.95).
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#102032';
    ctx.beginPath();
    ctx.ellipse(anchorX, anchorY - 2, bodyW * 0.42, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const frame = getCurrentPlayerFrame();
    const fw = spriteSheet.frameWidth;
    const fh = spriteSheet.frameHeight;
    const sx = frame.x ?? 0;
    const sy = frame.y ?? 0;
    const sw = frame.w || fw;
    const sh = frame.h || fh;

    const cx = anchorX;
    const footY = anchorY;
    const stretchX = 1 + Math.min(0.03, Math.abs(p.vx) / 1800);
    const stretchY = 1 - Math.min(0.04, Math.abs(p.vx) / 1400);
    ctx.translate(cx, footY - bob);
    ctx.rotate(tilt);
    ctx.scale(faceTurnScale * stretchX, stretchY);

    // Robust front/back pose render for neutral/ArrowDown/ArrowUp.
    const noDirInput = !keys.left && !keys.right && !keys.up && !keys.down;
    const neutralFrontPose = !state.intro && noDirInput && p.onGround && playerAnim.name === 'idle';
    if ((!state.intro && keys.down && introCharacterReady) || (neutralFrontPose && introCharacterReady)) {
      const fit = Math.min((drawW * 0.9) / introCharacterImage.width, (drawH * 0.94) / introCharacterImage.height);
      const frontScale = 1.2;
      const dw = introCharacterImage.width * fit * frontScale;
      const dh = introCharacterImage.height * fit * frontScale;
      ctx.drawImage(
        introCharacterImage,
        -dw * playerSpriteOriginX,
        -dh + playerGroundSnapOffset + frontPoseExtraGroundOffset,
        dw,
        dh
      );
      ctx.restore();
      return;
    }
    if (!state.intro && keys.up && upPoseReady) {
      const fit = Math.min((drawW * 0.9) / upPoseImage.width, (drawH * 0.94) / upPoseImage.height);
      const backScale = 1.3;
      const dw = upPoseImage.width * fit * backScale;
      const dh = upPoseImage.height * fit * backScale;
      ctx.drawImage(
        upPoseImage,
        -dw * playerSpriteOriginX,
        -dh * playerSpriteOriginY,
        dw,
        dh
      );
      ctx.restore();
      return;
    }

    const renderImg = spriteSheet.image;
    const jumpTopPad = playerAnim.name === 'jump' ? 18 : 0;
    ctx.drawImage(
      renderImg,
      sx,
      sy,
      sw,
      sh,
      -drawW * playerSpriteOriginX,
      -drawH * playerSpriteOriginY - jumpTopPad,
      drawW,
      drawH + jumpTopPad
    );

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
  if (state.win) {
    drawWinHugScene();
    return;
  }

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

function drawWinHugScene() {
  const t = state.clearTimer;
  const fade = clamp((t - 0.15) / 0.45, 0, 1);
  const approach = clamp((t - 0.35) / 1.0, 0, 1);
  const hug = clamp((t - 1.25) / 0.65, 0, 1);

  ctx.fillStyle = `rgba(8, 24, 44, ${0.18 + fade * 0.58})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const centerX = WIDTH * 0.5;
  const baseY = HEIGHT * 0.73;
  const charW = 150;
  const charH = 210;
  const startGap = 360;
  const endGap = 112;
  const gap = startGap + (endGap - startGap) * approach;
  const bob = Math.sin(performance.now() * 0.008) * 4;
  const hugSway = Math.sin(performance.now() * 0.012) * (hug * 6);

  const leftX = centerX - gap * 0.5 - charW * 0.5 + hugSway;
  const rightX = centerX + gap * 0.5 - charW * 0.5 - hugSway;
  const charY = baseY - charH + bob;
  const inwardTilt = 0.08 + hug * 0.06;

  const drawFacing = (img, x, y, boxW, boxH, mirror, tilt) => {
    if (!img) return;
    const fit = Math.min(boxW / img.width, boxH / img.height);
    const dw = img.width * fit;
    const dh = img.height * fit;
    const px = x + (boxW - dw) * 0.5;
    const py = y + (boxH - dh);
    const cx = x + boxW * 0.5;
    const cy = y + boxH * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(mirror ? -1 : 1, 1);
    ctx.drawImage(img, px - cx, py - cy, dw, dh);
    ctx.restore();
  };

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(15, 36, 65, 0.35)';
  ctx.beginPath();
  ctx.ellipse(centerX, baseY + 4, 190 + hug * 35, 24 + hug * 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Keep chest text readable in clear scene.
  const mirrorCharacter = false;
  const mirrorLavy = false;
  if (introCharacterReady) {
    drawFacing(introCharacterImage, leftX, charY, charW, charH, mirrorCharacter, inwardTilt);
  }
  if (lavyImageReady) {
    drawFacing(lavyImage, rightX, charY, charW, charH, mirrorLavy, -inwardTilt);
  }

  if (hug > 0.05) {
    const heartY = charY - 22 - Math.sin(performance.now() * 0.01) * 4;
    const heartScale = 0.82 + hug * 0.55;
    ctx.save();
    ctx.translate(centerX, heartY);
    ctx.scale(heartScale, heartScale);
    ctx.fillStyle = '#ff5e8a';
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-26, -14, -58, 8, 0, 52);
    ctx.bezierCurveTo(58, 8, 26, -14, 0, 10);
    ctx.fill();
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(255,255,255,${0.75 + hug * 0.25})`;
  ctx.font = 'bold 52px Trebuchet MS';
  ctx.fillText('ステージクリア!', WIDTH * 0.5, HEIGHT * 0.24);

  ctx.font = 'bold 24px Trebuchet MS';
  ctx.fillStyle = '#e2f2ff';
  ctx.fillText(`コイン ${state.coins}枚を集めました!`, WIDTH * 0.5, HEIGHT * 0.31);
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

  if (introCharacterReady) {
    const fit = Math.min((pw * 0.95) / introCharacterImage.width, (ph * 0.98) / introCharacterImage.height);
    const dw = introCharacterImage.width * fit;
    const dh = introCharacterImage.height * fit;
    const dx = WIDTH / 2 - dw / 2;
    const dy = py + (ph - dh);
    ctx.drawImage(introCharacterImage, dx, dy, dw, dh);
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
  drawItems();
  drawSpikes();
  for (const enemy of enemies) drawEnemy(enemy);
  drawGoal();
  drawPlayer();
  drawOverlay();
}

function update(dt) {
  scheduleBgm();
  if (state.intro) {
    state.introTime += dt;
    return;
  }
  if (state.gameOver || state.win) {
    if (state.win) {
      state.clearTimer += dt;
      state.flagDrop = Math.min(goal.h - 52, state.clearTimer * 120);
    }
    updateCamera();
    return;
  }

  updatePlayer(dt);
  updatePlayerAnimation(dt);
  updateHazards();
  updateEnemies(dt);
  updateCoins();
  updateItems();
  updateGoal();
  updateTimer(dt);
  state.jumpBoostCooldown = Math.max(0, state.jumpBoostCooldown - dt);
  state.speedItemTimer = Math.max(0, state.speedItemTimer - dt);
  state.shieldTimer = Math.max(0, state.shieldTimer - dt);
  state.damageInvuln = Math.max(0, state.damageInvuln - dt);
  updateCamera();
}

window.addEventListener('keydown', (e) => {
  unlockAudioByGesture();
  ensureAudioReady();
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

  if (e.code === 'ArrowUp') {
    e.preventDefault();
    keys.up = true;
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    keys.down = true;
  }

  if (e.code === 'Space' || e.code === 'KeyW') {
    e.preventDefault();
    pressJump(now);
  }

  if (e.code === 'KeyR') resetGame();
});

window.addEventListener('keyup', (e) => {
  if (state.intro) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') releaseLeft();
  if (e.code === 'ArrowRight' || e.code === 'KeyD') releaseRight();
  if (e.code === 'ArrowUp') keys.up = false;
  if (e.code === 'ArrowDown') keys.down = false;
  if (e.code === 'Space' || e.code === 'KeyW') releaseJump();
});

canvas.addEventListener('pointerdown', () => {
  unlockAudioByGesture();
  ensureAudioReady();
  startGameFromIntro();
});

function beginTouchInput() {
  unlockAudioByGesture();
  ensureAudioReady();
  startGameFromIntro();
}

function bindTouchControl(button, onPress, onRelease) {
  if (!button) return;

  const press = (e) => {
    e.preventDefault();
    const wasIntro = state.intro;
    beginTouchInput();
    if (wasIntro || state.gameOver || state.win) return;
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

// Fallback unlock for browsers that require a direct page interaction.
window.addEventListener('pointerdown', unlockAudioByGesture, { passive: true });
window.addEventListener('touchstart', unlockAudioByGesture, { passive: true });
window.addEventListener('mousedown', unlockAudioByGesture, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.up = false;
    keys.down = false;
  }
  if (!document.hidden) {
    ensureAudioReady();
  }
});

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
  playBgmTrack('game');
}

resetGame();
requestAnimationFrame(loop);
