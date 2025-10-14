<script>
/* ---------- CSV LOADING ---------- */
async function loadCSV(url) {
  const text = await fetch(url).then(r => r.text());
  const lines = text.trim().split(/\r?\n/);

  // Split by comma, trim, and drop empty cells at the end
  const rows = lines.map(l =>
    l.split(",").map(c => c.trim()).filter(c => c.length > 0)
  );

  // Guard: remove empty lines
  return rows.filter(r => r.length > 0);
}

/* ---------- COUNTS ---------- */
function countDataItemsPerRow(rows) {
  // Max items found in any row (how many table rows to render)
  return rows.reduce((max, r) => Math.max(max, r.length), 0);
}

function countRows(rows) {
  // How many pairs (how many table columns to render)
  return rows.length;
}

/* ---------- BUILD DATA MODEL ---------- */
/*
  We treat CSV like:
    row i -> items [A_i, B_i] (2 columns)
  We turn this into tiles with known (targetRow, targetCol):
    targetRow = index within the row (0 for column A, 1 for column B)
    targetCol = the pair index across the dataset
*/
function toTiles(rows) {
  const tiles = [];
  rows.forEach((r, pairIndex) => {
    r.forEach((word, rowIndex) => {
      tiles.push({
        id: `t_${pairIndex}_${rowIndex}`,
        text: word,
        targetRow: rowIndex,   // 0 or 1 (for “still 2 columns”)
        targetCol: pairIndex,  // which pair/column in the grid
        placed: false
      });
    });
  });
  return shuffle(tiles);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- RENDERING ---------- */
function renderTitles(rows) {
  // Use the first CSV row to title the two categories
  // If you prefer different titling logic, adjust here.
  const tA = document.getElementById("titleA");
  const tB = document.getElementById("titleB");
  const firstRow = rows[0] || [];
  tA.textContent = firstRow[0] || "Title A";
  tB.textContent = firstRow[1] || "Title B";
}

function renderPool(tiles) {
  const pool = document.getElementById("pool");
  pool.innerHTML = "";
  tiles.forEach(tile => {
    const el = document.createElement("button");
    el.className = "tile";
    el.draggable = true;
    el.textContent = tile.text;
    el.dataset.id = tile.id;

    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", tile.id);
      // Fix ghost size in some browsers
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--drag-w", rect.width + "px");
      el.style.setProperty("--drag-h", rect.height + "px");
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    pool.appendChild(el);
  });
}

function renderGrid(numRows, numCols) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // Build rows x cols droppable cells
  for (let r = 0; r < numRows; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "grid-row";
    for (let c = 0; c < numCols; c++) {
      const cell = document.createElement("div");
      cell.className = "dropcell";
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);

      // DnD events
      cell.addEventListener("dragover", (e) => e.preventDefault());
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        placeTile(id, cell);
      });

      rowEl.appendChild(cell);
    }
    grid.appendChild(rowEl);
  }
}

/* ---------- GAME STATE ---------- */
let ALL_TILES = [];
let GRID_ROWS = 2;
let GRID_COLS = 0;

function placeTile(tileId, cell) {
  const tile = ALL_TILES.find(t => t.id === tileId);
  if (!tile) return;

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);

  // Only allow placing the correct word in its correct row/column
  const correct = (tile.targetRow === row) && (tile.targetCol === col);
  if (!correct) {
    cell.classList.add("shake");
    setTimeout(() => cell.classList.remove("shake"), 300);
    return;
  }

  // If cell already has content, ignore
  if (cell.childElementCount > 0) return;

  // Move tile into cell
  const pool = document.getElementById("pool");
  const btn = pool.querySelector(`[data-id="${tile.id}"]`);
  if (btn) {
    btn.draggable = false;
    btn.classList.add("placed");
    // Keep its size stable in the grid
    btn.style.width = "var(--tile-w)";
    btn.style.minWidth = "var(--tile-w)";
    btn.style.height = "var(--tile-h)";
    cell.appendChild(btn);
  }

  tile.placed = true;

  // Optional: check completion
  const done = ALL_TILES.every(t => t.placed);
  if (done) {
    document.getElementById("status").textContent = "Nice! All done.";
  }
}

/* ---------- INIT ---------- */
async function init() {
  // Read dataset param: ?dataset=dataset01
  const params = new URLSearchParams(location.search);
  const ds = params.get("dataset") || "dataset01";
  const url = `${ds}.csv`;

  const rows = await loadCSV(url);

  // counts -> table shape
  GRID_ROWS = countDataItemsPerRow(rows);  // usually 2
  GRID_COLS = countRows(rows);             // number of pairs

  renderTitles(rows);
  renderGrid(GRID_ROWS, GRID_COLS);

  ALL_TILES = toTiles(rows);
  renderPool(ALL_TILES);
}

document.addEventListener("DOMContentLoaded", init);
</script>
