/* =========================================
   Pronunciation Game — script.js
   Audio naming: title_a.mp3, word_a1.mp3, word_b2.mp3, ...
   - Up to 26 columns (a..z)
   - Titles playable anytime
   - Tile audio only after Submit
   - Guards against missing DOM nodes (no null errors)
   ========================================= */

const DATA_DIR = 'data/';                 // CSVs here
const AUDIO_DIRS = ['data/audio/'];       // Audio bases

// ---------- Helpers ----------
const qs  = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');
const colLetter = i => String.fromCharCode('a'.charCodeAt(0) + i);

// ---------- Timer ----------
let timerId = null, tStart = null;
function startTimer(){
  tStart = Date.now();
  stopTimer();
  timerId = setInterval(()=>{
    const s = Math.floor((Date.now()-tStart)/1000);
    const el = qs('#timer'); if (el) el.textContent = `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
  }, 250);
}
function stopTimer(){ if (timerId) clearInterval(timerId); timerId = null; }

// ---------- CSV load (auto delimiter) ----------
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

// ---------- Audio (original naming) ----------
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
const titleFilename = colIdx => `title_${colLetter(colIdx)}.mp3`;
const wordFilename  = (colIdx, rowIdx) => `word_${colLetter(colIdx)}${rowIdx+1}.mp3`;

// ---------- Data model ----------
/*
  header = first row (titles) -> N columns (<=26)
  dataRows = remaining rows -> M rows
  Grid: rows = M, cols = N
  Tile matches row=r, col=c
*/
let DATASET_NAME = 'dataset01';
let HEADER = [];
let DATA_ROWS = [];
let ALL_TILES = [];
let PLACED_COUNT = 0;
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
  if (!titles) return;
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
  if (!grid) return;
  grid.innerHTML = '';
  for (let r=0; r<numRows; r++){
    const rowEl = document.createElement('div');
    rowEl.className = 'grid-row';
    for (let c=0; c<numCols; c++){
      const cell = document.createElement('div');
      cell.className = 'dropcell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
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
  if (!pool) return;
  pool.innerHTML = '';
  tiles.forEach(tile=>{
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.draggable = true;
    btn.dataset.id = tile.id;
    btn.dataset.row = String(tile.targetRow);
    btn.dataset.col = String(tile.targetCol);
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

// Move tile into a cell
function placeTileInCell(tileId, cell){
  if (SUBMITTED) return;

  // One per cell: if occupied, swap to pool
  if (cell.childElementCount > 0){
    const existing = cell.firstElementChild;
    if (existing && existing.classList.contains('tile')){
      const pool = qs('#pool');
      if (pool) pool.appendChild(existing);
      PLACED_COUNT = Math.max(0, PLACED_COUNT - 1); // freed a cell
    }
    cell.innerHTML = '';
  }

  const tileEl = document.querySelector(`.tile[data-id="${tileId}"]`);
  if (!tileEl) return;

  const prevParent = tileEl.parentElement;
  if (prevParent && prevParent.classList.contains('dropcell')){
    prevParent.innerHTML = '';
  } else {
    PLACED_COUNT++;
  }

  cell.appendChild(tileEl);

  const submitBtn = qs('#submitBtn');
  if (submitBtn){
    const totalTiles = ALL_TILES.length;
    submitBtn.disabled = (PLACED_COUNT !== totalTiles);
  }
}

// ---------- Submit (grade & score) ----------
function onSubmit(){
  if (SUBMITTED) return;
  SUBMITTED = true;
  stopTimer();

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

  // Leftovers in pool are incorrect
  qsa('#pool .tile').forEach(t => t.classList.add('incorrect'));

  // Enable tile audio after submit
  qsa('.tile .speak').forEach(b => b.disabled = false);

  const status = qs('#status');
  if (status) status.textContent = `Score: ${score} / ${total}`;

  // Keep Submit disabled after grading
  const submitBtn = qs('#submitBtn');
  if (submitBtn) submitBtn.disabled = true;
}

// ---------- Init ----------
async function init(){
  const params = new URLSearchParams(location.search);
  DATASET_NAME = (params.get('dataset') || 'dataset01').trim();
  const dsEl = qs('#datasetName'); if (dsEl) dsEl.textContent = DATASET_NAME;

  // Load CSV
  const csvURL = `${DATA_DIR}${DATASET_NAME}.csv`;
  let rows = [];
  try{ rows = await loadCSV(csvURL); }
  catch(e){
    const st = qs('#status'); if (st) st.textContent = `Could not load ${csvURL} (${e.message}).`;
    return;
  }
  if (!rows.length){
    const st = qs('#status'); if (st) st.textContent = `Dataset ${csvURL} is empty.`;
    return;
  }

  HEADER = rows[0].filter(x => x.trim().length);
  if (HEADER.length > 26){
    const st = qs('#status'); if (st) st.textContent = `This dataset has ${HEADER.length} columns; max supported is 26 (a..z).`;
    return;
  }
  DATA_ROWS = rows.slice(1).map(r => r.slice(0, HEADER.length));

  renderTitles(HEADER);
  renderGrid(DATA_ROWS.length, HEADER.length);

  ALL_TILES = makeTiles(DATA_ROWS);
  PLACED_COUNT = 0;
  SUBMITTED = false;
  renderPool(ALL_TILES);

  // Buttons (guarded)
  qs('#resetBtn')?.addEventListener('click', ()=>location.reload());
  qs('#submitBtn')?.addEventListener('click', onSubmit);

  // Ensure Submit starts disabled
  const submitBtn = qs('#submitBtn');
  if (submitBtn) submitBtn.disabled = (PLACED_COUNT !== ALL_TILES.length);

  startTimer();
}

document.addEventListener('DOMContentLoaded', init);