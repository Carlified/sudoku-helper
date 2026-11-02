// Reads a Good Sudoku screenshot into a board state.
// Everything is measured relative to the screenshot size and the colours found in
// the image itself, so it works across devices, themes and light/dark mode.
(function (root) {
  'use strict';

  const MARK_NONE = 0, MARK_NORMAL = 1, MARK_HIGHLIGHT = 2, MARK_CROSSED = 3;

  // 16x16 coverage templates for the big digits (0-9 per bin), generated from sample screenshots.
  let TEMPLATES = {
    1: '0000001699950000000015999994000000018999999300000000899999920000000059579991000000000108998000000000000999700000000000199960000000000029995000000000003999400000000000499930000000000059992000000004558999655100000899999999910000199999999980000019999999997000',
    2: '0000025799751000000038999999710000029999999996000007999635999810002999700069992000399950006999200039852002899700001310001799940000000002899971000000003899971000000004999971000000016999961000000017999984444100007999999999920002999999999991000299999999997000',
    3: '0001999999999810000299999999980000039999999996000001444599995100000000289994000000000289996100000000079999972000000004999999710000000056699994000000000005999500000232000499940001899600069993000189996479997100005999999999300000179999998300000001589985200000',
    4: '0000000399950000000000079981000000000049995000000000018998100000000004999400000000001899810000000000599943331000000189974999500000069993499940000029999479995300005999999999970000799999999997000089999999999500001111129997100000000002999600000000000299950000',
    5: '0000079999999300000029999999920000004999999991000000699833333000000189962210000000039999998610000005999999998100000699999999950000024663369997000000000002999700000133000299970000699810049995000069997469999200004999999999400000069999999500000000479986200000',
    6: '0000000189992000000000059994000000000049996000000000028997100000000018999620000000006999999720000004999999997100001899999999940000499972159997000069992001899700007998100199970000799920049995000069998569999200003999999999400000059999999500000000378986200000',
    7: '0018999999999400002999999999940000399999999992000014444469997000000000006999300000000002999700000000000699920000000000299960000000000079992000000000039996000000000007999200000000003999600000000000899920000000000499960000000000189991000000000049995000000000',
    8: '0000015799751000000028999999710000017999999994000004999736999600000699920189960000069993149995000004999989998100000189999999400000069999999970000039997337999200006999100499930000699810069992000069997569998100004999999999300000169999999400000001478986200000',
    9: '0000036899740000000059999999600000059999999994000029998537999600005999400299970000799910018997000079991003999600007999523799940000499999999981000017999999994000000269999996000000000369998100000000017998200000000006999400000000004999500000000002899710000000',
  };

  function dist(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  }

  function makeGetter(img) {
    const { width: W, data } = img;
    return (x, y) => {
      const i = ((y | 0) * W + (x | 0)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
  }

  // The vertical 3x3 box lines run exactly from the top to the bottom of the grid,
  // so the longest uniform vertical run near x = W/3 and 2W/3 gives the grid's extent.
  function locateGrid(img) {
    const W = img.width, H = img.height, get = makeGetter(img);
    const guessTop = Math.round(H * 0.1307);
    const mid = Math.min(H - 1, Math.round(guessTop + W / 2));
    let best = null;
    for (const frac of [1 / 3, 2 / 3]) {
      const x0 = Math.round(W * frac), span = Math.max(3, Math.round(W * 0.012));
      for (let x = x0 - span; x <= x0 + span; x++) {
        const c = get(x, mid);
        let y1 = mid, y2 = mid;
        while (y1 > 0 && dist(get(x, y1 - 1), c) < 24) y1--;
        while (y2 < H - 1 && dist(get(x, y2 + 1), c) < 24) y2++;
        const len = y2 - y1 + 1;
        if (!best || len > best.len) best = { len, top: y1, bottom: y2 + 1 };
      }
    }
    if (best && best.len > 0.9 * W && best.len < 1.1 * W) {
      return { left: 0, right: W, top: best.top, bottom: best.bottom, detected: true };
    }
    return { left: 0, right: W, top: guessTop, bottom: guessTop + W, detected: false };
  }

  // Most common colour in the cell = its background.
  function cellBackground(get, x0, y0, w, h) {
    const counts = new Map();
    const m = Math.round(w * 0.06);
    for (let y = m; y < h - m; y += 2) {
      for (let x = m; x < w - m; x += 2) {
        const p = get(x0 + x, y0 + y);
        const key = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
        const e = counts.get(key);
        if (e) { e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; }
        else counts.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
      }
    }
    let top = null;
    for (const e of counts.values()) if (!top || e.n > top.n) top = e;
    return [top.r / top.n, top.g / top.n, top.b / top.n];
  }

  function digitFeature(ink, w, h, bbox) {
    const N = 16, f = new Float32Array(N * N);
    const s = bbox.y1 - bbox.y0;
    const cx = (bbox.x0 + bbox.x1) / 2;
    const left = cx - s / 2;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let on = 0, tot = 0;
        const ya = bbox.y0 + (j * s) / N, yb = bbox.y0 + ((j + 1) * s) / N;
        const xa = left + (i * s) / N, xb = left + ((i + 1) * s) / N;
        for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
          for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
            tot++;
            if (x >= 0 && x < w && y >= 0 && y < h && ink[y * w + x]) on++;
          }
        }
        f[j * N + i] = tot ? on / tot : 0;
      }
    }
    return f;
  }

  function classifyDigit(feat) {
    if (!TEMPLATES) return { digit: 0, score: Infinity, margin: 0 };
    const scores = [];
    for (let d = 1; d <= 9; d++) {
      const t = TEMPLATES[d];
      let s = 0;
      for (let k = 0; k < feat.length; k++) {
        const diff = feat[k] - (t.charCodeAt(k) - 48) / 9;
        s += diff * diff;
      }
      scores.push({ d, s });
    }
    scores.sort((a, b) => a.s - b.s);
    return { digit: scores[0].d, score: scores[0].s, margin: scores[1].s - scores[0].s };
  }

  // Distance (RGB, euclidean) from point p to the segment a->b.
  function segDist(p, a, b) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L;
    t = Math.max(0, Math.min(1, t));
    const d0 = ap[0] - t * ab[0], d1 = ap[1] - t * ab[1], d2 = ap[2] - t * ab[2];
    return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }

  function median(values) {
    const v = values.slice().sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : 0;
  }

  // Principal-axis statistics of a point cloud: elongation and direction.
  function shape(points) {
    let mx = 0, my = 0;
    for (const p of points) { mx += p.x; my += p.y; }
    mx /= points.length; my /= points.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of points) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= points.length; syy /= points.length; sxy /= points.length;
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
    const angle = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI); // image coords, y down
    return { elong: l1 / l2, angle, sxy, len: Math.sqrt(12 * l1) };
  }

  // Ink-colour statistics are tuned against the distance between the background and
  // the darkest/lightest ink, so the thresholds below are fractions of the cell size.
  const INK_T = 60;

  function analyze(img) {
    const get = makeGetter(img);
    const grid = locateGrid(img);
    const cw = (grid.right - grid.left) / 9, ch = (grid.bottom - grid.top) / 9;
    const w = Math.floor(cw), h = Math.floor(ch);
    const mIn = Math.max(2, Math.round(cw * 0.035));
    const cells = [];
    const allMarks = [];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const x0 = Math.round(grid.left + c * cw), y0 = Math.round(grid.top + r * ch);
        const bg = cellBackground(get, x0, y0, w, h);
        const ink = new Uint8Array(w * h);
        const px = new Array(w * h);
        for (let y = mIn; y < h - mIn; y++) {
          for (let x = mIn; x < w - mIn; x++) {
            const p = get(x0 + x, y0 + y);
            const d = dist(p, bg);
            if (d > INK_T) { ink[y * w + x] = 1; px[y * w + x] = p; }
          }
        }
        const cell = { r, c, bg, value: 0, given: false, marks: new Array(9).fill(MARK_NONE), digitScore: 0 };

        // A big digit is a tall, unbroken stroke through the middle of the cell;
        // pencil marks stack in three short rows separated by gaps.
        const bx0 = Math.round(w * 0.3), bx1 = Math.round(w * 0.7);
        let run = 0, bestRun = 0;
        for (let y = mIn; y < h - mIn; y++) {
          let any = false;
          for (let x = bx0; x < bx1; x++) if (ink[y * w + x]) { any = true; break; }
          run = any ? run + 1 : 0;
          bestRun = Math.max(bestRun, run);
        }

        if (bestRun > h * 0.33) {
          const bbox = { x0: w, y0: h, x1: 0, y1: 0 };
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) {
            if (x < bbox.x0) bbox.x0 = x; if (x + 1 > bbox.x1) bbox.x1 = x + 1;
            if (y < bbox.y0) bbox.y0 = y; if (y + 1 > bbox.y1) bbox.y1 = y + 1;
          }
          cell.feature = digitFeature(ink, w, h, bbox);
          const res = classifyDigit(cell.feature);
          cell.value = res.digit;
          cell.digitScore = res.score;
          cell.digitMargin = res.margin;
        } else {
          // Pencil marks: digit d sits at position (d-1) of a 3x3 sub-grid.
          for (let k = 0; k < 9; k++) {
            const sx = (k % 3) * (w / 3), sy = Math.floor(k / 3) * (h / 3);
            const pts = [];
            for (let y = Math.max(mIn, Math.round(sy)); y < Math.min(h - mIn, Math.round(sy + h / 3)); y++) {
              for (let x = Math.max(mIn, Math.round(sx)); x < Math.min(w - mIn, Math.round(sx + w / 3)); x++) {
                if (ink[y * w + x]) pts.push({ x, y, p: px[y * w + x], d: dist(px[y * w + x], bg) });
              }
            }
            if (pts.length < cw * ch * 0.002) continue;
            // Representative colour: average of the strongest half of the ink.
            const strong = pts.slice().sort((a, b) => b.d - a.d).slice(0, Math.max(1, pts.length >> 1));
            const rep = [0, 0, 0];
            for (const s of strong) { rep[0] += s.p[0]; rep[1] += s.p[1]; rep[2] += s.p[2]; }
            rep[0] /= strong.length; rep[1] /= strong.length; rep[2] /= strong.length;
            const mark = { cell, k, pts, rep, bg };
            allMarks.push(mark);
            cell.marks[k] = MARK_NORMAL;
          }
        }
        cells.push(cell);
      }
    }

    // Normal pencil-mark ink is the most common mark colour on the board. Ink lying on the
    // blend between background and that colour is a plain mark; anything else is either a
    // highlight (bold coloured digit) or a cross-out (thin diagonal slash).
    const normal = [0, 1, 2].map(i => median(allMarks.map(m => m.rep[i])));
    for (const m of allMarks) {
      const off = [];
      let maxOff = 0;
      for (const p of m.pts) {
        const o = segDist(p.p, m.bg, normal);
        if (o > 40) { off.push({ x: p.x, y: p.y, o }); if (o > maxOff) maxOff = o; }
      }
      m.offFrac = off.length / m.pts.length;
      if (m.offFrac < 0.2 || off.length < 6) continue;
      const core = off.filter(p => p.o > maxOff * 0.5);
      const s = shape(core.length >= 6 ? core : off);
      m.shape = s;
      const a = Math.abs(s.angle);
      const isSlash = s.elong > 8 && s.sxy < 0 && a > 20 && a < 70 && s.len > cw * 0.12;
      m.cell.marks[m.k] = isSlash ? MARK_CROSSED : MARK_HIGHLIGHT;
    }

    markGivens(cells);
    return { grid, cells, normalInk: normal, marks: allMarks };
  }

  // Givens have their own background colour. Non-given colours are the ones that also
  // appear under empty cells, or that only occur on one parity of the checker pattern.
  function markGivens(cells) {
    const clusters = [];
    for (const cell of cells) {
      let cl = clusters.find(k => dist(k.color, cell.bg) < 14);
      if (!cl) { cl = { color: cell.bg, even: 0, odd: 0, empty: 0, cells: [] }; clusters.push(cl); }
      cl.cells.push(cell);
      if ((cell.r + cell.c) % 2) cl.odd++; else cl.even++;
      if (!cell.value) cl.empty++;
    }
    for (const cl of clusters) {
      const both = cl.even > 0 && cl.odd > 0;
      const givenColour = cl.empty === 0 && both;
      for (const cell of cl.cells) cell.given = givenColour && cell.value > 0;
    }
  }

  function toBoard(result) {
    return result.cells.map(c => ({
      value: c.value,
      given: c.given,
      marks: c.marks.slice(),
    }));
  }

  root.GSVision = {
    analyze, toBoard, locateGrid,
    setTemplates(t) { TEMPLATES = t; },
    MARK_NONE, MARK_NORMAL, MARK_HIGHLIGHT, MARK_CROSSED,
  };
})(typeof window !== 'undefined' ? window : globalThis);
