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
//  4-CHANNEL GAMEBOY MUSIC ENGINE
//  Uses persistent oscillators + per-channel GainNode envelope
//  so all channels truly play simultaneously
// ══════════════════════════════════════════════════════════

function midiToHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

// Tempo
const BPM  = 160;
const STEP = 60 / BPM / 4; // 16th note in seconds

// ── Song data: arrays of [midiNote_or_0, duration_in_16ths] ──

// CH1 — Lead (Korobeiniki melody, A-minor, Game Boy pitch)
const S1 = [
  [76,4],[71,2],[72,2],[74,4],[72,2],[71,2],
  [69,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [71,6],[72,2],[74,4],[76,4],
  [72,4],[69,4],[69,8],

  [74,4],[74,2],[77,2],[81,4],[79,2],[77,2],
  [76,4],[72,2],[76,2],[79,4],[77,2],[76,2],
  [72,4],[72,2],[74,2],[71,4],[76,4],
  [72,4],[69,4],[69,8],
];

// CH2 — Harmony (parallel thirds below lead)
const S2 = [
  [72,4],[67,2],[69,2],[71,4],[69,2],[67,2],
  [64,4],[64,2],[69,2],[72,4],[71,2],[69,2],
  [67,6],[69,2],[71,4],[72,4],
  [69,4],[64,4],[64,8],

  [71,4],[71,2],[74,2],[77,4],[76,2],[74,2],
  [72,4],[69,2],[72,2],[76,4],[74,2],[72,2],
  [69,4],[69,2],[71,2],[67,4],[72,4],
  [69,4],[64,4],[64,8],
];

// CH3 — Bass / Wave channel (two octaves below, triangle)
const S3 = [
  [52,4],[52,4],[50,4],[50,4],
  [48,4],[48,4],[50,4],[50,4],
  [47,4],[47,4],[50,4],[52,4],
  [48,4],[45,4],[45,8],

  [50,4],[50,4],[53,4],[53,4],
  [52,4],[52,4],[55,4],[55,4],
  [48,4],[48,4],[47,4],[52,4],
  [48,4],[45,4],[45,8],
];

// CH4 — Percussion pattern (repeating 16-step bar)
// 1=kick, 2=snare, 3=hihat, 0=rest
const DRUM_BAR = [1,3,3,3, 2,3,3,3, 1,3,3,3, 2,3,3,3];

// ── Audio state ───────────────────────────────────────────
let ac = null;
let musicPlaying = false;

// Persistent oscillators per channel
let osc1, osc2, osc3;
let env1, env2, env3;  // per-note envelope gain nodes
let master;

// Noise for percussion
let noiseNode, noiseGain;
let noiseBuffer;

// Sequencer indices and timing
let i1=0, i2=0, i3=0, iDrum=0;
let t1=0, t2=0, t3=0, tDrum=0;
let seqTimer = null;

function makeNoiseBuffer(ac) {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Schedule a note-on/off envelope on a persistent oscillator
function schedEnvelope(gainNode, freq, oscNode, startTime, durSec, vol) {
  if (freq === 0) {
    // rest: silence
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.setValueAtTime(0, startTime + durSec);
  } else {
    oscNode.frequency.setValueAtTime(freq, startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(vol, startTime + 0.005);
    gainNode.gain.setValueAtTime(vol, startTime + durSec * 0.82);
    gainNode.gain.linearRampToValueAtTime(0, startTime + durSec * 0.95);
    gainNode.gain.setValueAtTime(0, startTime + durSec);
  }
}

// Schedule a drum hit using a buffer source
function schedDrum(type, startTime) {
  if (type === 0) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const g = ac.createGain();
  g.connect(master);
  src.connect(g);

  if (type === 1) {
    // Kick: pitched sine + noise burst
    const kick = ac.createOscillator();
    const kg = ac.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(150, startTime);
    kick.frequency.exponentialRampToValueAtTime(50, startTime + 0.1);
    kg.gain.setValueAtTime(0.25, startTime);
    kg.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    kick.connect(kg); kg.connect(master);
    kick.start(startTime); kick.stop(startTime + 0.2);
    g.gain.setValueAtTime(0.04, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
    src.start(startTime); src.stop(startTime + 0.05);
  } else if (type === 2) {
    // Snare: short noise burst + body tone
    g.gain.setValueAtTime(0.12, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
    src.start(startTime); src.stop(startTime + 0.1);
    const body = ac.createOscillator();
    const bg = ac.createGain();
    body.type = 'triangle';
    body.frequency.value = 220;
    bg.gain.setValueAtTime(0.06, startTime);
    bg.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
    body.connect(bg); bg.connect(master);
    body.start(startTime); body.stop(startTime + 0.08);
  } else if (type === 3) {
    // Hi-hat: very short noise
    g.gain.setValueAtTime(0.04, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.025);
    src.start(startTime); src.stop(startTime + 0.03);
  }
}

function runScheduler() {
  const now = ac.currentTime;
  const horizon = now + 0.2;

  // CH1 lead
  while (t1 < horizon) {
    const [note, dur16] = S1[i1 % S1.length];
    const d = dur16 * STEP;
    schedEnvelope(env1, note ? midiToHz(note) : 0, osc1, t1, d, 0.12);
    t1 += d; i1++;
  }

  // CH2 harmony
  while (t2 < horizon) {
    const [note, dur16] = S2[i2 % S2.length];
    const d = dur16 * STEP;
    schedEnvelope(env2, note ? midiToHz(note) : 0, osc2, t2, d, 0.07);
    t2 += d; i2++;
  }

  // CH3 bass
  while (t3 < horizon) {
    const [note, dur16] = S3[i3 % S3.length];
    const d = dur16 * STEP;
    schedEnvelope(env3, note ? midiToHz(note) : 0, osc3, t3, d, 0.14);
    t3 += d; i3++;
  }

  // CH4 drums
  while (tDrum < horizon) {
    const drumType = DRUM_BAR[iDrum % DRUM_BAR.length];
    schedDrum(drumType, tDrum);
    tDrum += STEP; iDrum++;
  }

  seqTimer = setTimeout(runScheduler, 50);
}

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;

  ac = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuffer = makeNoiseBuffer(ac);

  // Master gain (overall volume)
  master = ac.createGain();
  master.gain.value = 0.85;
  master.connect(ac.destination);

  // CH1 — square, lead melody
  osc1 = ac.createOscillator(); osc1.type = 'square';
  env1 = ac.createGain(); env1.gain.value = 0;
  osc1.connect(env1); env1.connect(master);
  osc1.start();

  // CH2 — square, harmony (slight detune for GB warmth)
  osc2 = ac.createOscillator(); osc2.type = 'square'; osc2.detune.value = 6;
  env2 = ac.createGain(); env2.gain.value = 0;
  osc2.connect(env2); env2.connect(master);
  osc2.start();

  // CH3 — triangle, bass
  osc3 = ac.createOscillator(); osc3.type = 'triangle';
  env3 = ac.createGain(); env3.gain.value = 0;
  osc3.connect(env3); env3.connect(master);
  osc3.start();

  const go = () => {
    const now = ac.currentTime + 0.1;
    t1 = t2 = t3 = tDrum = now;
    i1 = i2 = i3 = iDrum = 0;
    runScheduler();
  };

  ac.state === 'suspended' ? ac.resume().then(go) : go();
}

// ── TETRIS GAME ───────────────────────────────────────────
function drawBlock(c, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * blockSize, r * blockSize, blockSize-1, blockSize-1);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(c * blockSize, r * blockSize, blockSize-1, 4);
    ctx.fillRect(c * blockSize, r * blockSize, 4, blockSize-1);
}
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r=0;r<ROWS;r++)
        for (let c=0;c<COLS;c++)
            if (board[r][c]) drawBlock(c,r,board[r][c]);
}
function drawTetromino() {
    for (let r=0;r<currentTetromino.length;r++)
        for (let c=0;c<currentTetromino[r].length;c++)
            if (currentTetromino[r][c]) drawBlock(currentX+c,currentY+r,currentColor);
}
function isMoveValid(nx,ny,t) {
    for (let r=0;r<t.length;r++)
        for (let c=0;c<t[r].length;c++)
            if (t[r][c]) {
                let x=nx+c,y=ny+r;
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
        if (board[r].every(cell=>cell)) {
            board.splice(r,1); board.unshift(Array(COLS).fill(0));
            score+=100; r++;
        }
    }
}
function newTetromino() {
    const idx=Math.floor(Math.random()*tetrominoes.length);
    currentTetromino=tetrominoes[idx].shape;
    currentColor=tetrominoes[idx].color;
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

// ── INPUT ─────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
    startMusic();
    if (e.key==="ArrowLeft"  && isMoveValid(currentX-1,currentY,currentTetromino)) currentX--;
    if (e.key==="ArrowRight" && isMoveValid(currentX+1,currentY,currentTetromino)) currentX++;
    if (e.key==="ArrowDown"  && isMoveValid(currentX,currentY+1,currentTetromino)) currentY++;
    if (e.key==="ArrowUp")  rotate();
    if (e.key===" ")        hardDrop();
    redraw();
});

let tx=0,ty=0;
const SWIPE=25;
canvas.addEventListener("touchstart",(e)=>{
    e.preventDefault(); startMusic();
    tx=e.touches[0].clientX; ty=e.touches[0].clientY;
},{passive:false});
canvas.addEventListener("touchend",(e)=>{
    e.preventDefault();
    const dx=e.changedTouches[0].clientX-tx;
    const dy=e.changedTouches[0].clientY-ty;
    if (Math.abs(dx)<SWIPE&&Math.abs(dy)<SWIPE) rotate();
    else if (Math.abs(dx)>Math.abs(dy)) {
        if (dx>0&&isMoveValid(currentX+1,currentY,currentTetromino)) currentX++;
        else if (dx<0&&isMoveValid(currentX-1,currentY,currentTetromino)) currentX--;
    } else if (dy>0) hardDrop();
    redraw();
},{passive:false});