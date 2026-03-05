console.log("Script loaded!");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

if (!canvas || !ctx) {
    console.error("Canvas non trovato o contesto 2D non disponibile!");
} else {
    console.log("Canvas e contesto 2D correttamente inizializzati");
}

// Impostazioni del gioco
const rows = 20;
const cols = 10;
const blockSize = 30;
let score = 0;

// ✅ FIX: Velocità di caduta controllata (ms per step)
const DROP_INTERVAL = 500; // 500ms = scende una riga ogni mezzo secondo
let lastDropTime = 0;

canvas.width = cols * blockSize;
canvas.height = rows * blockSize;

let board = Array.from({ length: rows }, () => Array(cols).fill(0));

// ✅ FIX: Ogni tetromino ha il suo colore (come nell'icona)
const tetrominoes = [
  { shape: [[1, 1, 1], [0, 1, 0]], color: "#aa00ff" }, // T - viola
  { shape: [[1, 1], [1, 1]], color: "#ffee00" },        // O - giallo
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#00ff88" },  // S - verde
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#ff3355" },  // Z - rosso
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#ff8800" },  // L - arancione
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#0088ff" },  // J - blu
  { shape: [[1, 1, 1, 1]], color: "#00eeff" }           // I - ciano
];

let currentTetromino;
let currentColor;
let currentX = 3;
let currentY = 0;

// ✅ FIX: Il board ora memorizza il colore invece di 1
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] !== 0) {
                drawBlock(c, r, board[r][c]);
            }
        }
    }
}

function drawBlock(c, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, blockSize - 1);
    // Effetto luce
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(c * blockSize, r * blockSize, blockSize - 1, 4);
    ctx.fillRect(c * blockSize, r * blockSize, 4, blockSize - 1);
}

function drawTetromino() {
    for (let r = 0; r < currentTetromino.length; r++) {
        for (let c = 0; c < currentTetromino[r].length; c++) {
            if (currentTetromino[r][c]) {
                drawBlock(currentX + c, currentY + r, currentColor);
            }
        }
    }
}

function isMoveValid(newX, newY, tetromino) {
    for (let r = 0; r < tetromino.length; r++) {
        for (let c = 0; c < tetromino[r].length; c++) {
            if (tetromino[r][c]) {
                let x = newX + c;
                let y = newY + r;
                // ✅ FIX: aggiunto controllo y < 0
                if (x < 0 || x >= cols || y < 0 || y >= rows || board[y][x] !== 0) {
                    return false;
                }
            }
        }
    }
    return true;
}

function placeTetromino() {
    for (let r = 0; r < currentTetromino.length; r++) {
        for (let c = 0; c < currentTetromino[r].length; c++) {
            if (currentTetromino[r][c]) {
                // ✅ FIX: salva il colore nel board
                board[currentY + r][currentX + c] = currentColor;
            }
        }
    }
}

function removeFullLines() {
    for (let r = rows - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== 0)) {
            board.splice(r, 1);
            board.unshift(Array(cols).fill(0));
            score += 100;
            r++; // ✅ FIX: ricontrolla la stessa riga dopo lo splice
        }
    }
}

function newTetromino() {
    const randomIndex = Math.floor(Math.random() * tetrominoes.length);
    currentTetromino = tetrominoes[randomIndex].shape;
    currentColor = tetrominoes[randomIndex].color;
    currentX = Math.floor(cols / 2) - Math.floor(currentTetromino[0].length / 2);
    currentY = 0;
}

// ✅ FIX: gameLoop usa timestamp per controllare la velocità
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

// Avvia il gioco
newTetromino();
requestAnimationFrame(gameLoop);

// Controllo tasti
document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && isMoveValid(currentX - 1, currentY, currentTetromino)) {
        currentX--;
    }
    if (event.key === "ArrowRight" && isMoveValid(currentX + 1, currentY, currentTetromino)) {
        currentX++;
    }
    if (event.key === "ArrowDown" && isMoveValid(currentX, currentY + 1, currentTetromino)) {
        currentY++;
    }
    if (event.key === "ArrowUp") {
        const rotated = currentTetromino[0].map((_, i) => currentTetromino.map(row => row[i])).reverse();
        if (isMoveValid(currentX, currentY, rotated)) {
            currentTetromino = rotated;
        }
    }
    // ✅ BONUS: Spazio = caduta immediata
    if (event.key === " ") {
        while (isMoveValid(currentX, currentY + 1, currentTetromino)) {
            currentY++;
        }
    }

    drawBoard();
    drawTetromino();
});