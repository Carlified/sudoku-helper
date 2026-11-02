(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { UNITS, BIT, cellName } = GSSolver;

  let S = null;            // solver state (values + candidates)
  let display = null;      // per cell {hl, crossed} bitmasks from the screenshot, for drawing only
  let history = [];
  let info = null;         // {issues, solution}
  let step = null;
  let tier = 0;            // 0 nothing shown, 1 nudge, 2 where, 3 answer
  let editing = false, selected = -1, penMode = false;

  // ---- Loading ------------------------------------------------------------------------
  $('pick').onclick = $('newShot').onclick = () => $('file').click();
  $('file').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  async function loadFile(file) {
    $('busy').textContent = 'Reading screenshot…';
    try {
      const img = await decode(file);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const res = GSVision.analyze(data);
      const board = GSVision.toBoard(res);

      const g = res.grid;
      const crop = document.createElement('canvas');
      crop.width = Math.min(900, g.right - g.left);
      crop.height = Math.round(crop.width * (g.bottom - g.top) / (g.right - g.left));
      crop.getContext('2d').drawImage(canvas, g.left, g.top, g.right - g.left, g.bottom - g.top, 0, 0, crop.width, crop.height);
      $('compareImg').src = crop.toDataURL('image/jpeg', 0.85);

      display = board.map(c => {
        let hl = 0, crossed = 0;
        c.marks.forEach((m, j) => {
          if (m === GSVision.MARK_HIGHLIGHT) hl |= BIT(j + 1);
          if (m === GSVision.MARK_CROSSED) crossed |= BIT(j + 1);
        });
        return { hl, crossed };
      });
      S = GSSolver.fromBoard(board);
      history = [];
      const digitsRead = board.filter(c => c.value).length;
      const marksRead = board.reduce((n, c) => n + c.marks.filter(Boolean).length, 0);
      const autoCount = S.auto.filter(Boolean).length;
      $('note').textContent =
        `Read ${digitsRead} digits and ${marksRead} pencil marks.` +
        (autoCount ? ` ${autoCount} empty cell${autoCount > 1 ? 's had' : ' had'} no marks, so I filled in their candidates.` : '') +
        (g.detected ? '' : ' The grid wasn\'t found where expected, so I guessed its position. Check it with "Compare screenshot".');
      $('empty').hidden = true; $('main').hidden = false; $('newShot').hidden = false;
      $('busy').textContent = '';
      recompute();
    } catch (err) {
      $('busy').textContent = 'Couldn\'t read that image: ' + err.message;
    }
  }

  function decode(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('unsupported image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---- Hint flow ----------------------------------------------------------------------
  function recompute() {
    info = GSSolver.check(S);
    step = GSSolver.nextStep(S, info.solution);
    tier = 0;
    render();
  }

  $('hint').onclick = () => {
    if (!step) return;
    if (tier < 3) { tier++; render(); return; }
    history.push({ S, display });
    S = GSSolver.apply(S, step);
    recompute();
    if (step) { tier = 1; render(); }
  };

  $('back').onclick = () => {
    if (!history.length) return;
    ({ S, display } = history.pop());
    recompute();
  };

  // ---- Editing ------------------------------------------------------------------------
  const keys = $('keys');
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.textContent = d;
    b.onclick = () => editDigit(d);
    keys.appendChild(b);
  }
  $('editBtn').onclick = () => setEditing(!editing);
  $('doneEdit').onclick = () => setEditing(false);
  $('modePencil').onclick = () => { penMode = false; syncMode(); };
  $('modePen').onclick = () => { penMode = true; syncMode(); };
  $('erase').onclick = () => {
    if (selected < 0) return;
    mutate(T => {
      T.values[selected] = 0;
      let m = 0b1111111110;
      for (const u of UNITS) if (u.includes(selected)) for (const p of u) if (T.values[p]) m &= ~BIT(T.values[p]);
      T.cands[selected] = m;
    });
  };
  function syncMode() {
    $('modePencil').classList.toggle('on', !penMode);
    $('modePen').classList.toggle('on', penMode);
  }
  function setEditing(on) {
    editing = on;
    if (!on) selected = -1;
    $('keypad').classList.toggle('open', on);
    $('editBtn').textContent = on ? 'Stop fixing' : 'Fix a cell';
    tier = 0;
    render();
  }
  function editDigit(d) {
    if (selected < 0) return;
    mutate(T => {
      if (penMode) {
        T.values[selected] = T.values[selected] === d ? 0 : d;
        T.cands[selected] = 0;
        if (!T.values[selected]) T.cands[selected] = BIT(d);
      } else if (!T.values[selected]) {
        T.cands[selected] ^= BIT(d);
      }
    });
  }
  function mutate(fn) {
    const T = GSSolver.clone(S);
    T.given = S.given.slice(); T.given[selected] = false;
    fn(T);
    S = T;
    info = GSSolver.check(S);
    step = GSSolver.nextStep(S, info.solution);
    render();
  }

  // ---- Rendering ----------------------------------------------------------------------
  function render() {
    const st = !editing && tier >= 2 ? step : null;
    const answer = !editing && tier >= 3 ? step : null;
    const unitCells = new Set(st ? st.units.flatMap(u => UNITS[u]) : []);
    const focus = new Set(st ? st.focus : []);
    const pattern = new Map(st ? st.pattern.map(p => [p.cell * 10 + p.d, p.color || 0]) : []);
    const elim = new Set(answer ? answer.elim.map(e => e.cell * 10 + e.d) : []);
    const place = new Map(answer ? answer.place.map(p => [p.cell, p.d]) : []);
    const issueCells = new Set(info.issues.flatMap(i => i.cells));

    let html = '';
    for (let i = 0; i < 81; i++) {
      const r = (i / 9) | 0, c = i % 9;
      const cls = ['cell', 'r' + r, 'c' + c];
      if (focus.has(i)) cls.push('focus'); else if (unitCells.has(i)) cls.push('unit');
      if (issueCells.has(i) && !focus.has(i)) cls.push('issue');
      if (i === selected) cls.push('selected');
      let inner = '';
      if (S.values[i]) {
        inner = `<span class="val${S.given[i] ? ' given' : ''}">${S.values[i]}</span>`;
      } else if (place.has(i)) {
        inner = `<span class="val ghost">${place.get(i)}</span>`;
      } else {
        inner = '<div class="cands">';
        for (let d = 1; d <= 9; d++) {
          const k = i * 10 + d;
          if (S.cands[i] & BIT(d)) {
            const sc = [];
            if (elim.has(k)) sc.push('el');
            else if (pattern.has(k)) sc.push(pattern.get(k) === 1 ? 'c1' : 'pat');
            else if (display && display[i].hl & BIT(d)) sc.push('hl');
            inner += `<span class="${sc.join(' ')}">${d}</span>`;
          } else if (display && display[i].crossed & BIT(d)) {
            inner += `<span class="x">${d}</span>`;
          } else inner += '<span></span>';
        }
        inner += '</div>';
      }
      html += `<div class="${cls.join(' ')}" data-i="${i}">${inner}</div>`;
    }
    $('board').innerHTML = html;

    const solved = S.values.every(Boolean);
    const hintBtn = $('hint');
    $('back').disabled = !history.length;
    hintBtn.disabled = !step || editing;
    if (solved) {
      $('technique').textContent = 'Done';
      $('message').textContent = 'The puzzle is solved.';
    } else if (!step) {
      $('technique').textContent = '';
      $('message').textContent = 'No step found. Check the board was read correctly.';
    } else if (editing) {
      $('technique').textContent = 'Fixing';
      $('message').textContent = 'Tap a cell, then toggle its pencil marks or set its digit.';
    } else {
      $('technique').textContent = tier >= 2 ? step.name : tier === 1 ? 'Hint' : '';
      $('message').textContent =
        tier === 0 ? 'Tap Hint to get a nudge toward the next move.' :
        tier === 1 ? step.nudge :
        tier === 2 ? step.nudge + ' The cells involved are highlighted.' :
        step.text;
    }
    hintBtn.textContent = tier === 0 ? 'Hint' : tier === 1 ? 'Show where' : tier === 2 ? 'Show answer' : 'Apply & next';

    const box = $('issues');
    box.innerHTML = '';
    for (const issue of info.issues) {
      const div = document.createElement('div');
      div.className = 'issue-item';
      const span = document.createElement('span');
      span.textContent = issue.text;
      div.appendChild(span);
      if (issue.digit) {
        const b = document.createElement('button');
        b.className = 'small';
        b.textContent = `Restore ${issue.digit}`;
        b.onclick = () => {
          const T = GSSolver.clone(S);
          T.cands[issue.cell] |= BIT(issue.digit);
          S = T;
          recompute();
        };
        div.appendChild(b);
      }
      box.appendChild(div);
    }
  }

  $('board').addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !editing) return;
    selected = +cell.dataset.i;
    render();
  });

  $('compareBtn').onclick = () => {
    const el = $('compare');
    const open = el.style.display !== 'block';
    el.style.display = open ? 'block' : 'none';
    $('compareBtn').textContent = open ? 'Hide screenshot' : 'Compare screenshot';
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
