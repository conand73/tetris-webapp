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
//  AUDIO — massima semplicità, zero automazioni
// ═══════════════════════════════════════════════
let AC = null, musicStarted = false;

const hz = n => 440 * Math.pow(2, (n - 69) / 12);

// BPM 160 → una semiminima = 0.375s → semicroma = 0.09375s
const BPM  = 160;
const T16  = (60 / BPM) / 4;

// Korobeiniki — [nota_MIDI, durata_16esimi]  (0 = silenzio)
const LEAD = [
  [76,4],[71,2],[72,2],[74,4],[72,2],[71,2],
  [69,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [71,6],[72,2],[74,4],[76,4],
  [72,4],[69,4],[69,8],
  [74,4],[74,2],[77,2],[81,4],[79,2],[77,2],
  [76,4],[72,2],[76,2],[79,4],[77,2],[76,2],
  [72,4],[72,2],[74,2],[71,4],[76,4],
  [72,4],[69,4],[69,8],
];

const HARM = [
  [72,4],[67,2],[69,2],[71,4],[69,2],[67,2],
  [64,4],[64,2],[69,2],[72,4],[71,2],[69,2],
  [67,6],[69,2],[71,4],[72,4],
  [69,4],[64,4],[64,8],
  [71,4],[71,2],[74,2],[77,4],[76,2],[74,2],
  [72,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [69,4],[69,2],[71,2],[67,4],[72,4],
  [69,4],[64,4],[64,8],
];

const BASS = [
  [52,8],[50,8],[48,8],[50,8],
  [47,8],[50,4],[52,4],
  [48,4],[45,4],[45,8],
  [50,8],[53,8],[52,8],[55,8],
  [48,8],[47,4],[52,4],
  [48,4],[45,4],[45,8],
];

// Pattern percussioni: 1=kick 2=snare 3=hihat 0=niente
const DRUM = [1,3,3,3, 2,3,3,3, 1,3,3,3, 2,3,3,3];

// ── Nota singola — semplicissima, nessuna automazione ──────
function playNote(freq, start, dur, type, vol) {
  if (!freq || !AC || !masterGain) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(masterGain);
  o.start(start);
  o.stop(start + dur * 0.88);
}

// ── Noise buffer breve per percussioni ─────────────────────
function noiseHit(start, dur, vol, hipass) {
  if (!AC || !masterGain) return;
  const len = Math.ceil(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  const src  = AC.createBufferSource();
  const g    = AC.createGain();
  src.buffer = buf;
  g.gain.value = vol;
  if (hipass) {
    const f = AC.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hipass;
    src.connect(f); f.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(masterGain);
  src.start(start);
  src.stop(start + dur);
}

// ── Pianifica un intero loop ────────────────────────────────
function scheduleLoop(t0) {
  // durata totale del loop = durata di LEAD
  const loopDur = LEAD.reduce((s, [,d]) => s + d, 0) * T16;

  // CH1 — melodia principale
  let t = t0;
  for (const [n, d] of LEAD) {
    playNote(n ? hz(n) : 0, t, d * T16, 'square', 0.10);
    t += d * T16;
  }

  // CH2 — armonia
  t = t0;
  for (const [n, d] of HARM) {
    playNote(n ? hz(n) : 0, t, d * T16, 'square', 0.06);
    t += d * T16;
  }

  // CH3 — basso (loop fino a coprire loopDur)
  t = t0;
  let bi = 0;
  while (t < t0 + loopDur - 0.01) {
    const [n, d] = BASS[bi % BASS.length];
    playNote(n ? hz(n) : 0, t, d * T16, 'triangle', 0.14);
    t += d * T16;
    bi++;
  }

  // CH4 — percussioni
  t = t0;
  let di = 0;
  while (t < t0 + loopDur - 0.01) {
    const type = DRUM[di % DRUM.length];
    if (type === 1) {
      // kick: sine discendente
      playNote(150, t, 0.12, 'sine', 0.30);
      noiseHit(t, 0.05, 0.05, null);
    } else if (type === 2) {
      // snare: triangle + noise
      playNote(200, t, 0.07, 'triangle', 0.07);
      noiseHit(t, 0.10, 0.15, null);
    } else if (type === 3) {
      // hihat: noise filtrato
      noiseHit(t, 0.03, 0.05, 6000);
    }
    t += T16;
    di++;
  }

  // Riprogramma il prossimo loop
  const delay = Math.max((t0 + loopDur - AC.currentTime - 0.4) * 1000, 0);
  setTimeout(() => scheduleLoop(t0 + loopDur), delay);
}

let muted = false;  // starts unmuted (music plays when started)
let masterGain = null;

function updateIcon() {
  const slash = document.getElementById('muteSlash');
  if (!slash) return;
  slash.setAttribute('visibility', muted ? 'visible' : 'hidden');
}

function toggleMusic() {
  if (!musicStarted) {
    // Prima volta: avvia
    startMusic();
  } else {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    updateIcon();
  }
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  muted = false;
  updateIcon();

  AC = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain per il mute
  masterGain = AC.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(AC.destination);

  const go = () => {
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.frequency.value = 440;
    g.gain.value = 0.1;
    o.connect(g); g.connect(masterGain);
    o.start(AC.currentTime);
    o.stop(AC.currentTime + 0.1);
    scheduleLoop(AC.currentTime + 0.15);
  };

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
      board.splice(r,1);
      board.unshift(Array(COLS).fill(0));
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
  document.getElementById("score").innerText = `Punteggio: ${score}`;
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