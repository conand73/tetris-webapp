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

// ── MUSIC ENGINE ──────────────────────────────────────────
let audioCtx = null;
let musicPlaying = false;
let nextNoteTime = 0;
let noteIndex = 0;
let schedulerTimer = null;

const BPM = 150;
const BEAT = 60 / BPM;
const LOOKAHEAD = 0.2;
const SCHEDULE_INTERVAL = 50;

// Korobeiniki (Tetris Theme A) — [freq_melody, freq_bass, duration_in_beats]
// 0 = rest/hold previous bass
const SONG = [
  [659.25, 164.81, 1],
  [493.88, 123.47, 0.5],
  [523.25, 130.81, 0.5],
  [587.33, 146.83, 1],
  [523.25, 130.81, 0.5],
  [493.88, 123.47, 0.5],
  [440.00, 110.00, 1],
  [440.00, 110.00, 0.5],
  [523.25, 130.81, 0.5],
  [659.25, 164.81, 1],
  [587.33, 146.83, 0.5],
  [523.25, 130.81, 0.5],
  [493.88, 123.47, 1.5],
  [523.25, 130.81, 0.5],
  [587.33, 146.83, 1],
  [659.25, 164.81, 1],
  [523.25, 130.81, 1],
  [440.00, 110.00, 1],
  [440.00, 110.00, 2],

  [587.33, 146.83, 1],
  [698.46, 174.61, 0.5],
  [880.00, 220.00, 0.5],
  [783.99, 196.00, 1],
  [698.46, 174.61, 0.5],
  [659.25, 164.81, 0.5],
  [523.25, 130.81, 1],
  [659.25, 164.81, 0.5],
  [587.33, 146.83, 0.5],
  [523.25, 130.81, 1],
  [493.88, 123.47, 0.5],
  [440.00, 110.00, 0.5],
  [493.88, 123.47, 1.5],
  [523.25, 130.81, 0.5],
  [587.33, 146.83, 1],
  [659.25, 164.81, 1],
  [523.25, 130.81, 1],
  [440.00, 110.00, 1],
  [440.00, 110.00, 2],
];

function scheduleNote(freq, startTime, duration, type, vol) {
  if (!freq || freq === 0) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
  gain.gain.setValueAtTime(vol, startTime + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + LOOKAHEAD) {
    const [mFreq, bFreq, beats] = SONG[noteIndex % SONG.length];
    const dur = beats * BEAT;
    scheduleNote(mFreq, nextNoteTime, dur * 0.92, 'square',   0.10);
    scheduleNote(bFreq, nextNoteTime, dur * 0.80, 'triangle', 0.06);
    nextNoteTime += dur;
    noteIndex++;
  }
  schedulerTimer = setTimeout(scheduler, SCHEDULE_INTERVAL);
}

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const kickoff = () => {
    nextNoteTime = audioCtx.currentTime + 0.05;
    noteIndex = 0;
    scheduler();
  };
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(kickoff);
  } else {
    kickoff();
  }
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

// ── INPUT — musica parte al primo tocco/tasto ─────────────
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