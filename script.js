// Pronunciation Game - main logic
// Expected layout:
//   /index.html
//   /style.css
//   /script.js
//   /data/datasetXX.csv
//   /audio/datasetXX/(title_a.mp3, title_b.mp3, word_a1..a5.mp3, word_b1..b5.mp3)

(function () {
  // --- Helpers ---
  const qs = new URLSearchParams(location.search);
  const DATASET = (qs.get("dataset") || "dataset01").toLowerCase();
  const paths = {
    csv: `data/${DATASET}.csv`,
    audio: `audio/${DATASET}`,
  };

  // Page elements
  const titleAText = document.getElementById("titleAText");
  const titleBText = document.getElementById("titleBText");
  const speakTitleA = document.getElementById("speakTitleA");
  const speakTitleB = document.getElementById("speakTitleB");
  const tray = document.getElementById("tray");
  const dropzones = Array.from(document.querySelectorAll(".dropzone"));
  const submitBtn = document.getElementById("submitBtn");
  const hearBtn = document.getElementById("hearBtn");
  const timerEl = document.getElementById("timer");
  const scoreEl = document.getElementById("score");
  const colAHeader = document.getElementById("colAHeader");
  const colBHeader = document.getElementById("colBHeader");
  const datasetNameEl = document.getElementById("datasetName");
  if (datasetNameEl) datasetNameEl.textContent = DATASET;

  // State
  let titles = { A: "", B: "" };
  let wordsA = [];
  let wordsB = [];
  let submitted = false;
  const mapWordToSet = new Map();   // "rants" -> "A"
  const mapWordToAudio = new Map(); // "rants" -> "audio/dataset01/word_a1.mp3"

  // Timer state
  let started = false;
  let startMs = 0;
  let tick = null;

  // --- Utilities ---
  const shuffle = (arr) =>
    arr
      .map((v) => ({ v, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((o) => o.v);

  const fmtTime = (ms) => {
    const t = Math.max(0, ms | 0);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const ds = Math.floor((t % 1000) / 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ds}`;
  };

  function startTimer() {
    if (started) return;
    started = true;
    startMs = performance.now();
    tick = setInterval(() => {
      timerEl.textContent = fmtTime(performance.now() - startMs);
    }, 100);
  }
  function stopTimer() {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
  }

  // Robust CSV parser for this simple 2-line, 6-fields-per-line case
  function parseCSV(text) {
    // remove BOM if present
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const clean = (s) => s.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);

    if (lines.length < 2) {
      throw new Error("CSV must have two non-empty lines.");
    }

    const rows = lines.map((line) => {
      const parts = [];
      let cur = "";
      let inQ = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          // Toggle quote (naive handling is fine for this format)
          inQ = !inQ;
        } else if (ch === "," && !inQ) {
          parts.push(clean(cur));
          cur = "";
        } else {
          cur += ch;
        }
      }
      parts.push(clean(cur));
      return parts.map((x) => x.trim());
    });

    // Expect 6 values per line: [title, w1, w2, w3, w4, w5]
    if (rows[0].length !== 6 || rows[1].length !== 6) {
      console.warn("CSV rows should each have 6 values. Got:", rows);
    }

    return rows;
  }

  async function load() {
    console.log("[Game] Loading dataset:", DATASET, paths.csv);
    const res = await fetch(paths.csv, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load CSV at ${paths.csv} (status ${res.status})`);
    }
    const text = await res.text();
    const rows = parseCSV(text);

    // Row 1 -> Column A, Row 2 -> Column B
    titles.A = rows[0][0] || "Column A";
    titles.B = rows[1][0] || "Column B";
    wordsA = rows[0].slice(1).filter(Boolean);
    wordsB = rows[1].slice(1).filter(Boolean);

    // Set titles in the header immediately
    titleAText.textContent = titles.A;
    titleBText.textContent = titles.B;

    // Build maps for correctness and audio paths (based on CSV order)
    wordsA.forEach((w, i) => {
      mapWordToSet.set(w, "A");
      mapWordToAudio.set(w, `${paths.audio}/word_a${i + 1}.mp3`);
    });
    wordsB.forEach((w, i) => {
      mapWordToSet.set(w, "B");
      mapWordToAudio.set(w, `${paths.audio}/word_b${i + 1}.mp3`);
    });

    // Attach title audio buttons
    const titleAudioA = new Audio(`${paths.audio}/title_a.mp3`);
    const titleAudioB = new Audio(`${paths.audio}/title_b.mp3`);
    speakTitleA.addEventListener("click", () => {
      titleAudioA.currentTime = 0;
      titleAudioA.play();
      colAHeader.classList.add("speaking");
      titleAudioA.onended = () => colAHeader.classList.remove("speaking");
      titleAudioA.onerror = () => colAHeader.classList.remove("speaking");
    });
    speakTitleB.addEventListener("click", () => {
      titleAudioB.currentTime = 0;
      titleAudioB.play();
      colBHeader.classList.add("speaking");
      titleAudioB.onended = () => colBHeader.classList.remove("speaking");
      titleAudioB.onerror = () => colBHeader.classList.remove("speaking");
    });

    // Create tiles (shuffled)
    const tiles = shuffle([
      ...wordsA.map((w) => ({ text: w, set: "A" })),
      ...wordsB.map((w) => ({ text: w, set: "B" })),
    ]);

    tiles.forEach(({ text, set }) => {
      const el = document.createElement("div");
      el.className = "tile";
      el.textContent = text;
      el.draggable = true;
      el.dataset.set = set; // 'A' or 'B'
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", text);
        e.dataTransfer.effectAllowed = "move";
        // set drag image for nicer UX
        try {
          e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
        } catch (_) {}
        startTimer();
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
      });
      el.addEventListener("mousedown", startTimer, { once: true });
      tray.appendChild(el);
    });

    // Enable DnD on tray and dropzones (moving tiles back and forth)
    const containers = [tray, ...dropzones];
    containers.forEach((zone) => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (zone.classList) zone.classList.add("over");
        e.dataTransfer.dropEffect = "move";
      });
      zone.addEventListener("dragleave", () => zone.classList && zone.classList.remove("over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        if (zone.classList) zone.classList.remove("over");
        const text = e.dataTransfer.getData("text/plain");
        const allTiles = Array.from(document.querySelectorAll(".tile"));
        const dragging = allTiles.find((t) => t.classList.contains("dragging") && t.textContent === text);
        const tile = dragging || allTiles.find((t) => t.textContent === text);
        if (!tile) return;

        // If dropping into a non-tray cell that already has a tile, return that tile to tray first
        if (zone !== tray && zone.firstElementChild) {
          tray.appendChild(zone.firstElementChild);
        }
        zone.appendChild(tile);
        updateSubmitState();
      });
    });

    // Submit: score and lock tiles
    submitBtn.addEventListener("click", () => {
      if (submitted) return;
      submitted = true;
      stopTimer();

      let score = 0;
      dropzones.forEach((z) => {
        z.classList.remove("correct", "incorrect");
        const tile = z.firstElementChild;
        if (tile) {
          const expected = z.dataset.col; // 'A' or 'B'
          const got = tile.dataset.set;
          if (expected === got) {
            score++;
            z.classList.add("correct");
          } else {
            z.classList.add("incorrect");
          }
        } else {
          z.classList.add("incorrect");
        }
      });

      scoreEl.textContent = `Score: ${score}/10`;
      hearBtn.disabled = false;
      // Lock tiles to preserve order for playback
      Array.from(document.querySelectorAll(".tile")).forEach((t) => (t.draggable = false));
      submitBtn.disabled = true;
    });

    // Hear the words: title A, A words (top->bottom), title B, B words (top->bottom), each twice
    hearBtn.addEventListener("click", async () => {
      if (hearBtn.disabled) return;
      hearBtn.disabled = true;

      const seq = [];
      const titleAPath = `${paths.audio}/title_a.mp3`;
      const titleBPath = `${paths.audio}/title_b.mp3`;

      const pushTwice = (obj) => {
        seq.push({ ...obj });
        seq.push({ ...obj });
      };

      // Column A
      pushTwice({ type: "title", el: colAHeader, path: titleAPath });
      const colAZones = dropzones.filter((z) => z.dataset.col === "A");
      for (const z of colAZones) {
        const tile = z.firstElementChild;
        if (tile) {
          const text = tile.textContent;
          const path = mapWordToAudio.get(text);
          if (path) pushTwice({ type: "tile", el: tile, path });
        }
      }

      // Column B
      pushTwice({ type: "title", el: colBHeader, path: titleBPath });
      const colBZones = dropzones.filter((z) => z.dataset.col === "B");
      for (const z of colBZones) {
        const tile = z.firstElementChild;
        if (tile) {
          const text = tile.textContent;
          const path = mapWordToAudio.get(text);
          if (path) pushTwice({ type: "tile", el: tile, path });
        }
      }

      // Play sequentially
      for (const item of seq) {
        await playOne(item);
      }
      hearBtn.disabled = false;
    });

    function playOne({ type, el, path }) {
      return new Promise((resolve) => {
        const audio = new Audio(path);
        el.classList.add("speaking");
        audio.play().catch(() => {}); // don't block on audio errors
        audio.onended = () => {
          el.classList.remove("speaking");
          resolve();
        };
        audio.onerror = () => {
          el.classList.remove("speaking");
          resolve();
        };
      });
    }

    function updateSubmitState() {
      // Enable submit only when all 10 tiles are placed in the table
      const placed = dropzones.reduce((acc, z) => acc + (z.firstElementChild ? 1 : 0), 0);
      submitBtn.disabled = placed !== 10 || submitted;
    }
  }

  // Kick off load
  load().catch((err) => {
    console.error(err);
    alert(
      "Could not load the dataset. Check that:\n" +
        `• ${paths.csv} exists and has 2 lines\n` +
        "• Folder/file names match case exactly\n" +
        "• You’re on the Pages URL (not the raw GitHub domain)"
    );
  });
})();
