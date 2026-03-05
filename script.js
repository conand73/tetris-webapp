console.log("Script loaded!");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const rows = 20;
const cols = 10;
const blockSize = 30;
let score = 0;
const DROP_INTERVAL = 500;
let lastDropTime = 0;

canvas.width = cols * blockSize;
canvas.height = rows * blockSize;

let board = Array.from({ length: rows }, () => Array(cols).fill(0));

const tetrominoes = [
  { shape: [[1, 1, 1], [0, 1, 0]], color: "#aa00ff" },
  { shape: [[1, 1], [1, 1]], color: "#ffee00" },
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#00ff88" },
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#ff3355" },
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#ff8800" },
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#0088ff" },
  { shape: [[1, 1, 1, 1]], color: "#00eeff" }
];

let currentTetromino;
let currentColor;
let currentX = 3;
let currentY = 0;

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] !== 0) drawBlock(c, r, board[r][c]);
        }
    }
}

function drawBlock(c, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, blockSize - 1);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, 4);
    ctx.fillRect(c * blockSize, r * blockSize, 4, blockSize - 1);
}

function drawTetromino() {
    for (let r = 0; r < currentTetromino.length; r++) {
        for (let c = 0; c < currentTetromino[r].length; c++) {
            if (currentTetromino[r][c]) drawBlock(currentX + c, currentY + r, currentColor);
        }
    }
}

function isMoveValid(newX, newY, tetromino) {
    for (let r = 0; r < tetromino.length; r++) {
        for (let c = 0; c < tetromino[r].length; c++) {
            if (tetromino[r][c]) {
                let x = newX + c;
                let y = newY + r;
                if (x < 0 || x >= cols || y < 0 || y >= rows || board[y][x] !== 0) return false;
            }
        }
    }
    return true;
}

function placeTetromino() {
    for (let r = 0; r < currentTetromino.length; r++) {
        for (let c = 0; c < currentTetromino[r].length; c++) {
            if (currentTetromino[r][c]) board[currentY + r][currentX + c] = currentColor;
        }
    }
}

function removeFullLines() {
    for (let r = rows - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== 0)) {
            board.splice(r, 1);
            board.unshift(Array(cols).fill(0));
            score += 100;
            r++;
        }
    }
}

function newTetromino() {
    const idx = Math.floor(Math.random() * tetrominoes.length);
    currentTetromino = tetrominoes[idx].shape;
    currentColor = tetrominoes[idx].color;
    currentX = Math.floor(cols / 2) - Math.floor(currentTetromino[0].length / 2);
    currentY = 0;
}

function rotate() {
    const rotated = currentTetromino[0].map((_, i) => currentTetromino.map(row => row[i])).reverse();
    if (isMoveValid(currentX, currentY, rotated)) currentTetromino = rotated;
}

function hardDrop() {
    while (isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++;
}

function gameLoop(timestamp) {
    if (timestamp - lastDropTime >= DROP_INTERVAL) {
        lastDropTime = timestamp;
        if (isMoveValid(currentX, currentY + 1, currentTetromino)) {
            currentY++;
        } else {
            placeTetromino();
            removeFullLines();
            newTetromino();
            if (!isMoveValid(currentX, currentY, currentTetromino)) {
                alert("Game Over! Punteggio: " + score);
                board = Array.from({ length: rows }, () => Array(cols).fill(0));
                score = 0;
            }
        }
    }
    drawBoard();
    drawTetromino();
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
    if (e.key === "ArrowUp")   rotate();
    if (e.key === " ")         hardDrop();
    drawBoard(); drawTetromino();
});

// ── Pulsanti on-screen ────────────────────────────────────
document.getElementById("btn-left")  .addEventListener("click", () => { if (isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--; drawBoard(); drawTetromino(); });
document.getElementById("btn-right") .addEventListener("click", () => { if (isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++; drawBoard(); drawTetromino(); });
document.getElementById("btn-down")  .addEventListener("click", () => { if (isMoveValid(currentX, currentY + 1, currentTetromino)) currentY++; drawBoard(); drawTetromino(); });
document.getElementById("btn-rotate").addEventListener("click", () => { rotate(); drawBoard(); drawTetromino(); });
document.getElementById("btn-drop")  .addEventListener("click", () => { hardDrop(); drawBoard(); drawTetromino(); });

// ── Swipe touch sul canvas ────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 30;

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        rotate(); // Tap = ruota
    } else if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && isMoveValid(currentX + 1, currentY, currentTetromino)) currentX++;
        else if (dx < 0 && isMoveValid(currentX - 1, currentY, currentTetromino)) currentX--;
    } else {
        if (dy > 0) hardDrop(); // Swipe giù = caduta immediata
    }
    drawBoard(); drawTetromino();
}, { passive: false });