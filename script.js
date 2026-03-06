const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 10;
const ROWS = 20;

const RESERVED = 40;
const maxBlockH = Math.floor((window.innerHeight - RESERVED) / ROWS);
const maxBlockW = Math.floor(window.innerWidth / COLS);
const blockSize = Math.min(maxBlockH, maxBlockW);

canvas.width  = COLS * blockSize;
canvas.height = ROWS * blockSize;

let score = 0;
const DROP_INTERVAL = 500;
let lastDropTime = 0;
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const tetrominoes = [
  { shape: [[1,1,1],[0,1,0]], color: "#aa00ff" },
  { shape: [[1,1],[1,1]],     color: "#ffee00" },
  { shape: [[1,1,0],[0,1,1]], color: "#00ff88" },
  { shape: [[0,1,1],[1,1,0]], color: "#ff3355" },
  { shape: [[1,0,0],[1,1,1]], color: "#ff8800" },
  { shape: [[0,0,1],[1,1,1]], color: "#0088ff" },
  { shape: [[1,1,1,1]],       color: "#00eeff" }
];

let currentTetromino, currentColor, currentX, currentY;

// ══════════════════════════════════════════════════════════
//  GAMEBOY 4-CHANNEL AUDIO ENGINE
//  CH1: Square wave melody (lead)        → oscillator type 'square'
//  CH2: Square wave harmony (counter)    → oscillator type 'square', duty 25%
//  CH3: Wave channel bass line           → oscillator type 'sawtooth' (approx)
//  CH4: Noise channel (percussion)       → AudioWorklet or buffer noise
// ══════════════════════════════════════════════════════════

let audioCtx = null;
let musicPlaying = false;
let schedTimer = null;

// Tempo: original GB Tetris ~160 BPM, quarter note
const BPM = 160;
const Q = 60 / BPM;   // quarter note duration in seconds
const LOOK = 0.15;     // lookahead window
const TICK = 50;       // scheduler interval ms

// ── Note frequency table ──────────────────────────────────
function midiToHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
const _ = 0; // rest

// MIDI note numbers for Tetris Theme A (Game Boy version, key of A minor)
// Based on the original GB cartridge transcription
//
// Format: each entry = [midi_note, duration_in_16ths]
// 16th note = Q/4 seconds

// CH1 — Lead melody (Square 1, 50% duty)
const CH1 = [
  // ── Section A ─────────────────────────────────
  [76,4],[71,2],[72,2],[74,4],[72,2],[71,2],   // E5 B4 C5 D5 C5 B4
  [69,4],[69,2],[72,2],[76,4],[74,2],[72,2],   // A4 A4 C5 E5 D5 C5
  [71,4],[71,2],[72,2],[74,4],[76,4],           // B4 B4 C5 D5 E5
  [72,4],[69,4],[69,8],                         // C5 A4 A4(half)
  // ── Section A' ────────────────────────────────
  [74,4],[74,2],[77,2],[81,4],[79,2],[77,2],   // D5 D5 F5 A5 G5 F5
  [76,4],[72,2],[76,2],[79,4],[77,2],[76,2],   // E5 C5 E5 G5 F5 E5
  [72,4],[72,2],[74,2],[71,4],[76,4],           // C5 C5 D5 B4 E5
  [72,4],[69,4],[69,8],                         // C5 A4 A4(half)
  // ── Section B ─────────────────────────────────
  [76,4],[71,2],[72,2],[74,4],[72,2],[71,2],
  [69,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [71,4],[71,2],[72,2],[74,4],[76,4],
  [72,4],[69,4],[69,8],
  // ── Section B' ────────────────────────────────
  [74,4],[74,2],[77,2],[81,4],[79,2],[77,2],
  [76,4],[72,2],[76,2],[79,4],[77,2],[76,2],
  [72,4],[72,2],[74,2],[71,4],[76,4],
  [72,4],[69,4],[69,8],
];

// CH2 — Counter-melody / harmony (Square 2, 25% duty, one octave lower + harmonies)
const CH2 = [
  // Section A
  [64,4],[59,2],[60,2],[62,4],[60,2],[59,2],
  [57,4],[57,2],[60,2],[64,4],[62,2],[60,2],
  [59,4],[59,2],[60,2],[62,4],[64,4],
  [60,4],[57,4],[57,8],
  // Section A'
  [62,4],[62,2],[65,2],[69,4],[67,2],[65,2],
  [64,4],[60,2],[64,2],[67,4],[65,2],[64,2],
  [60,4],[60,2],[62,2],[59,4],[64,4],
  [60,4],[57,4],[57,8],
  // Section B
  [64,4],[59,2],[60,2],[62,4],[60,2],[59,2],
  [57,4],[57,2],[60,2],[64,4],[62,2],[60,2],
  [59,4],[59,2],[60,2],[62,4],[64,4],
  [60,4],[57,4],[57,8],
  // Section B'
  [62,4],[62,2],[65,2],[69,4],[67,2],[65,2],
  [64,4],[60,2],[64,2],[67,4],[65,2],[64,2],
  [60,4],[60,2],[62,2],[59,4],[64,4],
  [60,4],[57,4],[57,8],
];

// CH3 — Wave channel bass (approx. with sawtooth/triangle, 2 octaves below melody)
// Plays on beats (quarter notes), arpeggio style
const CH3 = [
  // Section A  (Am - Am - C - G - Am - Am - E - Am pattern)
  [45,2],[45,2],[45,2],[45,2],  // Am
  [47,2],[47,2],[47,2],[47,2],  // B
  [48,2],[48,2],[48,2],[48,2],  // C
  [47,2],[47,2],[47,2],[47,2],  // B
  [45,2],[45,2],[45,2],[45,2],  // Am
  [45,2],[45,2],[45,2],[45,2],
  [40,2],[40,2],[40,2],[40,2],  // E
  [45,2],[45,2],[45,2],[45,2],  // Am (hold 2)
  [45,2],[45,2],[45,2],[45,2],
  // Section A'
  [47,2],[47,2],[47,2],[47,2],
  [53,2],[53,2],[53,2],[53,2],
  [52,2],[52,2],[52,2],[52,2],
  [47,2],[47,2],[47,2],[47,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
  [40,2],[40,2],[40,2],[40,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
  // Section B (repeat A bass)
  [45,2],[45,2],[45,2],[45,2],
  [47,2],[47,2],[47,2],[47,2],
  [48,2],[48,2],[48,2],[48,2],
  [47,2],[47,2],[47,2],[47,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
  [40,2],[40,2],[40,2],[40,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
  // Section B' bass
  [47,2],[47,2],[47,2],[47,2],
  [53,2],[53,2],[53,2],[53,2],
  [52,2],[52,2],[52,2],[52,2],
  [47,2],[47,2],[47,2],[47,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
  [40,2],[40,2],[40,2],[40,2],
  [45,2],[45,2],[45,2],[45,2],
  [45,2],[45,2],[45,2],[45,2],
];

// CH4 — Noise / percussion: hi-hat on every 8th, snare on beats 2&4
// Encoded as [type, duration_16ths]:  type 0=none, 1=hihat, 2=snare
const CH4 = [];
// Build 4 sections × 32 beats of 16ths = 4 × 128 16th notes
for (let section = 0; section < 4; section++) {
  for (let beat = 0; beat < 32; beat++) {
    // 4 16th notes per beat
    for (let sub = 0; sub < 4; sub++) {
      if (sub === 0) {
        if (beat % 4 === 1 || beat % 4 === 3) {
          CH4.push([2, 1]); // snare on beat 2 & 4
        } else {
          CH4.push([1, 1]); // hihat on beat 1 & 3
        }
      } else {
        CH4.push([1, 1]); // hihat on every 16th subdivision
      }
    }
  }
}

// ── Playback state ────────────────────────────────────────
let idx1 = 0, idx2 = 0, idx3 = 0, idx4 = 0;
let t1 = 0, t2 = 0, t3 = 0, t4 = 0;

// ── Create noise buffer ───────────────────────────────────
function makeNoiseBuffer(ac) {
  const bufLen = ac.sampleRate * 0.05;
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

let noiseBuffer = null;

function scheduleOsc(ac, freq, start, dur, type, vol, detune = 0) {
  if (!freq) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.008);
  gain.gain.setValueAtTime(vol, start + dur - 0.015);
  gain.gain.linearRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.01);
}

function scheduleNoise(ac, start, dur, isSnare) {
  if (!noiseBuffer) noiseBuffer = makeNoiseBuffer(ac);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const gain = ac.createGain();
  const vol = isSnare ? 0.06 : 0.025;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.8);
  // For snare add a tiny pitched component
  if (isSnare) {
    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.frequency.value = 180;
    osc.type = 'triangle';
    og.gain.setValueAtTime(0.04, start);
    og.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    osc.connect(og);
    og.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.06);
  }
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(start);
  src.stop(start + dur);
}

function scheduler() {
  const now = audioCtx.currentTime;
  const end = now + LOOK;
  const s16 = Q / 4; // 16th note duration

  // CH1 — lead melody
  while (t1 < end) {
    const [note, dur16] = CH1[idx1 % CH1.length];
    const d = dur16 * s16;
    scheduleOsc(audioCtx, note ? midiToHz(note) : 0, t1, d * 0.88, 'square', 0.10);
    t1 += d;
    idx1++;
  }

  // CH2 — harmony (quieter, slight detune for warmth)
  while (t2 < end) {
    const [note, dur16] = CH2[idx2 % CH2.length];
    const d = dur16 * s16;
    scheduleOsc(audioCtx, note ? midiToHz(note) : 0, t2, d * 0.85, 'square', 0.055, 8);
    t2 += d;
    idx2++;
  }

  // CH3 — bass (triangle approximates GB wave channel)
  while (t3 < end) {
    const [note, dur16] = CH3[idx3 % CH3.length];
    const d = dur16 * s16;
    scheduleOsc(audioCtx, note ? midiToHz(note) : 0, t3, d * 0.75, 'triangle', 0.13);
    t3 += d;
    idx3++;
  }

  // CH4 — noise / percussion
  while (t4 < end) {
    const [type, dur16] = CH4[idx4 % CH4.length];
    const d = dur16 * s16;
    if (type === 1) scheduleNoise(audioCtx, t4, d * 0.5, false);
    if (type === 2) scheduleNoise(audioCtx, t4, d * 0.9, true);
    t4 += d;
    idx4++;
  }

  schedTimer = setTimeout(scheduler, TICK);
}

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuffer = makeNoiseBuffer(audioCtx);
  const kickoff = () => {
    const now = audioCtx.currentTime + 0.08;
    t1 = t2 = t3 = t4 = now;
    idx1 = idx2 = idx3 = idx4 = 0;
    scheduler();
  };
  audioCtx.state === 'suspended' ? audioCtx.resume().then(kickoff) : kickoff();
}

// ── DRAWING ───────────────────────────────────────────────
function drawBlock(c, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, blockSize - 1);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, 4);
    ctx.fillRect(c * blockSize, r * blockSize, 4, blockSize - 1);
}
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            if (board[r][c]) drawBlock(c, r, board[r][c]);
}
function drawTetromino() {
    for (let r = 0; r < currentTetromino.length; r++)
        for (let c = 0; c < currentTetromino[r].length; c++)
            if (currentTetromino[r][c]) drawBlock(currentX + c, currentY + r, currentColor);
}
function isMoveValid(nx, ny, t) {
    for (let r = 0; r < t.length; r++)
        for (let c = 0; c < t[r].length; c++)
            if (t[r][c]) {
                let x = nx + c, y = ny + r;
                if (x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x]) return false;
            }
    return true;
}
function placeTetromino() {
    for (let r = 0; r < currentTetromino.length; r++)
        for (let c = 0; c < currentTetromino[r].length; c++)
            if (currentTetromino[r][c]) board[currentY + r][currentX + c] = currentColor;
}
function removeFullLines() {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell)) {
            board.splice(r, 1);
            board.unshift(Array(COLS).fill(0));
            score += 100;
            r++;
        }
    }
}
function newTetromino() {
    const idx = Math.floor(Math.random() * tetrominoes.length);
    currentTetromino = tetrominoes[idx].shape;
    currentColor = tetrominoes[idx].color;
    currentX = Math.floor(COLS / 2) - Math.floor(currentTetromino[0].length / 2);
    currentY = 0;
}
function rotate() {
    const r = currentTetromino[0].map((_, i) => currentTetromino.map(row => row[i])).reverse();
    if (isMoveValid(currentX, currentY, r)) currentTetromino = r;
}
function hardDrop() {
    while (isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++;
}
function redraw() { drawBoard(); drawTetromino(); }

function gameLoop(ts) {
    if (ts - lastDropTime >= DROP_INTERVAL) {
        lastDropTime = ts;
        if (isMoveValid(currentX, currentY + 1, currentTetromino)) {
            currentY++;
        } else {
            placeTetromino();
            removeFullLines();
            newTetromino();
            if (!isMoveValid(currentX, currentY, currentTetromino)) {
                alert("Game Over! Punteggio: " + score);
                board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
                score = 0;
            }
        }
    }
    redraw();
    document.getElementById("score").innerText = `Punteggio: ${score}`;
    requestAnimationFrame(gameLoop);
}

newTetromino();
requestAnimationFrame(gameLoop);

// ── INPUT ─────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
    startMusic();
    if (e.key === "ArrowLeft"  && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    if (e.key === "ArrowRight" && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
    if (e.key === "ArrowDown"  && isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++;
    if (e.key === "ArrowUp")  rotate();
    if (e.key === " ")        hardDrop();
    redraw();
});

let tx = 0, ty = 0;
const SWIPE_THRESHOLD = 25;
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startMusic();
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        rotate();
    } else if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
        else if (dx < 0 && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    } else if (dy > 0) {
        hardDrop();
    }
    redraw();
}, { passive: false });