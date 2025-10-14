/* =========================================
   Pronunciation Game — script.js
   Audio mapping: title_a.mp3, word_a1.mp3, word_b2.mp3, ...
   - Up to 26 columns (a..z)
   - Titles playable anytime
   - Tile audio only after Submit
   ========================================= */

const DATA_DIR = 'data/';                 // CSVs live here
const AUDIO_DIRS = ['data/audio/'];       // Audio base(s). First try dataset subfolder, then global.

// ---------- Helpers ----------
const qs  = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');

function colLetter(index){ // 0 -> 'a', 25 -> 'z'
  return String.fromCharCode('a'.charCodeAt(0) + index);
}

// ---------- Timer ----------
let timerId = null, tStart = null;
function startTimer(){
  tStart = Date.now();
  stopTimer();
  timerId = setInterval(()=>{
    const s = Math.floor((Date.now()-tStart)/1000);
    qs('#timer').textContent = `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
  }, 250);
}
function stopTimer(){ if (timerId) clearInterval(timerId); timerId = null; }

// ---------- CSV loading (auto-detect common delimiters) ----------
async function loadCSV(url){
  const raw = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n').filter(l => l.trim().length);
  if (!lines.length) return [];

  const delims = [',',';','\t','|'];
  let best = { score: 0, rows: [] };
  for (const d of delims){
    const rows = lines.map(l => splitCSVLine(l, d));
    const widths = rows.map(r => r.length).sort((a,b)=>a-b);
    const median = widths[Math.floor(widths.length/2)];
    if (median > best.score) best = { score: median, rows };
  }
  return best.rows.map(r => r.map(c => c.trim()));
}
function splitCSVLine(line, delim){
  const out = []; let cur = '', inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ){
      out.push(cur); cur='';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ---------- Audio URL builders (ORIGINAL NAMING) ----------
/*
  Titles: title_<colLetter>.mp3
  Tiles:  word_<colLetter><rowNumber>.mp3    (rowNumber is 1-based)
  Search order for each audio:
    1) data/audio/<datasetName>/<file>
    2) data/audio/<file>
*/
async function resolveAudioURL(file, dataset){
  const candidates = [
    ...AUDIO_DIRS.map(base => `${base}${dataset}/${file}`),
    ...AUDIO_DIRS.map(base => `${base}${file}`),
  ];
  for (const url of candidates){
    try{
      const res = await fetch(url, { method:'HEAD', cache:'no-store' });
      if (res.ok) return url;
    }catch(e){}
  }
  return null;
}
function titleFilename(colIdx){
  const letter = colLetter(colIdx);
  return `title_${letter}.mp3`;
}
function wordFilename(colIdx, rowIdx){ // rowIdx is 0-based here; convert to 1-based
  const letter = colLetter(colIdx);
  const n = rowIdx + 1;
  return `word_${letter}${n}.mp3`;
}

// ---------- Data model ----------
/*
  header = first row (titles) -> N columns (max 26)
  dataRows = remaining rows -> M rows
  Grid dimensions: rows = M, cols = N
  For each data cell (r,c) create a tile:
    tile.targetRow = r, tile.targetCol = c
*/
let DATASET_NAME = 'dataset01';
let HEADER = [];
let DATA_ROWS = [];
let ALL_TILES = [];      // every tile object
let PLACED_COUNT = 0;    // to enable Submit when all placed
let SUBMITTED = false;

function makeTiles(dataRows){
  const tiles = [];
  dataRows.forEach((row, r) => {
    row.forEach((word, c) => {
      if (word && word.trim().length){
        tiles.push({ id:`t_${r}_${c}`, text:word.trim(), targetRow:r, targetCol:c });
      }
    });
  });
  return shuffle(tiles);
}
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ---------- Rendering ----------
function renderTitles(header){
  const titles = qs('#titles');
  titles.innerHTML = '';
  titles.style.gridTemplateColumns = `repeat(${header.length}, var(--tile-w))`;
  header.forEach((name, i)=>{
    const card = document.createElement('div');
    card.className = 'titleCard';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = name || `Title ${i+1}`;
    const btn = document.createElement('button');
    btn.className = 'play';
    btn.type = 'button';
    btn.title = `Play title ${colLetter(i)}`;
    btn.textContent = '🔊';
    btn.addEventListener('click', async ()=>{
      const url = await resolveAudioURL(titleFilename(i), DATASET_NAME);
      if (url) new Audio(url).play().catch(()=>{});
    });
    card.appendChild(label);
    card.appendChild(btn);
    titles.appendChild(card);
  });
}

function renderGrid(numRows, numCols){
  const grid = qs('#grid');
  grid.innerHTML = '';
  for (let r=0; r<numRows; r++){
    const rowEl = document.createElement('div');
    rowEl.className = 'grid-row';
    for (let c=0; c<numCols; c++){
      const cell = document.createElement('div');
      cell.className = 'dropcell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);

      // Accept drops anywhere (no correctness check until submit)
      cell.addEventListener('dragover', e => e.preventDefault());
      cell.addEventListener('drop', e => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        placeTileInCell(id, cell);
      });

      rowEl.appendChild(cell);
    }
    grid.appendChild(rowEl);
  }
}

function renderPool(tiles){
  const pool = qs('#pool');
  pool.innerHTML = '';
  tiles.forEach(tile=>{
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.draggable = true;
    btn.dataset.id = tile.id;
    btn.dataset.row = String(tile.targetRow);
    btn.dataset.col = String(tile.targetCol);

    // speaker button is present but disabled until Submit
    btn.innerHTML = `<span class="label">${tile.text}</span><button class="speak" type="button" title="Play" disabled>🔊</button>`;

    btn.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', tile.id);
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--drag-w', rect.width + 'px');
      btn.style.setProperty('--drag-h', rect.height + 'px');
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', ()=> btn.classList.remove('dragging'));

    // Tile audio (only after submit)
    const sp = btn.querySelector('.speak');
    sp.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if (!SUBMITTED) return;
      const r = Number(btn.dataset.row);
      const c = Number(btn.dataset.col);
      const url = await resolveAudioURL(wordFilename(c, r), DATASET_NAME);
      if (url) new Audio(url).play().catch(()=>{});
    });

    pool.appendChild(btn);
  });
}

// Move tile element into a cell (from pool or another cell)
function placeTileInCell(tileId, cell){
  if (SUBMITTED) return; // lock board after submit

  // Only allow one tile per cell; if occupied, swap out to pool
  if (cell.childElementCount > 0){
    const existing = cell.firstElementChild;
    if (existing && existing.classList.contains('tile')){
      qs('#pool').appendChild(existing);
      PLACED_COUNT--; // freeing a cell
    }
    cell.innerHTML = '';
  }

  const tileEl = document.querySelector(`.tile[data-id="${tileId}"]`);
  if (!tileEl) return;

  // If tile was previously in a cell, free that cell
  const prevParent = tileEl.parentElement;
  if (prevParent && prevParent.classList.contains('dropcell')){
    prevParent.innerHTML = '';
    // moving within grid doesn't change PLACED_COUNT
  } else {
    // from pool into grid
    PLACED_COUNT++;
  }

  cell.appendChild(tileEl);

  // Enable submit when everything is placed
  const totalTiles = ALL_TILES.length;
  qs('#submitBtn').disabled = (PLACED_COUNT !== totalTiles);
}

// ---------- Submit (grade & score) ----------
function onSubmit(){
  if (SUBMITTED) return;
  SUBMITTED = true;
  stopTimer();

  // Evaluate all cells
  let score = 0;
  const total = ALL_TILES.length;

  qsa('.dropcell').forEach(cell=>{
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    const tile = cell.querySelector('.tile');

    cell.classList.remove('correct','incorrect');
    if (tile) tile.classList.remove('correct','incorrect');

    if (!tile){
      cell.classList.add('incorrect');
      return;
    }
    const tr = Number(tile.dataset.row);
    const tc = Number(tile.dataset.col);
    const ok = (tr === r) && (tc === c);
    if (ok){
      score++;
      cell.classList.add('correct');
      tile.classList.add('correct');
    }else{
      cell.classList.add('incorrect');
      tile.classList.add('incorrect');
    }
  });

  // Any tiles left in pool are automatically wrong
  qsa('#pool .tile').forEach(t => t.classList.add('incorrect'));

  // Enable tile audio after submit
  qsa('.tile .speak').forEach(b => b.disabled = false);

  // Show score
  qs('#status').textContent = `Score: ${score} / ${total}`;
}

// ---------- Init ----------
async function init(){
  // dataset param
  const params = new URLSearchParams(location.search);
  DATASET_NAME = (params.get('dataset') || 'dataset01').trim();
  qs('#datasetName').textContent = DATASET_NAME;

  // Load CSV from /data
  const csvURL = `${DATA_DIR}${DATASET_NAME}.csv`;
  let rows = [];
  try{
    rows = await loadCSV(csvURL);
  }catch(e){
    qs('#status').textContent = `Could not load ${csvURL} (${e.message}).`;
    return;
  }
  if (!rows.length){
    qs('#status').textContent = `Dataset ${csvURL} is empty.`;
    return;
  }

  // Header + data
  HEADER = rows[0].filter(x => x.trim().length);
  if (HEADER.length > 26){
    qs('#status').textContent = `This dataset has ${HEADER.length} columns; max supported is 26 (a..z).`;
    return;
  }
  DATA_ROWS = rows.slice(1).map(r => r.slice(0, HEADER.length));
  const numRows = DATA_ROWS.length;
  const numCols = HEADER.length;

  renderTitles(HEADER);
  renderGrid(numRows, numCols);

  ALL_TILES = makeTiles(DATA_ROWS);
  PLACED_COUNT = 0;
  SUBMITTED = false;
  renderPool(ALL_TILES);

  // Buttons
  qs('#resetBtn').addEventListener('click', ()=>location.reload());
  qs('#submitBtn').addEventListener('click', onSubmit);

  // Timer
  startTimer();
}

document.addEventListener('DOMContentLoaded', init);