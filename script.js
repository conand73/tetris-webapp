const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 10, ROWS = 20, RESERVED = 40;
const maxBlockH = Math.floor((window.innerHeight - RESERVED) / ROWS);
const maxBlockW = Math.floor(window.innerWidth / COLS);
const blockSize = Math.min(maxBlockH, maxBlockW);
canvas.width  = COLS * blockSize;
canvas.height = ROWS * blockSize;

let score = 0, lastDropTime = 0;
const DROP_INTERVAL = 500;
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

// ═══════════════════════════════════════════════
//  MUSIC — 4 canali stile Game Boy
// ═══════════════════════════════════════════════
let AC = null, musicOn = false, loopTimer = null;

// MIDI → Hz
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

// Tempo: 160 BPM, unità = semibiscroma (1/16)
const BPM = 160;
const T16 = (60 / BPM) / 4;   // durata di una semibiscroma in secondi

// ── SEQUENZA MELODICA (Korobeiniki — Game Boy key of A minor) ──
// Formato: [nota_MIDI, durata_in_16esimi]   0 = pausa

// Canale 1 — Melodia principale (square 50%)
const CH1 = [
  [76,4],[71,2],[72,2],[74,4],[72,2],[71,2],
  [69,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [71,6],[72,2],[74,4],[76,4],
  [72,4],[69,4],[69,8],
  [74,4],[74,2],[77,2],[81,4],[79,2],[77,2],
  [76,4],[72,2],[76,2],[79,4],[77,2],[76,2],
  [72,4],[72,2],[74,2],[71,4],[76,4],
  [72,4],[69,4],[69,8],
];

// Canale 2 — Armonia (square 25%, terze parallele sotto)
const CH2 = [
  [72,4],[67,2],[69,2],[71,4],[69,2],[67,2],
  [64,4],[64,2],[69,2],[72,4],[71,2],[69,2],
  [67,6],[69,2],[71,4],[72,4],
  [69,4],[64,4],[64,8],
  [71,4],[71,2],[74,2],[77,4],[76,2],[74,2],
  [72,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [69,4],[69,2],[71,2],[67,4],[72,4],
  [69,4],[64,4],[64,8],
];

// Canale 3 — Basso (triangle, 2 ottave sotto)
const CH3 = [
  [52,8],[50,8],[48,8],[50,8],
  [47,4],[47,4],[50,4],[52,4],
  [48,4],[45,4],[45,8],
  [50,8],[53,8],[52,8],[55,8],
  [48,4],[48,4],[47,4],[52,4],
  [48,4],[45,4],[45,8],
];

// Canale 4 — Percussioni (noise)
// Pattern 16 step ripetuto: 1=kick, 2=snare, 3=hihat
const DRUM = [1,3,3,3, 2,3,1,3, 1,3,3,3, 2,3,3,3];

// ── Funzione che pianta una singola nota (fire & forget) ──
function note(freq, start, dur, type, vol, detune) {
  const osc = AC.createOscillator();
  const g   = AC.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(vol,   start + 0.008);
  g.gain.setValueAtTime(vol,            start + dur * 0.80);
  g.gain.linearRampToValueAtTime(0.0001, start + dur * 0.95);
  osc.connect(g);
  g.connect(AC.destination);
  osc.start(start);
  osc.stop(start + dur + 0.01);
}

function kick(start) {
  // corpo tonale
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, start);
  o.frequency.exponentialRampToValueAtTime(40, start + 0.12);
  g.gain.setValueAtTime(0.35, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
  o.connect(g); g.connect(AC.destination);
  o.start(start); o.stop(start + 0.18);
}

function snare(start) {
  // noise
  const len = AC.sampleRate * 0.12;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(0.18, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
  src.connect(g); g.connect(AC.destination);
  src.start(start); src.stop(start + 0.12);
  // corpo
  const o = AC.createOscillator(), og = AC.createGain();
  o.type = 'triangle'; o.frequency.value = 200;
  og.gain.setValueAtTime(0.08, start);
  og.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  o.connect(og); og.connect(AC.destination);
  o.start(start); o.stop(start + 0.07);
}

function hihat(start) {
  const len = AC.sampleRate * 0.04;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // filtro passa-alto per timbro metallico
  const src = AC.createBufferSource();
  const filt = AC.createBiquadFilter();
  const g = AC.createGain();
  src.buffer = buf;
  filt.type = 'highpass'; filt.frequency.value = 7000;
  g.gain.setValueAtTime(0.06, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
  src.connect(filt); filt.connect(g); g.connect(AC.destination);
  src.start(start); src.stop(start + 0.04);
}

// ── Scheduler: pianifica tutti i canali assieme ──
function scheduleLoop(startTime) {
  let totalBeats = 0;

  // Calcola durata totale del loop (in 16esimi) dal canale più lungo
  const total16 = CH1.reduce((s, [,d]) => s + d, 0);
  const loopLen = total16 * T16;

  // CH1 — melodia
  let t = startTime;
  for (const [n, d] of CH1) {
    if (n) note(hz(n), t, d * T16, 'square', 0.12);
    t += d * T16;
  }

  // CH2 — armonia (parallelo, parte da startTime)
  t = startTime;
  for (const [n, d] of CH2) {
    if (n) note(hz(n), t, d * T16, 'square', 0.07, 8);
    t += d * T16;
  }

  // CH3 — basso (loop finché non copre tutta la durata)
  t = startTime;
  let ch3i = 0;
  while (t < startTime + loopLen - 0.01) {
    const [n, d] = CH3[ch3i % CH3.length];
    const dur = d * T16;
    if (n) note(hz(n), t, dur, 'triangle', 0.16);
    t += dur;
    ch3i++;
  }

  // CH4 — percussioni (loop a 16-step finché non copre tutta la durata)
  t = startTime;
  let di = 0;
  while (t < startTime + loopLen - 0.01) {
    const type = DRUM[di % DRUM.length];
    if (type === 1) kick(t);
    else if (type === 2) snare(t);
    else if (type === 3) hihat(t);
    t += T16;
    di++;
  }

  // Ripianifica il prossimo loop
  const msUntilNext = (startTime + loopLen - AC.currentTime - 0.3) * 1000;
  loopTimer = setTimeout(() => scheduleLoop(startTime + loopLen), Math.max(msUntilNext, 0));
}

function startMusic() {
  if (musicOn) return;
  musicOn = true;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const go = () => scheduleLoop(AC.currentTime + 0.1);
  AC.state === 'suspended' ? AC.resume().then(go) : go();
}

// ═══════════════════════════════════════════════
//  TETRIS GAME
// ═══════════════════════════════════════════════
function drawBlock(c, r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(c*blockSize, r*blockSize, blockSize-1, blockSize-1);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(c*blockSize, r*blockSize, blockSize-1, 4);
  ctx.fillRect(c*blockSize, r*blockSize, 4, blockSize-1);
}
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r=0;r<ROWS;r++)
    for (let c=0;c<COLS;c++)
      if (board[r][c]) drawBlock(c, r, board[r][c]);
}
function drawTetromino() {
  for (let r=0;r<currentTetromino.length;r++)
    for (let c=0;c<currentTetromino[r].length;c++)
      if (currentTetromino[r][c]) drawBlock(currentX+c, currentY+r, currentColor);
}
function isMoveValid(nx, ny, t) {
  for (let r=0;r<t.length;r++)
    for (let c=0;c<t[r].length;c++)
      if (t[r][c]) {
        const x=nx+c, y=ny+r;
        if (x<0||x>=COLS||y<0||y>=ROWS||board[y][x]) return false;
      }
  return true;
}
function placeTetromino() {
  for (let r=0;r<currentTetromino.length;r++)
    for (let c=0;c<currentTetromino[r].length;c++)
      if (currentTetromino[r][c]) board[currentY+r][currentX+c]=currentColor;
}
function removeFullLines() {
  for (let r=ROWS-1;r>=0;r--) {
    if (board[r].every(c=>c)) {
      board.splice(r,1); board.unshift(Array(COLS).fill(0));
      score+=100; r++;
    }
  }
}
function newTetromino() {
  const i=Math.floor(Math.random()*tetrominoes.length);
  currentTetromino=tetrominoes[i].shape;
  currentColor=tetrominoes[i].color;
  currentX=Math.floor(COLS/2)-Math.floor(currentTetromino[0].length/2);
  currentY=0;
}
function rotate() {
  const r=currentTetromino[0].map((_,i)=>currentTetromino.map(row=>row[i])).reverse();
  if (isMoveValid(currentX,currentY,r)) currentTetromino=r;
}
function hardDrop() { while(isMoveValid(currentX,currentY+1,currentTetromino)) currentY++; }
function redraw() { drawBoard(); drawTetromino(); }

function gameLoop(ts) {
  if (ts-lastDropTime>=DROP_INTERVAL) {
    lastDropTime=ts;
    if (isMoveValid(currentX,currentY+1,currentTetromino)) {
      currentY++;
    } else {
      placeTetromino(); removeFullLines(); newTetromino();
      if (!isMoveValid(currentX,currentY,currentTetromino)) {
        alert("Game Over! Punteggio: "+score);
        board=Array.from({length:ROWS},()=>Array(COLS).fill(0));
        score=0;
      }
    }
  }
  redraw();
  document.getElementById("score").innerText=`Punteggio: ${score}`;
  requestAnimationFrame(gameLoop);
}

newTetromino();
requestAnimationFrame(gameLoop);

// ── Input ──────────────────────────────────────
document.addEventListener("keydown", e => {
  startMusic();
  if (e.key==="ArrowLeft"  && isMoveValid(currentX-1,currentY,currentTetromino)) currentX--;
  if (e.key==="ArrowRight" && isMoveValid(currentX+1,currentY,currentTetromino)) currentX++;
  if (e.key==="ArrowDown"  && isMoveValid(currentX,currentY+1,currentTetromino)) currentY++;
  if (e.key==="ArrowUp") rotate();
  if (e.key===" ") hardDrop();
  redraw();
});

let tx=0, ty=0;
canvas.addEventListener("touchstart", e => {
  e.preventDefault(); startMusic();
  tx=e.touches[0].clientX; ty=e.touches[0].clientY;
}, {passive:false});
canvas.addEventListener("touchend", e => {
  e.preventDefault();
  const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
  if (Math.abs(dx)<25&&Math.abs(dy)<25) rotate();
  else if (Math.abs(dx)>Math.abs(dy)) {
    if (dx>0&&isMoveValid(currentX+1,currentY,currentTetromino)) currentX++;
    else if (dx<0&&isMoveValid(currentX-1,currentY,currentTetromino)) currentX--;
  } else if (dy>0) hardDrop();
  redraw();
}, {passive:false});