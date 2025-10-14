/* =========================================
   Pronunciation Game — script.js (column-based scoring)
   - CSV: row 1 = titles; rows 2+ = words; column = category
   - Correctness: tile is correct if dropped in its source column (row ignored)
   - Grid rows = max words in any column; columns = number of titles
   - Audio naming: title_a.mp3, word_a1.mp3, word_b2.mp3, ...
   ========================================= */

const DATA_DIR = 'data/';
const AUDIO_DIRS = ['data/audio/'];

const qs  = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');
const colLetter = i => String.fromCharCode('a'.charCodeAt(0) + i);

// ---------- Timer ----------
let timerId = null, tStart = null, SUBMITTED = false;
function startTimer(){
  tStart = Date.now();
  stopTimer();
  timerId = setInterval(()=>{
    const s = Math.floor((Date.now()-tStart)/1000);
    const el = qs('#timer'); if (el) el.textContent = `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
  }, 250);
}
function stopTimer(){ if (timerId) clearInterval(timerId); timerId = null; }

// ---------- CSV (auto delimiter) ----------
async function loadCSV(url){
  const raw = await fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
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
    if (ch === '"'){ if (inQ && line[i+1] === '"'){ cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === delim && !inQ){ out.push(cur); cur=''; }
    else cur += ch;
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
    try{ const res = await fetch(url, { method:'HEAD', cache:'no-store' }); if (res.ok) return url; }catch(e){}
  }
  return null;
}
const titleFilename = colIdx => `title_${colLetter(colIdx)}.mp3`;
const wordFilename  = (colIdx, rowIdx1based) => `word_${colLetter(colIdx)}${rowIdx1based}.mp3`;

// ---------- Data ----------
let DATASET_NAME = 'dataset01';
let HEADER = [];
let DATA_ROWS = [];     // 2D array (may have uneven column depths)
let ALL_TILES = [];     // {id, text, sourceCol, sourceRow1based}
let PLACED_COUNT = 0;

function buildTilesFromColumns(dataRows){
  const tiles = [];
  // For each column, collect words downwards; row index becomes 1-based for filename mapping
  const numCols = HEADER.length;
  for (let c = 0; c < numCols; c++){
    let rowNumber = 1;
    for (let r = 0; r < dataRows.length; r++){
      const word = (dataRows[r][c] || '').trim();
      if (word){
        tiles.push({
          id: `t_${r}_${c}_${rowNumber}`,
          text: word,
          sourceCol: c,            // used to check correctness (column only)
          sourceRow1: rowNumber    // used for audio filename word_<letter><rowNumber>.mp3
        });
        rowNumber++;
      }
    }
  }
  return shuffle(tiles);
}
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ---------- Rendering ----------
function renderTitles(header){
  const titles = qs('#titles'); if (!titles) return;
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
  const grid = qs('#grid'); if (!grid) return;
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
  const pool = qs('#pool'); if (!pool) return;
  pool.innerHTML = '';
  tiles.forEach(tile=>{
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.draggable = true;
    btn.dataset.id = tile.id;
    btn.dataset.sourceCol = String(tile.sourceCol);
    btn.dataset.sourceRow1 = String(tile.sourceRow1);
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
      const col = Number(btn.dataset.sourceCol);
      const row1 = Number(btn.dataset.sourceRow1);
      const url = await resolveAudioURL(wordFilename(col, row1), DATASET_NAME);
      if (url) new Audio(url).play().catch(()=>{});
    });

    pool.appendChild(btn);
  });
}

// After any move, recompute placed count and update Submit
function refreshPlacedCountAndSubmit(){
  PLACED_COUNT = qsa('.dropcell .tile').length;
  const submitBtn = qs('#submitBtn');
  if (submitBtn){
    submitBtn.disabled = (PLACED_COUNT !== ALL_TILES.length);
  }
}

// Move tile into a cell (free placement; one per cell)
function placeTileInCell(tileId, cell){
  if (SUBMITTED) return;

  // If occupied, move existing back to pool (do NOT change counters here)
  if (cell.childElementCount > 0){
    const existing = cell.firstElementChild;
    const pool = qs('#pool');
    if (existing && existing.classList.contains('tile') && pool){
      pool.appendChild(existing);
    }
    cell.innerHTML = '';
  }

  const tileEl = document.querySelector(`.tile[data-id="${tileId}"]`);
  if (!tileEl) return;

  // If dragged from another cell, free that cell
  const prevParent = tileEl.parentElement;
  if (prevParent && prevParent.classList.contains('dropcell')){
    prevParent.innerHTML = '';
  }

  cell.appendChild(tileEl);

  // Recompute placed count from DOM to avoid drift (handles swaps perfectly)
  refreshPlacedCountAndSubmit();
}

// ---------- Submit (grade & score: by column only) ----------
function onSubmit(){
  if (SUBMITTED) return;
  SUBMITTED = true;
  stopTimer();

  let score = 0;
  const total = ALL_TILES.length;

  // Evaluate only cells that contain a tile; empty cells are neutral
  qsa('.dropcell').forEach(cell=>{
    const c = Number(cell.dataset.col);
    const tile = cell.querySelector('.tile');

    cell.classList.remove('correct','incorrect');
    if (tile) tile.classList.remove('correct','incorrect');

    if (!tile) return; // neutral

    const srcCol = Number(tile.dataset.sourceCol);
    const ok = (srcCol === c);
    if (ok){
      score++;
      cell.classList.add('correct');
      tile.classList.add('correct');
    }else{
      cell.classList.add('incorrect');
      tile.classList.add('incorrect');
    }
  });

  // Leftover tiles in pool are incorrect (not placed)
  qsa('#pool .tile').forEach(t => t.classList.add('incorrect'));

  // Enable tile audio after submit
  qsa('.tile .speak').forEach(b => b.disabled = false);

  const status = qs('#status');
  if (status) status.textContent = `Score: ${score} / ${total}`;

  // Lock submit
  const submitBtn = qs('#submitBtn');
  if (submitBtn) submitBtn.disabled = true;
}

// ---------- Init ----------
async function init(){
  const params = new URLSearchParams(location.search);
  const ds = (params.get('dataset') || 'dataset01').trim();
  DATASET_NAME = ds;
  const dsEl = qs('#datasetName'); if (dsEl) dsEl.textContent = DATASET_NAME;

  // Load CSV
  const csvURL = `${DATA_DIR}${DATASET_NAME}.csv`;
  let rows = [];
  try{ rows = await loadCSV(csvURL); }
  catch(e){ const st = qs('#status'); if (st) st.textContent = `Could not load ${csvURL} (${e.message}).`; return; }
  if (!rows.length){ const st = qs('#status'); if (st) st.textContent = `Dataset ${csvURL} is empty.`; return; }

  // Header + data (keep rectangular by padding with "")
  HEADER = rows[0].slice(0, 26).map(x => (x||'').trim()); // limit 26 columns
  if (!HEADER.length){ const st = qs('#status'); if (st) st.textContent = 'Dataset header row is empty.'; return; }
  const width = HEADER.length;
  DATA_ROWS = rows.slice(1).map(r => {
    const row = r.slice(0, width);
    while (row.length < width) row.push('');
    return row;
  });

  // Compute grid height = max non-empty items in any column
  let maxPerCol = 0;
  for (let c=0; c<width; c++){
    let count = 0;
    for (let r=0; r<DATA_ROWS.length; r++){ if ((DATA_ROWS[r][c]||'').trim()) count++; }
    if (count > maxPerCol) maxPerCol = count;
  }

  renderTitles(HEADER);
  renderGrid(maxPerCol, width);           // rows = tallest column, cols = titles

  ALL_TILES = buildTilesFromColumns(DATA_ROWS);
  SUBMITTED = false;
  renderPool(ALL_TILES);

  // Buttons (guarded)
  qs('#resetBtn')?.addEventListener('click', ()=>location.reload());
  qs('#submitBtn')?.addEventListener('click', onSubmit);

  // Start with submit disabled and placed count 0
  refreshPlacedCountAndSubmit();
  startTimer();
}

document.addEventListener('DOMContentLoaded', init);