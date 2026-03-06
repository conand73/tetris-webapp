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

// ── Tetris Theme (Korobeiniki) via Web Audio API ──────────
let audioCtx = null;
let musicNodes = [];
let musicStarted = false;

// Note frequencies (Hz)
const NOTE = {
  E4: 329.63, D4: 293.66, C4: 261.63, B3: 246.94,
  A3: 220.00, G3: 196.00, F3: 174.61, E3: 164.81,
  D3: 146.83, C3: 130.81, B2: 123.47, A2: 110.00,
  G2:  98.00, F2:  87.31,
  Bb3: 233.08, Eb4: 311.13, Ab3: 207.65,
};

// Korobeiniki melody: [frequency, duration_in_beats]
// BPM ~160, 1 beat = 0.375s
const BPM = 160;
const BEAT = 60 / BPM;

const melody = [
  [NOTE.E4, 1], [NOTE.B3, 0.5], [NOTE.C4, 0.5],
  [NOTE.D4, 1], [NOTE.C4, 0.5], [NOTE.B3, 0.5],
  [NOTE.A3, 1], [NOTE.A3, 0.5], [NOTE.C4, 0.5],
  [NOTE.E4, 1], [NOTE.D4, 0.5], [NOTE.C4, 0.5],
  [NOTE.B3, 1.5], [NOTE.C4, 0.5],
  [NOTE.D4, 1], [NOTE.E4, 1],
  [NOTE.C4, 1], [NOTE.A3, 1],
  [NOTE.A3, 2],

  [NOTE.D4, 1], [NOTE.F4 || NOTE.E4*1.059, 0.5], [NOTE.A4 || NOTE.E4*1.498, 0.5],
  // Approximate A4 = 440Hz, F4 = 349.23
  [349.23, 0.5], [440.00, 0.5], // D4->F4->A4
  [NOTE.G3*2||392, 1], [NOTE.E4, 0.5], [NOTE.G3*2||392, 0.5],
  [NOTE.E4, 1], [NOTE.C4, 0.5], [NOTE.E4, 0.5],
  [NOTE.D4, 1.5], [NOTE.C4, 0.5],
  [NOTE.B3, 1], [NOTE.B3, 0.5], [NOTE.C4, 0.5],
  [NOTE.D4, 1], [NOTE.E4, 1],
  [NOTE.C4, 1], [NOTE.A3, 1],
  [NOTE.A3, 2],
];

// Rewrite melody more accurately
const tetrisMelody = [
  // Phrase 1
  [329.63, 1], [246.94, 0.5], [261.63, 0.5],
  [293.66, 1], [261.63, 0.5], [246.94, 0.5],
  [220.00, 1], [220.00, 0.5], [261.63, 0.5],
  [329.63, 1], [293.66, 0.5], [261.63, 0.5],
  [246.94, 1.5],[261.63, 0.5],
  [293.66, 1], [329.63, 1],
  [261.63, 1], [220.00, 1],
  [220.00, 2],
  // Phrase 2
  [293.66, 1], [349.23, 0.5], [440.00, 0.5],
  [392.00, 1], [329.63, 0.5], [261.63, 0.5],
  [329.63, 1], [293.66, 0.5], [261.63, 0.5],
  [246.94, 1.5],[261.63, 0.5],
  [293.66, 1], [329.63, 1],
  [261.63, 1], [220.00, 1],
  [220.00, 2],
];

// Bass line (simple accompaniment)
const bassLine = [
  [110.00, 1], [0, 0.5], [130.81, 0.5],
  [146.83, 1], [0, 0.5], [130.81, 0.5],
  [110.00, 1], [0, 0.5], [110.00, 0.5],
  [164.81, 1], [0, 0.5], [130.81, 0.5],
  [123.47, 1.5],[0, 0.5],
  [146.83, 1], [164.81, 1],
  [130.81, 1], [110.00, 1],
  [110.00, 2],
  // phrase 2 bass
  [146.83, 1], [0, 0.5], [174.61, 0.5],
  [196.00, 1], [0, 0.5], [164.81, 0.5],
  [164.81, 1], [0, 0.5], [130.81, 0.5],
  [123.47, 1.5],[0, 0.5],
  [146.83, 1], [164.81, 1],
  [130.81, 1], [110.00, 1],
  [110.00, 2],
];

function playNote(actx, freq, startTime, duration, gainNode, type = 'square') {
  if (freq === 0) return;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(1, startTime + 0.01);
  env.gain.setValueAtTime(1, startTime + duration * BEAT - 0.05);
  env.gain.linearRampToValueAtTime(0, startTime + duration * BEAT);
  osc.connect(env);
  env.connect(gainNode);
  osc.start(startTime);
  osc.stop(startTime + duration * BEAT + 0.01);
  return osc;
}

function scheduleMelody(actx, notes, gainNode, type, startTime) {
  let t = startTime;
  for (const [freq, dur] of notes) {
    playNote(actx, freq, t, dur, gainNode, type);
    t += dur * BEAT;
  }
  return t; // end time
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.18;
  masterGain.connect(audioCtx.destination);

  const melodyGain = audioCtx.createGain();
  melodyGain.gain.value = 0.7;
  melodyGain.connect(masterGain);

  const bassGain = audioCtx.createGain();
  bassGain.gain.value = 0.4;
  bassGain.connect(masterGain);

  // Calculate total loop duration
  const melodyDuration = tetrisMelody.reduce((s, [,d]) => s + d * BEAT, 0);
  const bassDuration   = bassLine.reduce((s, [,d]) => s + d * BEAT, 0);
  const loopLen = Math.max(melodyDuration, bassDuration);

  let loopStart = audioCtx.currentTime;

  function scheduleLoop() {
    scheduleMelody(audioCtx, tetrisMelody, melodyGain, 'square', loopStart);
    scheduleMelody(audioCtx, bassLine,     bassGain,   'triangle', loopStart);
    loopStart += loopLen;
    // Schedule next loop slightly before end
    const timeoutMs = (loopStart - audioCtx.currentTime - 0.2) * 1000;
    setTimeout(scheduleLoop, Math.max(timeoutMs, 0));
  }

  scheduleLoop();
}

function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// ── Drawing ───────────────────────────────────────────────
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

// ── Tastiera (desktop) ────────────────────────────────────
document.addEventListener("keydown", (e) => {
    startMusic();
    resumeAudio();
    if (e.key === "ArrowLeft"  && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    if (e.key === "ArrowRight" && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
    if (e.key === "ArrowDown"  && isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++;
    if (e.key === "ArrowUp")  rotate();
    if (e.key === " ")        hardDrop();
    redraw();
});

// ── Swipe + tap (mobile) ──────────────────────────────────
let tx = 0, ty = 0;
const SWIPE_THRESHOLD = 25;

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startMusic();
    resumeAudio();
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