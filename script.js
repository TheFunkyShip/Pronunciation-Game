/* =========================
   Pronunciation Game — script.js
   ========================= */

/* ---------- Utilities ---------- */
const qs  = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

function pad2(n){ return String(n).padStart(2, "0"); }

/* ---------- Timer ---------- */
let timerId = null, tStart = null;
function startTimer(){
  tStart = Date.now();
  stopTimer();
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - tStart)/1000);
    qs('#timer').textContent = `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
  }, 250);
}
function stopTimer(){ if (timerId) clearInterval(timerId); timerId = null; }

/* ---------- CSV Loading with delimiter auto-detect ---------- */
async function loadCSV(url){
  const raw = await fetch(url).then(r => r.text());

  // Strip UTF-8 BOM, normalize newlines
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n').filter(l => l.trim().length);

  if (!lines.length) return [];

  // Try common delimiters and choose the one with the highest median columns
  const delims = [',',';','\t','|'];
  let best = { delim: ',', score: 0, split: [] };

  for (const d of delims){
    const split = lines.map(l => splitCSVLine(l, d));
    const widths = split.map(r => r.length).sort((a,b)=>a-b);
    const median = widths[Math.floor(widths.length/2)];
    if (median > best.score){ best = { delim: d, score: median, split }; }
  }

  // Trim cells and drop trailing empties
  const rows = best.split.map(r => r.map(c => c.trim()).filter(c => c.length>0));
  return rows.filter(r => r.length>0);
}

// Minimal CSV splitter that respects simple quotes for the chosen delimiter
function splitCSVLine(line, delim){
  const out = [];
  let cur = '', inQ = false;
  for (let i=0; i<line.length; i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    }else if (ch === delim && !inQ){
      out.push(cur);
      cur = '';
    }else{
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* ---------- Counts ---------- */
function countColumns(rows){
  return rows.reduce((m, r)=>Math.max(m, r.length), 0);
}

/* ---------- Data model ----------
   Row 0 = titles (N columns).
   Rows 1.. = data rows (each row provides N tiles, one per column).
   targetRow = column index (0..N-1)
   targetCol = data-row index (0..M-1)
-----------------------------------*/
function toTiles(dataRows){
  const tiles = [];
  dataRows.forEach((r, colIndex) => {
    r.forEach((word, rowIndex) => {
      tiles.push({
        id: `t_${colIndex}_${rowIndex}`,
        text: word,
        targetRow: rowIndex,   // column (0..N-1)
        targetCol: colIndex,   // which data row (0..M-1)
        placed: false
      });
    });
  });
  return shuffle(tiles);
}
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ---------- Rendering ---------- */
function renderTitles(titlesRow){
  const titles = qs('#titles');
  titles.innerHTML = '';
  const numCols = titlesRow.length;
  titles.style.gridTemplateColumns = `repeat(${numCols}, var(--tile-w))`;
  titlesRow.forEach((name, i)=>{
    const div = document.createElement('div');
    div.id = `title${i}`;
    div.textContent = name || `Title ${i+1}`;
    titles.appendChild(div);
  });
}

function renderGrid(numCols, numDataRows){
  const grid = qs('#grid');
  grid.innerHTML = '';
  // numCols = how many category columns; rows in the UI are per-category row strips
  for (let r = 0; r < numCols; r++){
    const rowEl = document.createElement('div');
    rowEl.className = 'grid-row';
    for (let c = 0; c < numDataRows; c++){
      const cell = document.createElement('div');
      cell.className = 'dropcell';
      cell.dataset.row = String(r); // targetRow
      cell.dataset.col = String(c); // targetCol

      cell.addEventListener('dragover', e => e.preventDefault());
      cell.addEventListener('drop', e => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        placeTile(id, cell);
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

    // label
    const label = document.createElement('span');
    label.textContent = tile.text;

    // audio: built-in text-to-speech (no files needed)
    const speak = document.createElement('button');
    speak.className = 'speak';
    speak.type = 'button';
    speak.title = 'Play pronunciation';
    speak.setAttribute('aria-label', `Play ${tile.text}`);
    speak.textContent = '🔊';
    speak.addEventListener('click', (e)=>{ e.stopPropagation(); speakWord(tile.text); });

    btn.appendChild(label);
    btn.appendChild(speak);

    btn.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', tile.id);
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--drag-w', rect.width + 'px');
      btn.style.setProperty('--drag-h', rect.height + 'px');
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', ()=> btn.classList.remove('dragging'));

    pool.appendChild(btn);
  });
}

/* ---------- Speech ---------- */
function speakWord(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }catch(e){
    // no-op if speech not supported
  }
}

/* ---------- Game State ---------- */
let ALL_TILES = [];
let NUM_COLS = 0;      // number of category columns (from header row)
let NUM_DATA_ROWS = 0; // number of data rows (rows after header)

function placeTile(tileId, cell){
  const tile = ALL_TILES.find(t => t.id === tileId);
  if (!tile) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);

  const correct = (tile.targetRow === row) && (tile.targetCol === col);
  if (!correct){
    cell.classList.add('shake');
    setTimeout(()=>cell.classList.remove('shake'), 300);
    return;
  }
  if (cell.childElementCount > 0) return;

  const pool = qs('#pool');
  const btn = pool.querySelector(`[data-id="${tile.id}"]`);
  if (btn){
    btn.draggable = false;
    btn.classList.add('placed');
    btn.style.width = 'var(--tile-w)';
    btn.style.minWidth = 'var(--tile-w)';
    btn.style.height = 'var(--tile-h)';
    cell.appendChild(btn);
  }

  tile.placed = true;

  if (ALL_TILES.every(t => t.placed)){
    qs('#status').textContent = 'Nice! All done.';
    stopTimer();
  }
}

/* ---------- Init ---------- */
async function init(){
  // Choose dataset
  const params = new URLSearchParams(location.search);
  const ds = params.get('dataset') || 'dataset01';
  qs('#datasetName').textContent = ds;

  // Load CSV
  const url = `${ds}.csv`;
  const rows = await loadCSV(url);

  if (!rows.length){
    qs('#status').textContent = 'Could not load dataset or dataset is empty.';
    return;
  }

  const header = rows[0];           // titles
  const dataRows = rows.slice(1);   // words to place
  NUM_COLS = countColumns([header]);   // number of columns = header width
  NUM_DATA_ROWS = dataRows.length;     // number of pairs/columns in the grid

  // If any data row is shorter than header, pad it so target indices exist
  const normalized = dataRows.map(r=>{
    const copy = r.slice(0, NUM_COLS);
    while (copy.length < NUM_COLS) copy.push('');
    return copy;
  });

  renderTitles(header);
  renderGrid(NUM_COLS, NUM_DATA_ROWS);

  ALL_TILES = toTiles(normalized);
  renderPool(ALL_TILES);

  // Reset/Timer
  qs('#resetBtn').onclick = ()=>location.reload();
  startTimer();
}

document.addEventListener('DOMContentLoaded', init);