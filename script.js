'use strict';

(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

if (!ctx) {
document.body.innerHTML =
'<p style="color:white;text-align:center">Canvas unavailable.</p>';
return;
}

const W = 800;
const H = 600;

const C = {
green: '#8cff8c',
white: '#f2f5f4',
cyan: '#65e5ff',
yellow: '#ffe66d',
red: '#ff6d6d'
};

const keys = Object.create(null);

let state = 'title';
let score = 0;
let highScore = 0;
let lives = 3;
let wave = 1;

let player;
let aliens = [];
let shots = [];
let bombs = [];
let shields = [];
let particles = [];
let popups = [];
let stars = [];

let alienDir = 1;
let alienMoveClock = 0;
let bombClock = 0;
let shotClock = 0;
let gameClock = 0;
let ufo = null;
let ufoClock = 6;
let lastFrame = 0;

let soundEnabled = true;
let audio = null;

try {
highScore = Number(localStorage.getItem('si94HighScore') || 0);
} catch (e) {
highScore = 0;
}

/* =====================================================
AUTHENTIC-STYLE ALIEN PIXEL SPRITES
Each character represents one pixel.
# = lit pixel, . = empty pixel.
===================================================== */

const ALIEN_SPRITES = [
// Top row: squid
[
[
'....##....',
'..######..',
'.########.',
'###.##.###',
'##########',
'..##..##..',
'.##....##.',
'##......##'
],
[
'....##....',
'..######..',
'.########.',
'###.##.###',
'##########',
'...####...',
'..##..##..',
'.##....##.'
]
],

// Middle rows: crab
[
[
'...####...',
'.########.',
'##.####.##',
'##########',
'##.#..#.##',
'...####...',
'..##..##..',
'.##....##.'
],
[
'...####...',
'.########.',
'##.####.##',
'##########',
'##.#..#.##',
'..######..',
'.##.##.##.',
'##......##'
]
],

// Bottom rows: octopus
[
[
'...####...',
'.########.',
'##########',
'##.####.##',
'##########',
'..##..##..',
'.##.##.##.',
'##......##'
],
[
'...####...',
'.########.',
'##########',
'##.####.##',
'##########',
'.##.##.##.',
'##..##..##',
'..##..##..'
]
]
];

function drawAlien(a) {
const type = a.row === 0 ? 0 : a.row < 3 ? 1 : 2;
const sprite = ALIEN_SPRITES[type][a.frame];
const pixel = 3;

ctx.fillStyle =
type === 0 ? C.cyan :
type === 1 ? C.white :
C.green;

const spriteWidth = sprite[0].length * pixel;
const spriteHeight = sprite.length * pixel;

const offsetX = Math.round(a.x + (a.w - spriteWidth) / 2);
const offsetY = Math.round(a.y + (a.h - spriteHeight) / 2);

for (let r = 0; r < sprite.length; r++) {
for (let c = 0; c < sprite[r].length; c++) {
if (sprite[r][c] === '#') {
ctx.fillRect(
offsetX + c * pixel,
offsetY + r * pixel,
pixel,
pixel
);
}
}
}
}

/* AUDIO */

function startAudio() {
if (!soundEnabled) return;

try {
const AudioClass =
window.AudioContext || window.webkitAudioContext;

if (!AudioClass) return;
if (!audio) audio = new AudioClass();

if (audio.state === 'suspended') audio.resume();
} catch (e) {
audio = null;
}
}

function tone(freq, duration, type = 'square', volume = 0.035, endFreq = null) {
if (!soundEnabled) return;

startAudio();
if (!audio) return;

try {
const osc = audio.createOscillator();
const gain = audio.createGain();

osc.type = type;
osc.frequency.setValueAtTime(freq, audio.currentTime);

if (endFreq !== null) {
osc.frequency.exponentialRampToValueAtTime(
Math.max(1, endFreq),
audio.currentTime + duration
);
}

gain.gain.setValueAtTime(volume, audio.currentTime);
gain.gain.exponentialRampToValueAtTime(
0.001,
audio.currentTime + duration
);

osc.connect(gain);
gain.connect(audio.destination);

osc.start();
osc.stop(audio.currentTime + duration);
} catch (e) {}
}

function soundShoot() {
tone(700, 0.075, 'square', 0.018, 260);
}

function soundExplosion() {
tone(125, 0.19, 'sawtooth', 0.045, 42);
}

function soundDamage() {
tone(240, 0.35, 'square', 0.05, 65);
}

function soundUFO() {
tone(480, 0.12, 'square', 0.012, 680);
}

/* STARS */

function makeStars() {
stars = [];

for (let i = 0; i < 90; i++) {
stars.push({
x: Math.random() * W,
y: Math.random() * H,
size: Math.random() < 0.15 ? 2 : 1,
speed: 5 + Math.random() * 17,
phase: Math.random() * Math.PI * 2
});
}
}

function updateStars(dt) {
stars.forEach(s => {
s.y += s.speed * dt;

if (s.y > H) {
s.y = 0;
s.x = Math.random() * W;
}
});
}

function drawStars() {
stars.forEach(s => {
const pulse = 0.35 + 0.45 *
(0.5 + 0.5 * Math.sin(gameClock * 1.5 + s.phase));

ctx.globalAlpha = pulse;
ctx.fillStyle = '#a7cbb5';
ctx.fillRect(s.x, s.y, s.size, s.size);
});

ctx.globalAlpha = 1;
}

/* PLAYER */

function makePlayer() {
return {
x: W / 2,
y: H - 54,
speed: 390,
invulnerable: 0
};
}

function drawPlayer() {
if (
player.invulnerable > 0 &&
Math.floor(gameClock * 14) % 2 === 0
) return;

const x = Math.round(player.x);
const y = Math.round(player.y);

ctx.fillStyle = C.green;
ctx.fillRect(x - 4, y - 18, 8, 16);
ctx.fillRect(x - 13, y - 5, 26, 5);
ctx.fillRect(x - 18, y, 36, 5);
ctx.fillRect(x - 3, y - 24, 6, 7);
}

/* FORMATION */

function makeAliens() {
const list = [];

for (let r = 0; r < 5; r++) {
for (let c = 0; c < 11; c++) {
list.push({
x: 125 + c * 50,
y: 105 + r * 42,
w: 30,
h: 24,
row: r,
alive: true,
frame: 0
});
}
}

return list;
}

/* SHIELDS */

function makeShields() {
return [155, 315, 475, 635].map(x => ({
x,
y: 455,
cells: Array.from({ length: 40 }, () => 1)
}));
}

function drawShields() {
shields.forEach(s => {
ctx.fillStyle = C.green;

s.cells.forEach((on, i) => {
if (!on) return;

const c = i % 8;
const r = Math.floor(i / 8);

if (
(r === 0 && (c === 0 || c === 7)) ||
(r === 1 && c === 0) ||
(r >= 3 && c >= 3 && c <= 4)
) return;

ctx.fillRect(s.x + c * 5, s.y + r * 5, 5, 5);
});
});
}

function shieldHit(x, y) {
for (const s of shields) {
if (
x < s.x || x >= s.x + 40 ||
y < s.y || y >= s.y + 25
) continue;

const c = Math.floor((x - s.x) / 5);
const r = Math.floor((y - s.y) / 5);
const idx = r * 8 + c;

if (s.cells[idx]) {
s.cells[idx] = 0;
return true;
}
}

return false;
}

/* EFFECTS AND SCORING */

function burst(x, y, color, count) {
for (let i = 0; i < count; i++) {
particles.push({
x,
y,
vx: (Math.random() - 0.5) * 150,
vy: (Math.random() - 0.5) * 150,
t: 0.35 + Math.random() * 0.25,
color
});
}
}

function addScore(n, x, y) {
score += n;

popups.push({
text: String(n),
x,
y,
t: 0.65
});

if (score > highScore) {
highScore = score;

try {
localStorage.setItem('si94HighScore', String(highScore));
} catch (e) {}
}
}

/* UFO */

function drawUFO() {
if (!ufo) return;

ctx.fillStyle = C.red;
ctx.fillRect(ufo.x + 10, ufo.y, 25, 5);
ctx.fillRect(ufo.x + 3, ufo.y + 5, 40, 7);
ctx.fillRect(ufo.x, ufo.y + 12, 46, 5);

ctx.fillStyle = C.white;
ctx.fillRect(ufo.x + 10, ufo.y + 10, 4, 3);
ctx.fillRect(ufo.x + 22, ufo.y + 10, 4, 3);
ctx.fillRect(ufo.x + 34, ufo.y + 10, 4, 3);
}

/* GAME RESET */

function resetGame() {
score = 0;
lives = 3;
wave = 1;

player = makePlayer();
aliens = makeAliens();
shots = [];
bombs = [];
shields = makeShields();
particles = [];
popups = [];

alienDir = 1;
alienMoveClock = 0;
bombClock = 0;
shotClock = 0;

ufo = null;
ufoClock = 6;

state = 'playing';
startAudio();
}

function nextWave() {
wave++;
aliens = makeAliens();
shields = makeShields();
shots = [];
bombs = [];

alienDir = 1;
alienMoveClock = 0;
player.invulnerable = 1.4;

state = 'playing';
}

/* INPUT */

function keyDown(e) {
const k = e.key;

if (
['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown']
.includes(k)
) e.preventDefault();

keys[k] = true;
keys[k.toLowerCase()] = true;

if (k === 'm' || k === 'M') {
soundEnabled = !soundEnabled;
if (soundEnabled) {
startAudio();
tone(650, 0.09, 'square', 0.025);
}
}

if (k === 'Enter' && (state === 'title' || state === 'gameOver')) {
resetGame();
}

if (k === 'Enter' && state === 'waveClear') {
nextWave();
}

if (k === 'Escape' && state === 'playing') {
state = 'paused';
} else if (k === 'Escape' && state === 'paused') {
state = 'playing';
}
}

function keyUp(e) {
keys[e.key] = false;
keys[e.key.toLowerCase()] = false;
}

window.addEventListener('keydown', keyDown);
window.addEventListener('keyup', keyUp);

window.addEventListener('blur', () => {
Object.keys(keys).forEach(k => {
keys[k] = false;
});
});

/* SHOOTING AND BOMBS */

function fire() {
if (shotClock > 0) return;

shots.push({
x: player.x,
y: player.y - 17,
speed: 560,
alive: true
});

shotClock = 0.19;
soundShoot();
}

function dropBomb() {
const live = aliens.filter(a => a.alive);
if (!live.length) return;

const shooter = live[Math.floor(Math.random() * live.length)];

bombs.push({
x: shooter.x + shooter.w / 2,
y: shooter.y + shooter.h,
speed: 170 + wave * 12,
sway: Math.random() < 0.22
? (Math.random() < 0.5 ? -30 : 30)
: 0,
alive: true
});
}

/* ALIEN MOVEMENT */

function alienMove(dt) {
const live = aliens.filter(a => a.alive);

if (!live.length) {
state = 'waveClear';
return;
}

const left = Math.min(...live.map(a => a.x));
const right = Math.max(...live.map(a => a.x + a.w));
const speed = 38 + (55 - live.length) * 1.2 + wave * 4;

const nextLeft = left + alienDir * speed * dt;
const nextRight = right + alienDir * speed * dt;

if (
(alienDir > 0 && nextRight > W - 38) ||
(alienDir < 0 && nextLeft < 38)
) {
alienDir *= -1;
live.forEach(a => a.y += 15);
} else {
live.forEach(a => a.x += alienDir * speed * dt);
}

const lowest = Math.max(...live.map(a => a.y + a.h));

if (lowest > player.y - 27) {
state = 'gameOver';
}
}

function hitAlien(b) {
for (const a of aliens) {
if (!a.alive) continue;

if (
b.x >= a.x && b.x <= a.x + a.w &&
b.y >= a.y && b.y <= a.y + a.h
) {
a.alive = false;

const points = a.row === 0 ? 30 : a.row < 3 ? 20 : 10;

addScore(points, b.x, b.y);
burst(b.x, b.y, C.green, 7);
soundExplosion();

return true;
}
}

return false;
}

function loseLife() {
if (player.invulnerable > 0 || state !== 'playing') return;

lives--;
player.invulnerable = 1.2;

burst(player.x, player.y, C.white, 14);
soundDamage();

if (lives <= 0) state = 'gameOver';
}

/* UPDATE */

function update(dt) {
gameClock += dt;
updateStars(dt);

if (state !== 'playing') return;

if (keys.ArrowLeft || keys.a || keys.A) {
player.x -= player.speed * dt;
}

if (keys.ArrowRight || keys.d || keys.D) {
player.x += player.speed * dt;
}

player.x = Math.max(35, Math.min(W - 35, player.x));

if (keys.Space || keys[' ']) fire();

shotClock = Math.max(0, shotClock - dt);
player.invulnerable = Math.max(0, player.invulnerable - dt);

alienMoveClock += dt;

const aliveCount = aliens.filter(a => a.alive).length;
const moveInterval = Math.max(
0.055,
0.55 - (55 - aliveCount) * 0.008 - wave * 0.015
);

if (alienMoveClock >= moveInterval) {
alienMoveClock = 0;

// All invaders switch frames together.
aliens.forEach(a => {
if (a.alive) a.frame = 1 - a.frame;
});
}

alienMove(dt);

bombClock += dt;

if (bombClock > Math.max(0.45, 1.65 - wave * 0.1)) {
bombClock = 0;
dropBomb();

if (Math.random() < 0.28) dropBomb();
}

ufoClock -= dt;

if (!ufo && ufoClock <= 0) {
ufo = {
x: -45,
y: 56,
speed: 125 + Math.random() * 35
};

ufoClock = 12 + Math.random() * 10;
tone(480, 0.12, 'square', 0.012, 680);
}

if (ufo) {
ufo.x += ufo.speed * dt;
if (ufo.x > W + 50) ufo = null;
}

shots.forEach(b => {
if (!b.alive) return;

b.y -= b.speed * dt;

if (b.y < 15) {
b.alive = false;
return;
}

if (shieldHit(b.x, b.y)) {
b.alive = false;
return;
}

if (hitAlien(b)) {
b.alive = false;
return;
}

if (
ufo &&
b.y > ufo.y - 10 && b.y < ufo.y + 20 &&
b.x > ufo.x - 5 && b.x < ufo.x + 48
) {
const bonus = [50, 100, 150, 300][
Math.floor(Math.random() * 4)
];

addScore(bonus, ufo.x + 20, ufo.y);
burst(ufo.x + 20, ufo.y, C.cyan, 10);
soundExplosion();

ufo = null;
b.alive = false;
}
});

shots = shots.filter(b => b.alive);

bombs.forEach(b => {
if (!b.alive) return;

b.y += b.speed * dt;
b.x += b.sway * dt;

if (b.y > H) {
b.alive = false;
return;
}

if (shieldHit(b.x, b.y)) {
b.alive = false;
return;
}

if (
b.y > player.y - 13 && b.y < player.y + 10 &&
Math.abs(b.x - player.x) < 17
) {
b.alive = false;
loseLife();
}
});

bombs = bombs.filter(b => b.alive);

particles.forEach(p => {
p.x += p.vx * dt;
p.y += p.vy * dt;
p.t -= dt;
});

particles = particles.filter(p => p.t > 0);

popups.forEach(p => {
p.y -= 22 * dt;
p.t -= dt;
});

popups = popups.filter(p => p.t > 0);
}

/* HUD AND SCENE */

function drawHUD() {
ctx.fillStyle = C.white;
ctx.font = '18px monospace';
ctx.textAlign = 'left';
ctx.fillText('SCORE ' + String(score).padStart(5, '0'), 28, 31);

ctx.textAlign = 'center';
ctx.fillText('HI ' + String(highScore).padStart(5, '0'), W / 2, 31);

ctx.textAlign = 'right';
ctx.fillText('LIVES ' + lives, W - 28, 31);

ctx.fillStyle = C.green;
ctx.fillRect(24, 43, W - 48, 1);

ctx.textAlign = 'left';
ctx.fillText('WAVE ' + wave, 28, 70);
}

function drawGame() {
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, W, H);

drawStars();
drawHUD();
drawShields();

aliens.forEach(a => {
if (a.alive) drawAlien(a);
});

shots.forEach(b => {
ctx.fillStyle = C.white;
ctx.fillRect(b.x - 1, b.y - 7, 2, 9);
});

bombs.forEach(b => {
ctx.fillStyle = C.red;
ctx.fillRect(b.x - 2, b.y - 5, 4, 9);
});

drawUFO();
drawPlayer();

particles.forEach(p => {
ctx.fillStyle = p.color;
ctx.fillRect(p.x, p.y, 3, 3);
});

popups.forEach(p => {
ctx.fillStyle = C.yellow;
ctx.font = '13px monospace';
ctx.textAlign = 'center';
ctx.fillText(p.text, p.x, p.y);
});
}

/* TITLE SCREEN */

function drawTitle() {
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, W, H);

drawStars();

ctx.textAlign = 'center';
ctx.fillStyle = C.green;
ctx.font = 'bold 48px monospace';
ctx.fillText('SPACE INVADERS', W / 2, 170);

ctx.font = '20px monospace';
ctx.fillStyle = C.white;
ctx.fillText('ARCADE EDITION 11.0', W / 2, 215);

const demo = [
{ x: W / 2 - 15, y: 278, w: 30, h: 24, row: 0, frame: Math.floor(gameClock * 2) % 2 },
{ x: W / 2 - 15, y: 330, w: 30, h: 24, row: 2, frame: Math.floor(gameClock * 2) % 2 },
{ x: W / 2 - 15, y: 382, w: 30, h: 24, row: 4, frame: Math.floor(gameClock * 2) % 2 }
];

demo.forEach(drawAlien);

ctx.fillStyle = C.yellow;
ctx.font = '22px monospace';
ctx.fillText('PRESS ENTER TO START', W / 2, 470);

ctx.fillStyle = '#89948d';
ctx.font = '15px monospace';
ctx.fillText('← → MOVE SPACE FIRE', W / 2, 515);
ctx.fillText('M TOGGLE SOUND', W / 2, 540);
ctx.fillText('HIGH SCORE ' + highScore, W / 2, 565);
}

/* OVERLAYS */

function drawOverlay(title, subtitle) {
drawGame();

ctx.fillStyle = 'rgba(0,0,0,0.76)';
ctx.fillRect(0, 0, W, H);

ctx.textAlign = 'center';
ctx.fillStyle = C.yellow;
ctx.font = 'bold 42px monospace';
ctx.fillText(title, W / 2, H / 2 - 18);

ctx.fillStyle = C.white;
ctx.font = '20px monospace';
ctx.fillText(subtitle, W / 2, H / 2 + 30);
}

/* MAIN LOOP */

function frame(ts) {
const dt = Math.min(0.033, (ts - lastFrame) / 1000 || 0);
lastFrame = ts;

update(dt);

if (state === 'title') {
drawTitle();
} else if (state === 'playing') {
drawGame();
} else if (state === 'paused') {
drawOverlay('PAUSED', 'PRESS ESC TO RESUME');
} else if (state === 'waveClear') {
drawOverlay('WAVE CLEAR', 'PRESS ENTER FOR NEXT WAVE');
} else {
drawOverlay('GAME OVER', 'PRESS ENTER TO RESTART');
}

requestAnimationFrame(frame);
}

/* INITIALIZE */

makeStars();
player = makePlayer();
aliens = makeAliens();
shields = makeShields();

requestAnimationFrame(frame);
})();
