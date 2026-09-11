/* A small, dependency-free Tetris. */
(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;          // board render size, in canvas pixels
  const MINI = 24;           // hold / next render size

  // Each shape lives in a square matrix so rotation is a plain matrix rotate.
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  };

  const COLORS = {
    I: '#4ec3e0', J: '#4f7ce0', L: '#e69138',
    O: '#e3c331', S: '#5bc46b', T: '#a86ee0', Z: '#e05252',
  };

  // Gravity per level, in milliseconds per cell.
  const SPEEDS = [800, 720, 630, 550, 470, 380, 300, 220, 160, 120, 100, 85, 72, 60, 50];
  const LINE_SCORE = [0, 100, 300, 500, 800];

  const DAS = 160;   // delay before a held move key repeats
  const ARR = 45;    // repeat interval for a held move key

  // ---------------------------------------------------------------- canvases

  function fitCanvas(canvas, width, height) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  const boardCanvas = document.getElementById('board');
  const holdCanvas = document.getElementById('hold');
  const nextCanvas = document.getElementById('next');

  const NEXT_COUNT = 3;
  const boardCtx = fitCanvas(boardCanvas, COLS * BLOCK, ROWS * BLOCK);
  const holdCtx = fitCanvas(holdCanvas, 4 * MINI, 4 * MINI);
  const nextCtx = fitCanvas(nextCanvas, 4 * MINI, NEXT_COUNT * 3 * MINI);

  const el = {
    score: document.getElementById('score'),
    lines: document.getElementById('lines'),
    level: document.getElementById('level'),
    best: document.getElementById('best'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayText: document.getElementById('overlay-text'),
    restart: document.getElementById('restart'),
  };

  // ------------------------------------------------------------------- state

  let grid, active, holdPiece, holdUsed, queue, bag;
  let score, lines, level, dropTimer, dropInterval, paused, gameOver;
  let best = Number(localStorage.getItem('tetris-best') || 0);

  const held = { left: 0, right: 0 };   // timestamps for key-repeat
  let softDropping = false;

  function rotate(matrix) {
    const n = matrix.length;
    const out = matrix.map(row => row.slice());
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) out[y][x] = matrix[n - 1 - x][y];
    }
    return out;
  }

  function nextFromBag() {
    if (!bag || bag.length === 0) {
      bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function makePiece(type) {
    const shape = SHAPES[type].map(row => row.slice());
    return {
      type,
      shape,
      x: Math.floor((COLS - shape.length) / 2),
      y: type === 'I' ? -1 : 0,
    };
  }

  function collides(piece, shape = piece.shape, px = piece.x, py = piece.y) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape.length; x++) {
        if (!shape[y][x]) continue;
        const gx = px + x;
        const gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function reset() {
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    bag = null;
    queue = Array.from({ length: NEXT_COUNT }, nextFromBag);
    holdPiece = null;
    holdUsed = false;
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = SPEEDS[0];
    dropTimer = 0;
    paused = false;
    gameOver = false;
    spawn();
    hideOverlay();
    updateStats();
  }

  function spawn() {
    queue.push(nextFromBag());
    active = makePiece(queue.shift());
    holdUsed = false;
    if (collides(active)) {
      gameOver = true;
      if (score > best) {
        best = score;
        localStorage.setItem('tetris-best', String(best));
      }
      updateStats();
      showOverlay('Game over', `Score ${score} — press R to play again`);
    }
  }

  // ------------------------------------------------------------------ moves

  function move(dx) {
    if (!collides(active, active.shape, active.x + dx, active.y)) {
      active.x += dx;
      return true;
    }
    return false;
  }

  function turn(dir) {
    let shape = active.shape;
    for (let i = 0; i < (dir > 0 ? 1 : 3); i++) shape = rotate(shape);
    // Nudge sideways (and up, for floor kicks) to make the rotation fit.
    const kicks = [0, -1, 1, -2, 2];
    for (const dx of kicks) {
      for (const dy of [0, -1]) {
        if (!collides(active, shape, active.x + dx, active.y + dy)) {
          active.shape = shape;
          active.x += dx;
          active.y += dy;
          return;
        }
      }
    }
  }

  function step() {
    if (!collides(active, active.shape, active.x, active.y + 1)) {
      active.y += 1;
      return true;
    }
    lock();
    return false;
  }

  function hardDrop() {
    let cells = 0;
    while (!collides(active, active.shape, active.x, active.y + 1)) {
      active.y += 1;
      cells++;
    }
    score += cells * 2;
    lock();
  }

  function hold() {
    if (holdUsed) return;
    const current = active.type;
    if (holdPiece) {
      active = makePiece(holdPiece);
    } else {
      queue.push(nextFromBag());
      active = makePiece(queue.shift());
    }
    holdPiece = current;
    holdUsed = true;
    dropTimer = 0;
  }

  function lock() {
    const { shape, x: px, y: py } = active;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape.length; x++) {
        if (shape[y][x] && py + y >= 0) grid[py + y][px + x] = active.type;
      }
    }
    clearLines();
    dropTimer = 0;
    spawn();
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(cell => cell)) {
        grid.splice(y, 1);
        grid.unshift(new Array(COLS).fill(null));
        cleared++;
        y++; // re-check the row that shifted down into this index
      }
    }
    if (!cleared) return;

    lines += cleared;
    score += LINE_SCORE[cleared] * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = SPEEDS[Math.min(level - 1, SPEEDS.length - 1)];
    updateStats();
  }

  // ------------------------------------------------------------------ render

  function drawCell(ctx, x, y, size, color) {
    const px = x * size;
    const py = y * size;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(px, py, size, size * 0.16);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(px, py + size * 0.84, size, size * 0.16);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  }

  function drawBoard() {
    boardCtx.clearRect(0, 0, COLS * BLOCK, ROWS * BLOCK);

    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    boardCtx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      boardCtx.beginPath();
      boardCtx.moveTo(x * BLOCK + 0.5, 0);
      boardCtx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
      boardCtx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      boardCtx.beginPath();
      boardCtx.moveTo(0, y * BLOCK + 0.5);
      boardCtx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
      boardCtx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) drawCell(boardCtx, x, y, BLOCK, COLORS[grid[y][x]]);
      }
    }

    if (gameOver) return;

    // Ghost: where a hard drop would land.
    let ghostY = active.y;
    while (!collides(active, active.shape, active.x, ghostY + 1)) ghostY++;
    boardCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let y = 0; y < active.shape.length; y++) {
      for (let x = 0; x < active.shape.length; x++) {
        if (active.shape[y][x] && ghostY + y >= 0) {
          boardCtx.fillRect((active.x + x) * BLOCK, (ghostY + y) * BLOCK, BLOCK, BLOCK);
        }
      }
    }

    for (let y = 0; y < active.shape.length; y++) {
      for (let x = 0; x < active.shape.length; x++) {
        if (active.shape[y][x] && active.y + y >= 0) {
          drawCell(boardCtx, active.x + x, active.y + y, BLOCK, COLORS[active.type]);
        }
      }
    }
  }

  // Draw a piece centred inside a 4-wide, 3-tall cell block.
  function drawPreview(ctx, type, rowOffset) {
    const shape = SHAPES[type];
    const cells = [];
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape.length; x++) if (shape[y][x]) cells.push([x, y]);
    }
    const xs = cells.map(c => c[0]);
    const ys = cells.map(c => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = (4 - w) / 2 - Math.min(...xs);
    const oy = (3 - h) / 2 - Math.min(...ys) + rowOffset;
    for (const [x, y] of cells) drawCell(ctx, x + ox, y + oy, MINI, COLORS[type]);
  }

  function drawSidePanels() {
    holdCtx.clearRect(0, 0, 4 * MINI, 4 * MINI);
    if (holdPiece) {
      holdCtx.globalAlpha = holdUsed ? 0.35 : 1;
      drawPreview(holdCtx, holdPiece, 0.5);
      holdCtx.globalAlpha = 1;
    }

    nextCtx.clearRect(0, 0, 4 * MINI, NEXT_COUNT * 3 * MINI);
    queue.slice(0, NEXT_COUNT).forEach((type, i) => drawPreview(nextCtx, type, i * 3));
  }

  function updateStats() {
    el.score.textContent = score;
    el.lines.textContent = lines;
    el.level.textContent = level;
    el.best.textContent = Math.max(best, score);
  }

  function showOverlay(title, text) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    el.overlay.classList.add('hidden');
  }

  // -------------------------------------------------------------- game loop

  let lastFrame = 0;

  function frame(now) {
    const dt = lastFrame ? Math.min(now - lastFrame, 100) : 0;
    lastFrame = now;

    if (!paused && !gameOver) {
      for (const dir of ['left', 'right']) {
        if (!held[dir]) continue;
        held[dir] += dt;
        if (held[dir] >= DAS + ARR) {
          held[dir] = DAS;
          move(dir === 'left' ? -1 : 1);
        }
      }

      dropTimer += dt;
      const interval = softDropping ? Math.min(50, dropInterval) : dropInterval;
      while (dropTimer >= interval) {
        dropTimer -= interval;
        const fell = step();
        if (fell && softDropping) score += 1;
        if (!fell) break;
      }
      updateStats();
    }

    drawBoard();
    drawSidePanels();
    requestAnimationFrame(frame);
  }

  // ----------------------------------------------------------------- input

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) showOverlay('Paused', 'Press P to resume');
    else hideOverlay();
  }

  const ACTIONS = {
    left: () => move(-1),
    right: () => move(1),
    rotate: () => turn(1),
    rotateLeft: () => turn(-1),
    down: () => { if (step()) score += 1; },
    drop: hardDrop,
    hold: hold,
  };

  function act(name) {
    if (paused || gameOver) return;
    ACTIONS[name]();
    updateStats();
  }

  document.addEventListener('keydown', (e) => {
    const key = e.key;

    if (key === 'r' || key === 'R') { reset(); return; }
    if (key === 'p' || key === 'P') { e.preventDefault(); togglePause(); return; }
    if (paused || gameOver) return;

    switch (key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        if (!e.repeat) { held.left = 1; held.right = 0; act('left'); }
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        if (!e.repeat) { held.right = 1; held.left = 0; act('right'); }
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        softDropping = true;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        e.preventDefault();
        if (!e.repeat) act('rotate');
        break;
      case 'z':
      case 'Z':
        e.preventDefault();
        if (!e.repeat) act('rotateLeft');
        break;
      case ' ':
        e.preventDefault();
        if (!e.repeat) act('drop');
        break;
      case 'c':
      case 'C':
      case 'Shift':
        e.preventDefault();
        if (!e.repeat) act('hold');
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') held.left = 0;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') held.right = 0;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') softDropping = false;
  });

  window.addEventListener('blur', () => {
    held.left = held.right = 0;
    softDropping = false;
  });

  el.restart.addEventListener('click', reset);
  el.overlay.addEventListener('click', () => { if (gameOver) reset(); else togglePause(); });

  document.querySelectorAll('.touch button').forEach((button) => {
    const name = button.dataset.act;
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      act(name);
    });
  });

  reset();
  requestAnimationFrame(frame);
})();
