const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 10;
const ROWS = 20;

// ── Calcola blockSize in base allo spazio disponibile ──────
// Riserva spazio per: score (~30px), controls (~140px), gap/padding (~50px)
const RESERVED_HEIGHT = 220;
const maxBlockH = Math.floor((window.innerHeight - RESERVED_HEIGHT) / ROWS);
const maxBlockW = Math.floor(window.innerWidth / COLS);
const blockSize = Math.min(maxBlockH, maxBlockW, 30); // max 30px

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

// ── Tastiera ──────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft"  && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    if (e.key === "ArrowRight" && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
    if (e.key === "ArrowDown"  && isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++;
    if (e.key === "ArrowUp")  rotate();
    if (e.key === " ")        hardDrop();
    redraw();
});

// ── Pulsanti on-screen ────────────────────────────────────
function btn(id, fn) {
    const el = document.getElementById(id);
    // touchstart per risposta immediata su mobile
    el.addEventListener("touchstart", (e) => { e.preventDefault(); fn(); redraw(); }, { passive: false });
    el.addEventListener("click", () => { fn(); redraw(); });
}

btn("btn-left",   () => { if (isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--; });
btn("btn-right",  () => { if (isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++; });
btn("btn-down",   () => { if (isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++; });
btn("btn-rotate", rotate);
btn("btn-drop",   hardDrop);

// ── Swipe sul canvas ──────────────────────────────────────
let tx = 0, ty = 0;
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    const THRESH = 25;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) {
        rotate();
    } else if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
        else if (dx < 0 && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    } else if (dy > 0) {
        hardDrop();
    }
    redraw();
}, { passive: false });