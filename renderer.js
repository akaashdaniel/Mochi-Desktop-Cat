const { ipcRenderer } = require('electron');

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// ─────────────────────────────────────
// ALL ANIMATIONS — now using every sprite you have
// ─────────────────────────────────────
const ANIMS = {
  idle:      { frames: ['sprites/orangecat-idle1.png','sprites/orangecat-idle2.png','sprites/orangecat-idle3.png','sprites/orangecat-idle4.png','sprites/orangecat-idle5.png'], fps: 5,  loop: true  },
  blink:     { frames: ['sprites/orangecat-blink1.png','sprites/orangecat-blink2.png','sprites/orangecat-blink3.png','sprites/orangecat-blink4.png','sprites/orangecat-blink5.png'], fps: 12, loop: false },
  eartwitch: { frames: ['sprites/orangecat-eartwitch1.png','sprites/orangecat-eartwitch2.png','sprites/orangecat-eartwitch1.png'], fps: 8, loop: false },
  tailflick: { frames: ['sprites/orangecat-tailflick1.png','sprites/orangecat-tailflick2.png','sprites/orangecat-tailflick3.png','sprites/orangecat-tailflick4.png'], fps: 8, loop: false },
  lookleft:  { frames: ['sprites/orangecat-lookleft1.png','sprites/orangecat-lookleft2.png'], fps: 6, loop: false },
  lookright: { frames: ['sprites/orangecat-lookright1.png','sprites/orangecat-lookright2.png'], fps: 6, loop: false },
  yawn:      { frames: ['sprites/orangecat-yawn1.png','sprites/orangecat-yawn2.png','sprites/orangecat-yawn3.png','sprites/orangecat-yawn4.png','sprites/orangecat-yawn5.png'], fps: 4, loop: false },
  stretch:   { frames: ['sprites/orangecat-stretch1.png','sprites/orangecat-stretch2.png','sprites/orangecat-stretch3.png','sprites/orangecat-stretch4.png'], fps: 4, loop: false },
  walk:      { frames: ['sprites/orangecat-walk1.png','sprites/orangecat-walk2.png','sprites/orangecat-walk3.png','sprites/orangecat-walk4.png'], fps: 10, loop: true  },
  sleep:     { frames: ['sprites/orangecat-sleep1.png','sprites/orangecat-sleep2.png'], fps: 0.8, loop: true  },
  typing:    { frames: ['sprites/orangecat-typing1.png','sprites/orangecat-typing2.png'], fps: 6,  loop: true  },
  groom:     { frames: ['sprites/orangecat-groom1.png','sprites/orangecat-groom2.png'], fps: 4,  loop: false },
  hunt:      { frames: ['sprites/orangecat-hunt1.png','sprites/orangecat-hunt2.png','sprites/orangecat-hunt3.png'], fps: 8,  loop: true  },
};

// Eye positions per state
const EYE_POS = {
  idle:      [{ x: 48, y: 38 }, { x: 66, y: 38 }],
  blink:     [],   // blink frames have eyes built into sprite
  eartwitch: [{ x: 48, y: 38 }, { x: 66, y: 38 }],
  tailflick: [{ x: 48, y: 38 }, { x: 66, y: 38 }],
  lookleft:  [],   // look direction built into sprite
  lookright: [],
  yawn:      [{ x: 48, y: 38 }, { x: 66, y: 38 }],
  stretch:   [{ x: 48, y: 48 }, { x: 66, y: 48 }],
  walk:      [{ x: 46, y: 52 }, { x: 62, y: 52 }],
  sleep:     [],
  typing:    [{ x: 52, y: 72 }, { x: 68, y: 72 }],
  groom:     [{ x: 48, y: 38 }, { x: 66, y: 38 }],
  hunt:      [{ x: 46, y: 55 }, { x: 62, y: 55 }],
};

// Preload all sprites
const cache = {};
Object.values(ANIMS).forEach(a =>
  a.frames.forEach(src => {
    if (cache[src]) return;
    const img = new Image();
    img.src = src;
    cache[src] = img;
  })
);

// ─────────────────────────────────────
// MOCHI'S BRAIN
// ─────────────────────────────────────
const Mochi = {
  cursor:       { x: 0, y: 0 },
  cursorDist:   999,
  cursorMoving: false,
  _lastCursor:  { x: 0, y: 0 },
  isTyping:     false,

  energy:    100,
  attention: 0,
  mood:      'curious',

  state:      'idle',
  _locked:    false,

  breathe:   { phase: 0 },
  behaviorTimer:    0,
  behaviorCooldown: rand(6000, 15000),

  observe(delta, cursor, typing) {
    this.cursor = cursor;
    this.isTyping = typing;
    const dx = cursor.x - this._lastCursor.x;
    const dy = cursor.y - this._lastCursor.y;
    this.cursorMoving = Math.abs(dx) + Math.abs(dy) > 2;
    this._lastCursor = { ...cursor };
    this.cursorDist = Math.sqrt(cursor.x**2 + cursor.y**2);
  },

  decide(delta) {
    // Update energy
    this.energy += this.state === 'sleep'
      ? delta * 0.004
      : -delta * 0.0008;
    this.energy = Math.max(0, Math.min(100, this.energy));

    // Update attention
    this.attention += this.cursorDist < 150
      ? delta * 0.04
      : -delta * 0.015;
    this.attention = Math.max(0, Math.min(100, this.attention));

    // Mood
    if (this.energy < 25)         this.mood = 'sleepy';
    else if (this.attention > 70) this.mood = 'happy';
    else if (this.energy > 75)    this.mood = 'curious';
    else                          this.mood = 'relaxed';

    if (this._locked) return;

    // Priority decisions
    if (this.isTyping) { this.state = 'typing'; return; }
    if (this.mood === 'sleepy') { this.state = 'sleep'; return; }

    // Cursor very close + moving = hunt
    if (this.cursorDist < 60 && this.cursorMoving) {
      this.state = 'hunt'; return;
    }

    // Cursor to the left → look left
    if (this.cursor.x < -80 && !this.cursorMoving) {
      this.playOnce('lookleft', 1200); return;
    }

    // Cursor to the right → look right
    if (this.cursor.x > 80 && !this.cursorMoving) {
      this.playOnce('lookright', 1200); return;
    }

    // Random behavior scheduler
    this.behaviorTimer += delta;
    if (this.behaviorTimer >= this.behaviorCooldown) {
      this.behaviorTimer = 0;
      this.behaviorCooldown = rand(6000, 20000);
      this.pickRandomBehavior();
      return;
    }

    if (!['idle','hunt','walk'].includes(this.state)) {
      this.state = 'idle';
    }
  },

  pickRandomBehavior() {
    // Weight behaviors by mood
    const options = {
      curious:  ['blink','eartwitch','tailflick','lookleft','lookright'],
      happy:    ['blink','tailflick','stretch'],
      relaxed:  ['blink','yawn','groom','tailflick'],
      sleepy:   ['yawn','blink'],
    };
    const pool = options[this.mood] || options.curious;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const durations = {
      blink: 500, eartwitch: 600, tailflick: 700,
      lookleft: 1200, lookright: 1200,
      yawn: 2000, stretch: 2500, groom: 2000,
    };
    this.playOnce(pick, durations[pick] || 1000);
  },

  playOnce(anim, duration) {
    if (!ANIMS[anim]) return;
    this._locked = true;
    this.state = anim;
    setTimeout(() => {
      this._locked = false;
      this.state = 'idle';
    }, duration);
  },

  updateMicro(delta) {
    this.breathe.phase += delta * 0.0015;
  }
};

// ─────────────────────────────────────
// ANIMATION ENGINE
// ─────────────────────────────────────
let frameIndex = 0;
let frameTimer = 0;
let lastAnimState = '';
let lastTime = 0;
let scaleX = 1, scaleY = 1, velX = 0, velY = 0;

// Drag
let isDragging = false;
let dragStartMouseX = 0, dragStartMouseY = 0;
let dragStartWinX = 0, dragStartWinY = 0;

// IPC values
let cursorRel = { x: 0, y: 0 };
let isTyping = false;

function loop(ts) {
  const delta = Math.min(ts - lastTime, 50);
  lastTime = ts;

  Mochi.observe(delta, cursorRel, isTyping);
  Mochi.decide(delta);
  Mochi.updateMicro(delta);

  // Advance frames
  const anim = ANIMS[Mochi.state] || ANIMS.idle;
  if (Mochi.state !== lastAnimState) {
    frameIndex = 0;
    frameTimer = 0;
    lastAnimState = Mochi.state;
  }
  frameTimer += delta;
  if (frameTimer >= 1000 / anim.fps) {
    frameTimer = 0;
    frameIndex = (frameIndex + 1) % anim.frames.length;
  }

  // Jiggle spring
  velX += (1 - scaleX) * 0.3;
  velY += (1 - scaleY) * 0.3;
  velX *= 0.6;
  velY *= 0.6;
  scaleX += velX;
  scaleY += velY;

  const breathe = 1 + Math.sin(Mochi.breathe.phase) * 0.012;

  ctx.clearRect(0, 0, W, H);

  // Sprite
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(scaleX * breathe, scaleY / breathe);
  ctx.translate(-W/2, -H/2);
  ctx.imageSmoothingEnabled = false;
  const src = anim.frames[frameIndex] || anim.frames[0];
  const img = cache[src];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, W, H);
  }
  ctx.restore();

  // Eye overlay (only on states that need it)
  const eyes = EYE_POS[Mochi.state];
  if (eyes && eyes.length) drawEyes(eyes);

  requestAnimationFrame(loop);
}

// ─────────────────────────────────────
// DRAW EYES
// ─────────────────────────────────────
function drawEyes(eyes) {
  eyes.forEach(eye => {
    const dx = Mochi.cursor.x;
    const dy = Mochi.cursor.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const ratio = Math.min(dist, 120) / 120;
    const px = (dx / dist) * 2.5 * ratio;
    const py = (dy / dist) * 2.5 * ratio;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(eye.x + px, eye.y + py, 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(eye.x + px + 1, eye.y + py - 1.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─────────────────────────────────────
// DRAG
// ─────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragStartMouseX = e.screenX;
  dragStartMouseY = e.screenY;
  ipcRenderer.send('get-win-pos');
  scaleX = 1.3; scaleY = 0.7;
  velX = 0; velY = 0;
  ipcRenderer.send('set-clickthrough', false);
});

ipcRenderer.on('win-pos', (_, { x, y }) => {
  dragStartWinX = x;
  dragStartWinY = y;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  ipcRenderer.send('move-win', {
    x: dragStartWinX + (e.screenX - dragStartMouseX),
    y: dragStartWinY + (e.screenY - dragStartMouseY)
  });
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  scaleX = 0.7; scaleY = 1.35;
  velX = 0; velY = 0;
  setTimeout(() => ipcRenderer.send('set-clickthrough', true), 400);
});

// ─────────────────────────────────────
// IPC
// ─────────────────────────────────────
ipcRenderer.on('cat-state', (_, s) => {
  if (s === 'typing')     isTyping = true;
  else if (s === 'idle')  isTyping = false;
  else if (s === 'sleep') { isTyping = false; Mochi.energy = 0; }
});

ipcRenderer.on('cursor-pos', (_, pos) => {
  cursorRel = pos;
});

function rand(min, max) { return min + Math.random() * (max - min); }

ipcRenderer.send('set-clickthrough', true);
requestAnimationFrame(loop);