// Human-style Sudoku step finder. Works on the player's own pencil marks and returns the
// easiest technique that makes progress, with the cells involved and an explanation.
(function (root) {
  'use strict';

  // ---- Geometry -----------------------------------------------------------------------
  const rowOf = i => (i / 9) | 0, colOf = i => i % 9;
  const boxOf = i => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push([...Array(9)].map((_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push([...Array(9)].map((_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3;
    UNITS.push([...Array(9)].map((_, k) => (r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)));
  }
  const UNITS_OF = [...Array(81)].map((_, i) => [rowOf(i), 9 + colOf(i), 18 + boxOf(i)]);
  const PEERS = [...Array(81)].map((_, i) => {
    const s = new Set();
    for (const u of UNITS_OF[i]) for (const j of UNITS[u]) if (j !== i) s.add(j);
    return [...s];
  });
  const sees = (a, b) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

  const cellName = i => `R${rowOf(i) + 1}C${colOf(i) + 1}`;
  const unitKind = u => (u < 9 ? 'row' : u < 18 ? 'column' : 'box');
  const unitName = u => `${unitKind(u)} ${(u % 9) + 1}`;
  const listNames = cells => cells.map(cellName).join(', ');

  // ---- Bit helpers (bit d set = candidate d) --------------------------------------------
  const BIT = d => 1 << d;
  const ALL = 0b1111111110;
  const pc = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const digits = m => { const out = []; for (let d = 1; d <= 9; d++) if (m & BIT(d)) out.push(d); return out; };
  const has = (S, i, d) => !S.values[i] && (S.cands[i] & BIT(d)) !== 0;
  const fmtDigits = ds => ds.length <= 1 ? String(ds[0]) : ds.slice(0, -1).join(', ') + ' and ' + ds[ds.length - 1];

  function* combos(arr, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc.slice(); return; }
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i]);
      yield* combos(arr, k, i + 1, acc);
      acc.pop();
    }
  }

  const positions = (S, u, d) => UNITS[u].filter(i => has(S, i, d));
  const placedIn = (S, u, d) => UNITS[u].some(i => S.values[i] === d);
  const commonPeers = (S, cells, d) => {
    const out = [];
    for (let i = 0; i < 81; i++) {
      if (cells.includes(i) || !has(S, i, d)) continue;
      if (cells.every(c => sees(i, c))) out.push(i);
    }
    return out;
  };

  function step(o) {
    return Object.assign({ place: [], elim: [], focus: [], pattern: [], units: [] }, o);
  }

  // ---- State ---------------------------------------------------------------------------
  // board: [{value, given, marks:[9]}] from GSVision.toBoard (marks: 0 none, 1 normal, 2 highlight, 3 crossed)
  function fromBoard(board) {
    const S = { values: new Int8Array(81), cands: new Uint16Array(81), given: board.map(c => !!c.given), auto: new Array(81).fill(false) };
    board.forEach((c, i) => {
      S.values[i] = c.value || 0;
      if (!c.value) {
        let m = 0;
        c.marks.forEach((k, j) => { if (k === 1 || k === 2) m |= BIT(j + 1); });
        S.cands[i] = m;
      }
    });
    // Empty cells with no marks at all get their candidates filled in from the placed digits.
    for (let i = 0; i < 81; i++) {
      if (S.values[i] || S.cands[i] || board[i].marks.some(k => k)) continue;
      let m = ALL;
      for (const p of PEERS[i]) if (S.values[p]) m &= ~BIT(S.values[p]);
      S.cands[i] = m;
      S.auto[i] = true;
    }
    return S;
  }

  function clone(S) {
    return { values: S.values.slice(), cands: S.cands.slice(), given: S.given, auto: S.auto };
  }

  function apply(S, st) {
    const T = clone(S);
    for (const { cell, d } of st.elim) T.cands[cell] &= ~BIT(d);
    for (const { cell, d } of st.place) {
      T.values[cell] = d; T.cands[cell] = 0;
      for (const p of PEERS[cell]) T.cands[p] &= ~BIT(d);
    }
    return T;
  }

  // ---- Full solve (for sanity checks) -------------------------------------------------
  function solveCount(values, limit = 2) {
    const v = Array.from(values);
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) if (v[i]) {
      const b = BIT(v[i]);
      if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & b) return { count: 0 };
      rows[rowOf(i)] |= b; cols[colOf(i)] |= b; boxes[boxOf(i)] |= b;
    }
    let count = 0, solution = null;
    (function rec() {
      if (count >= limit) return;
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) if (!v[i]) {
        const m = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
        const n = pc(m);
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!solution) solution = v.slice(); return; }
      for (const d of digits(bestMask)) {
        const b = BIT(d);
        v[best] = d; rows[rowOf(best)] |= b; cols[colOf(best)] |= b; boxes[boxOf(best)] |= b;
        rec();
        v[best] = 0; rows[rowOf(best)] &= ~b; cols[colOf(best)] &= ~b; boxes[boxOf(best)] &= ~b;
        if (count >= limit) return;
      }
    })();
    return { count, solution };
  }

  function check(S) {
    const issues = [];
    for (let u = 0; u < 27; u++) {
      for (let d = 1; d <= 9; d++) {
        const cells = UNITS[u].filter(i => S.values[i] === d);
        if (cells.length > 1) issues.push({ kind: 'error', cells, text: `${d} appears twice in ${unitName(u)} (${listNames(cells)}).` });
      }
    }
    for (let i = 0; i < 81; i++) if (!S.values[i] && !S.cands[i]) {
      issues.push({ kind: 'error', cells: [i], text: `${cellName(i)} is empty but has no candidates left.` });
    }
    const givens = S.values.map((v, i) => (S.given[i] ? v : 0));
    let res = solveCount(givens.some(Boolean) ? givens : S.values);
    if (res.count === 0 && givens.some(Boolean)) res = solveCount(S.values);
    let solution = null;
    if (res.count === 0) issues.push({ kind: 'error', cells: [], text: 'The digits on the board have no valid solution. Check that the screenshot was read correctly.' });
    else {
      solution = res.solution;
      if (res.count > 1) issues.push({ kind: 'warn', cells: [], text: 'The puzzle as read has more than one solution, so the uniqueness-based hints may not apply. Check the screenshot was read correctly.' });
      for (let i = 0; i < 81; i++) {
        if (S.values[i] && S.values[i] !== solution[i]) {
          issues.push({ kind: 'error', cells: [i], text: `${cellName(i)} is ${S.values[i]}, but the solution has ${solution[i]} there.` });
        } else if (!S.values[i] && S.cands[i] && !(S.cands[i] & BIT(solution[i]))) {
          issues.push({ kind: 'error', cells: [i], text: `${cellName(i)}: the correct digit has been removed from its candidates. Hints may lead you astray until that's fixed.`, cell: i, digit: solution[i] });
        }
      }
    }
    return { issues, solution };
  }

  // ---- Techniques ---------------------------------------------------------------------
  function cleanup(S) {
    for (let i = 0; i < 81; i++) {
      const v = S.values[i];
      if (!v) continue;
      const hit = PEERS[i].filter(p => has(S, p, v));
      if (hit.length) {
        return step({
          name: 'Leftover Candidates', focus: [i], units: UNITS_OF[i],
          elim: hit.map(cell => ({ cell, d: v })),
          nudge: `Some pencil marks clash with the ${v} in ${cellName(i)}.`,
          text: `${v} is already placed in ${cellName(i)}, so it can't go anywhere else in its row, column or box. Remove ${v} from ${listNames(hit)}.`,
        });
      }
    }
    return null;
  }

  function fullHouse(S) {
    for (let u = 0; u < 27; u++) {
      const empty = UNITS[u].filter(i => !S.values[i]);
      if (empty.length !== 1) continue;
      const missing = digits(ALL).find(d => !placedIn(S, u, d));
      const cell = empty[0];
      return step({
        name: 'Full House', units: [u], focus: [cell], place: [{ cell, d: missing }],
        nudge: `${unitName(u)[0].toUpperCase() + unitName(u).slice(1)} has only one empty cell left.`,
        text: `${cellName(cell)} is the last empty cell in ${unitName(u)}. The only digit missing there is ${missing}.`,
      });
    }
    return null;
  }

  function nakedSingle(S) {
    for (let i = 0; i < 81; i++) {
      if (S.values[i] || pc(S.cands[i]) !== 1) continue;
      const d = digits(S.cands[i])[0];
      return step({
        name: 'Naked Single', focus: [i], place: [{ cell: i, d }],
        nudge: `One cell has only a single candidate left.`,
        text: `${cellName(i)} has only one candidate left, ${d}. Place it.`,
      });
    }
    return null;
  }

  function hiddenSingle(S) {
    for (const u of [...Array(27).keys()].sort((a, b) => (b >= 18) - (a >= 18))) {
      for (let d = 1; d <= 9; d++) {
        if (placedIn(S, u, d)) continue;
        const pos = positions(S, u, d);
        if (pos.length !== 1) continue;
        return step({
          name: 'Hidden Single', units: [u], focus: pos, place: [{ cell: pos[0], d }],
          pattern: pos.map(cell => ({ cell, d })),
          nudge: `Look at where ${d} can go in ${unitName(u)}.`,
          text: `In ${unitName(u)}, ${d} can only go in ${cellName(pos[0])}. Every other cell there is filled or has ruled ${d} out. Place ${d} in ${cellName(pos[0])}.`,
        });
      }
    }
    return null;
  }

  function lockedCandidates(S) {
    // Pointing: within a box, all of d sits on one line.
    for (let b = 18; b < 27; b++) {
      for (let d = 1; d <= 9; d++) {
        const pos = positions(S, b, d);
        if (pos.length < 2) continue;
        for (const line of [UNITS_OF[pos[0]][0], UNITS_OF[pos[0]][1]]) {
          if (!pos.every(i => UNITS_OF[i].includes(line))) continue;
          const elim = UNITS[line].filter(i => !UNITS[b].includes(i) && has(S, i, d));
          if (!elim.length) continue;
          return step({
            name: 'Pointing', units: [b, line], focus: pos, pattern: pos.map(cell => ({ cell, d })),
            elim: elim.map(cell => ({ cell, d })),
            nudge: `In ${unitName(b)}, all the ${d}s line up.`,
            text: `In ${unitName(b)}, ${d} can only go in ${listNames(pos)}, which are all in ${unitName(line)}. So the ${d} for ${unitName(line)} must be inside ${unitName(b)}. Remove ${d} from ${listNames(elim)}.`,
          });
        }
      }
    }
    // Claiming: within a line, all of d sits in one box.
    for (let u = 0; u < 18; u++) {
      for (let d = 1; d <= 9; d++) {
        const pos = positions(S, u, d);
        if (pos.length < 2) continue;
        const b = UNITS_OF[pos[0]][2];
        if (!pos.every(i => UNITS_OF[i][2] === b)) continue;
        const elim = UNITS[b].filter(i => !UNITS[u].includes(i) && has(S, i, d));
        if (!elim.length) continue;
        return step({
          name: 'Claiming', units: [u, b], focus: pos, pattern: pos.map(cell => ({ cell, d })),
          elim: elim.map(cell => ({ cell, d })),
          nudge: `In ${unitName(u)}, every possible ${d} is inside one box.`,
          text: `In ${unitName(u)}, ${d} can only go in ${listNames(pos)}, all inside ${unitName(b)}. So the ${d} for ${unitName(b)} must be in ${unitName(u)}. Remove ${d} from ${listNames(elim)}.`,
        });
      }
    }
    return null;
  }

  const SUBSET_NAMES = { 2: 'Pair', 3: 'Triple', 4: 'Quad' };

  function nakedSubset(S, n) {
    for (let u = 0; u < 27; u++) {
      const empties = UNITS[u].filter(i => !S.values[i]);
      if (empties.length <= n) continue;
      const pool = empties.filter(i => pc(S.cands[i]) >= 1 && pc(S.cands[i]) <= n);
      for (const combo of combos(pool, n)) {
        const union = combo.reduce((m, i) => m | S.cands[i], 0);
        if (pc(union) !== n) continue;
        const shared = UNITS_OF[combo[0]].filter(v => combo.every(i => UNITS_OF[i].includes(v)));
        const elim = [];
        for (const v of shared) for (const i of UNITS[v]) {
          if (combo.includes(i) || S.values[i]) continue;
          for (const d of digits(S.cands[i] & union)) if (!elim.some(e => e.cell === i && e.d === d)) elim.push({ cell: i, d });
        }
        if (!elim.length) continue;
        const ds = digits(union);
        return step({
          name: `Naked ${SUBSET_NAMES[n]}`, units: shared, focus: combo,
          pattern: combo.flatMap(cell => digits(S.cands[cell]).map(d => ({ cell, d }))), elim,
          nudge: `In ${unitName(u)}, ${n} cells share the same ${n} candidates.`,
          text: `${listNames(combo)} only contain ${fmtDigits(ds)} between them. Those ${n} digits must fill those ${n} cells, so they can't go anywhere else in ${shared.map(unitName).join(' or ')}. Remove them from ${listNames([...new Set(elim.map(e => e.cell))])}.`,
        });
      }
    }
    return null;
  }

  function hiddenSubset(S, n) {
    for (let u = 0; u < 27; u++) {
      const open = digits(ALL).filter(d => !placedIn(S, u, d));
      if (open.length <= n) continue;
      const pool = open.filter(d => { const k = positions(S, u, d).length; return k >= 1 && k <= n; });
      for (const ds of combos(pool, n)) {
        const cells = [...new Set(ds.flatMap(d => positions(S, u, d)))];
        if (cells.length !== n) continue;
        const keep = ds.reduce((m, d) => m | BIT(d), 0);
        const elim = cells.flatMap(cell => digits(S.cands[cell] & ~keep).map(d => ({ cell, d })));
        if (!elim.length) continue;
        return step({
          name: `Hidden ${SUBSET_NAMES[n]}`, units: [u], focus: cells,
          pattern: cells.flatMap(cell => ds.filter(d => has(S, cell, d)).map(d => ({ cell, d }))), elim,
          nudge: `In ${unitName(u)}, ${n} digits are confined to the same ${n} cells.`,
          text: `In ${unitName(u)}, ${fmtDigits(ds)} can only go in ${listNames(cells)}. Those cells must hold exactly those digits, so every other candidate in them can go.`,
        });
      }
    }
    return null;
  }

  const FISH_NAMES = { 2: 'X-Wing', 3: 'Swordfish', 4: 'Jellyfish' };

  function fish(S, n) {
    for (let d = 1; d <= 9; d++) {
      for (const byRow of [true, false]) {
        const base = [];
        for (let k = 0; k < 9; k++) {
          const u = byRow ? k : 9 + k;
          if (placedIn(S, u, d)) continue;
          const pos = positions(S, u, d);
          if (pos.length >= 2 && pos.length <= n) base.push({ u, pos });
        }
        for (const combo of combos(base, n)) {
          const cover = new Set();
          for (const b of combo) for (const i of b.pos) cover.add(byRow ? colOf(i) : rowOf(i));
          if (cover.size !== n) continue;
          const baseUnits = combo.map(b => b.u);
          const coverUnits = [...cover].map(k => (byRow ? 9 + k : k));
          const elim = [];
          for (const cu of coverUnits) for (const i of UNITS[cu]) {
            if (has(S, i, d) && !baseUnits.includes(UNITS_OF[i][byRow ? 0 : 1])) elim.push({ cell: i, d });
          }
          if (!elim.length) continue;
          const cells = combo.flatMap(b => b.pos);
          const kind = byRow ? 'rows' : 'columns', other = byRow ? 'columns' : 'rows';
          return step({
            name: FISH_NAMES[n], units: baseUnits.concat(coverUnits), focus: cells,
            pattern: cells.map(cell => ({ cell, d })), elim,
            nudge: `Look at where ${d} can go in each of the ${kind}.`,
            text: `In ${baseUnits.map(unitName).join(', ')}, ${d} can only go in ${n} ${other} (${coverUnits.map(u => (u % 9) + 1).join(', ')}). Those ${n} ${kind} need ${n} different ${d}s, and they will use up those ${n} ${other}. Remove ${d} from the rest of those ${other}: ${listNames(elim.map(e => e.cell))}.`,
          });
        }
      }
    }
    return null;
  }

  function strongLinks(S, d) {
    const links = [];
    for (let u = 0; u < 27; u++) {
      const pos = positions(S, u, d);
      if (pos.length === 2 && !links.some(l => l.a === pos[0] && l.b === pos[1])) links.push({ a: pos[0], b: pos[1], u });
    }
    return links;
  }

  function singleDigitLinks(S) {
    let best = null;
    for (let d = 1; d <= 9; d++) {
      const links = strongLinks(S, d);
      for (let x = 0; x < links.length; x++) for (let y = x + 1; y < links.length; y++) {
        const L1 = links[x], L2 = links[y];
        if ([L1.a, L1.b].some(c => c === L2.a || c === L2.b)) continue;
        for (const [a1, a2] of [[L1.a, L1.b], [L1.b, L1.a]]) for (const [b1, b2] of [[L2.a, L2.b], [L2.b, L2.a]]) {
          if (!sees(a1, b1) || sees(a2, b2)) continue;
          const elim = commonPeers(S, [a2, b2], d);
          if (!elim.length) continue;
          const k1 = unitKind(L1.u), k2 = unitKind(L2.u);
          let name = 'Turbot Fish', rank = 2;
          if (k1 === k2 && k1 !== 'box') { name = 'Skyscraper'; rank = 0; }
          else if (k1 !== 'box' && k2 !== 'box' && boxOf(a1) === boxOf(b1)) { name = '2-String Kite'; rank = 1; }
          if (best && best.rank <= rank) continue;
          best = { rank, st: step({
            name, units: [L1.u, L2.u], focus: [a1, a2, b1, b2], pattern: [a1, a2, b1, b2].map(cell => ({ cell, d })),
            elim: elim.map(cell => ({ cell, d })),
            nudge: `Look for two places where ${d} has only two spots, joined at one end.`,
            text: `In ${unitName(L1.u)}, ${d} is either in ${cellName(a1)} or ${cellName(a2)}. In ${unitName(L2.u)}, it is either in ${cellName(b1)} or ${cellName(b2)}. ${cellName(a1)} and ${cellName(b1)} see each other, so they can't both be ${d}. That means at least one of ${cellName(a2)} or ${cellName(b2)} is ${d}. Remove ${d} from cells that see both: ${listNames(elim)}.`,
          }) };
        }
      }
    }
    return best && best.st;
  }

  const bivalues = S => [...Array(81).keys()].filter(i => !S.values[i] && pc(S.cands[i]) === 2);

  function xyWing(S) {
    for (const p of bivalues(S)) {
      const [x, y] = digits(S.cands[p]);
      const wings = PEERS[p].filter(i => !S.values[i] && pc(S.cands[i]) === 2);
      for (const [A, B] of combos(wings, 2)) {
        for (const [ax, by] of [[x, y], [y, x]]) {
          if (!(S.cands[A] & BIT(ax)) || (S.cands[A] & BIT(by))) continue;
          if (!(S.cands[B] & BIT(by)) || (S.cands[B] & BIT(ax))) continue;
          const zA = digits(S.cands[A] & ~BIT(ax))[0], zB = digits(S.cands[B] & ~BIT(by))[0];
          if (zA !== zB) continue;
          const z = zA;
          const elim = commonPeers(S, [A, B], z).filter(i => i !== p);
          if (!elim.length) continue;
          return step({
            name: 'XY-Wing', focus: [p, A, B],
            pattern: [{ cell: p, d: x }, { cell: p, d: y }, { cell: A, d: ax }, { cell: A, d: z }, { cell: B, d: by }, { cell: B, d: z }],
            elim: elim.map(cell => ({ cell, d: z })),
            nudge: `Look for three two-candidate cells forming a bent chain around ${cellName(p)}.`,
            text: `${cellName(p)} is ${x} or ${y}. If it's ${ax}, then ${cellName(A)} must be ${z}. If it's ${by}, then ${cellName(B)} must be ${z}. Either way one of ${cellName(A)} or ${cellName(B)} is ${z}, so remove ${z} from cells that see both: ${listNames(elim)}.`,
          });
        }
      }
    }
    return null;
  }

  function xyzWing(S) {
    for (let p = 0; p < 81; p++) {
      if (S.values[p] || pc(S.cands[p]) !== 3) continue;
      const wings = PEERS[p].filter(i => !S.values[i] && pc(S.cands[i]) === 2 && (S.cands[i] & ~S.cands[p]) === 0);
      for (const [A, B] of combos(wings, 2)) {
        if (S.cands[A] === S.cands[B] || (S.cands[A] | S.cands[B]) !== S.cands[p]) continue;
        const z = digits(S.cands[A] & S.cands[B])[0];
        const elim = commonPeers(S, [p, A, B], z);
        if (!elim.length) continue;
        return step({
          name: 'XYZ-Wing', focus: [p, A, B],
          pattern: [p, A, B].flatMap(cell => digits(S.cands[cell]).map(d => ({ cell, d }))),
          elim: elim.map(cell => ({ cell, d: z })),
          nudge: `Look at the three-candidate cell ${cellName(p)} and two two-candidate cells it sees.`,
          text: `${cellName(p)} (${fmtDigits(digits(S.cands[p]))}), ${cellName(A)} and ${cellName(B)} share three digits between them. Whatever ${cellName(p)} turns out to be, one of the three cells must be ${z}. Remove ${z} from cells that see all three: ${listNames(elim)}.`,
        });
      }
    }
    return null;
  }

  function wWing(S) {
    const bv = bivalues(S);
    for (const [c1, c2] of combos(bv, 2)) {
      if (S.cands[c1] !== S.cands[c2] || sees(c1, c2)) continue;
      const [p, q] = digits(S.cands[c1]);
      for (const [x, y] of [[p, q], [q, p]]) {
        for (const L of strongLinks(S, x)) {
          for (const [s1, s2] of [[L.a, L.b], [L.b, L.a]]) {
            if ([c1, c2].includes(s1) || [c1, c2].includes(s2) || !sees(s1, c1) || !sees(s2, c2)) continue;
            const elim = commonPeers(S, [c1, c2], y);
            if (!elim.length) continue;
            return step({
              name: 'W-Wing', units: [L.u], focus: [c1, c2, s1, s2],
              pattern: [{ cell: c1, d: x }, { cell: c1, d: y }, { cell: c2, d: x }, { cell: c2, d: y }, { cell: s1, d: x }, { cell: s2, d: x }],
              elim: elim.map(cell => ({ cell, d: y })),
              nudge: `Two cells far apart both hold exactly ${p} and ${q}.`,
              text: `${cellName(c1)} and ${cellName(c2)} are both ${x}/${y}. In ${unitName(L.u)}, ${x} must be in ${cellName(s1)} or ${cellName(s2)}, and those see ${cellName(c1)} and ${cellName(c2)} respectively. So the two cells can't both be ${x}, meaning one of them is ${y}. Remove ${y} from cells that see both: ${listNames(elim)}.`,
            });
          }
        }
      }
    }
    return null;
  }

  function uniqueRectangle(S) {
    for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++)
      for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
        const sameBandRows = ((r1 / 3) | 0) === ((r2 / 3) | 0), sameBandCols = ((c1 / 3) | 0) === ((c2 / 3) | 0);
        if (sameBandRows === sameBandCols) continue;
        const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
        if (cells.some(i => S.values[i])) continue;
        const pairs = cells.filter(i => pc(S.cands[i]) === 2);
        if (pairs.length !== 3 || !pairs.every(i => S.cands[i] === S.cands[pairs[0]])) continue;
        const m = S.cands[pairs[0]];
        const odd = cells.find(i => !pairs.includes(i));
        if ((S.cands[odd] & m) !== m) continue;
        const [a, b] = digits(m);
        return step({
          name: 'Unique Rectangle', focus: cells, pattern: pairs.flatMap(cell => [{ cell, d: a }, { cell, d: b }]),
          elim: [{ cell: odd, d: a }, { cell: odd, d: b }],
          nudge: `Four cells in a rectangle nearly all hold just ${a} and ${b}.`,
          text: `${listNames(pairs)} are all ${a}/${b}. If ${cellName(odd)} were also ${a} or ${b}, the four corners could swap ${a} and ${b} and the puzzle would have two solutions. A proper puzzle has only one, so remove ${a} and ${b} from ${cellName(odd)}.`,
        });
      }
    return null;
  }

  function simpleColoring(S) {
    for (let d = 1; d <= 9; d++) {
      const links = strongLinks(S, d);
      const adj = new Map();
      for (const L of links) {
        if (!adj.has(L.a)) adj.set(L.a, []); if (!adj.has(L.b)) adj.set(L.b, []);
        adj.get(L.a).push(L.b); adj.get(L.b).push(L.a);
      }
      const seen = new Set();
      for (const start of adj.keys()) {
        if (seen.has(start)) continue;
        const color = new Map([[start, 0]]);
        const queue = [start];
        seen.add(start);
        while (queue.length) {
          const c = queue.shift();
          for (const n of adj.get(c)) if (!color.has(n)) { color.set(n, 1 - color.get(c)); seen.add(n); queue.push(n); }
        }
        if (color.size < 4) continue;
        const groups = [[], []];
        for (const [c, k] of color) groups[k].push(c);
        const pattern = [...color].map(([cell, k]) => ({ cell, d, color: k }));
        // Colour wrap: one colour sees itself, so that colour is false.
        for (const k of [0, 1]) {
          const clash = [...combos(groups[k], 2)].find(([a, b]) => sees(a, b));
          if (clash) {
            return step({
              name: 'Simple Coloring (wrap)', focus: [...color.keys()], pattern,
              elim: groups[k].map(cell => ({ cell, d })),
              nudge: `Follow the chain of cells where ${d} has exactly two spots.`,
              text: `Colour the cells of the ${d}-chain in two alternating colours: one colour is all ${d}, the other is not. ${cellName(clash[0])} and ${cellName(clash[1])} have the same colour and see each other, so that colour can't be ${d}. Remove ${d} from ${listNames(groups[k])}.`,
            });
          }
        }
        // Colour trap: an outside cell sees both colours.
        const elim = [];
        for (let i = 0; i < 81; i++) {
          if (!has(S, i, d) || color.has(i)) continue;
          if (groups[0].some(c => sees(i, c)) && groups[1].some(c => sees(i, c))) elim.push(i);
        }
        if (elim.length) {
          return step({
            name: 'Simple Coloring (trap)', focus: [...color.keys()], pattern,
            elim: elim.map(cell => ({ cell, d })),
            nudge: `Follow the chain of cells where ${d} has exactly two spots.`,
            text: `Colour the cells of the ${d}-chain in two alternating colours: one colour is all ${d}, the other is not. ${listNames(elim)} see${elim.length === 1 ? 's' : ''} both colours, so ${d} goes in a cell it sees either way. Remove ${d} from ${listNames(elim)}.`,
          });
        }
      }
    }
    return null;
  }

  function bugPlusOne(S) {
    let odd = -1;
    for (let i = 0; i < 81; i++) {
      if (S.values[i]) continue;
      const n = pc(S.cands[i]);
      if (n === 2) continue;
      if (n !== 3 || odd >= 0) return null;
      odd = i;
    }
    if (odd < 0) return null;
    const d = digits(S.cands[odd]).find(x => positions(S, rowOf(odd), x).length === 3);
    if (!d) return null;
    return step({
      name: 'BUG+1', focus: [odd], place: [{ cell: odd, d }],
      nudge: `Every empty cell but one has exactly two candidates.`,
      text: `All unsolved cells except ${cellName(odd)} have two candidates. If ${cellName(odd)} weren't ${d}, the whole board would be pairs, and a board like that has more than one solution. So ${cellName(odd)} is ${d}.`,
    });
  }

  function xyChain(S) {
    const bv = bivalues(S);
    const other = (i, d) => digits(S.cands[i] & ~BIT(d))[0];
    let best = null;
    for (const s of bv) for (const z of digits(S.cands[s])) {
      // BFS over (cell, value it is forced to take); start: s is not z, so s = other(s,z).
      const startVal = other(s, z);
      const prev = new Map();
      const key = (c, v) => c * 10 + v;
      prev.set(key(s, startVal), null);
      let frontier = [[s, startVal]];
      for (let depth = 1; depth <= 8 && frontier.length; depth++) {
        const next = [];
        for (const [c, v] of frontier) {
          for (const n of PEERS[c]) {
            if (S.values[n] || pc(S.cands[n]) !== 2 || !(S.cands[n] & BIT(v))) continue;
            const nv = other(n, v);
            const k = key(n, nv);
            if (prev.has(k) || n === s) continue;
            prev.set(k, key(c, v));
            if (nv === z && depth >= 2) {
              const elim = commonPeers(S, [s, n], z);
              if (elim.length) {
                const chain = [];
                for (let p = k; p !== null; p = prev.get(p)) chain.unshift({ cell: (p / 10) | 0, v: p % 10 });
                if (!best || chain.length < best.chain.length) best = { chain, z, s, e: n, elim };
              }
            }
            next.push([n, nv]);
          }
        }
        frontier = next;
        if (best && best.chain.length <= depth + 1) break;
      }
    }
    if (!best) return null;
    const { chain, z, s, e, elim } = best;
    const cells = chain.map(x => x.cell);
    const walk = chain.map((x, k) => (k === 0 ? `if ${cellName(x.cell)} isn't ${z} it's ${x.v}` : `${cellName(x.cell)} is ${x.v}`)).join(' → ');
    return step({
      name: 'XY-Chain', focus: cells, pattern: cells.flatMap(cell => digits(S.cands[cell]).map(d => ({ cell, d }))),
      elim: elim.map(cell => ({ cell, d: z })),
      nudge: `Follow a chain of two-candidate cells that starts and ends with ${z}.`,
      text: `Follow the chain: ${walk}. So either ${cellName(s)} or ${cellName(e)} is ${z}. Remove ${z} from cells that see both: ${listNames(elim)}.`,
    });
  }

  // Assume a candidate and follow singles until something breaks.
  function propagate(S0, cell, d) {
    const S = clone(S0);
    const log = [];
    const assign = (i, v, why) => {
      S.values[i] = v; S.cands[i] = 0;
      log.push(`${cellName(i)} = ${v}${why ? ' (' + why + ')' : ''}`);
      for (const p of PEERS[i]) if (!S.values[p]) {
        S.cands[p] &= ~BIT(v);
        if (!S.cands[p]) return `${cellName(p)} would have no candidates left`;
      }
      return null;
    };
    let bad = assign(cell, d, '');
    for (let guard = 0; !bad && guard < 81; guard++) {
      let progressed = false;
      for (let i = 0; i < 81 && !bad; i++) if (!S.values[i] && pc(S.cands[i]) === 1) {
        bad = assign(i, digits(S.cands[i])[0], 'only candidate'); progressed = true; break;
      }
      if (bad || progressed) continue;
      for (let u = 0; u < 27 && !bad && !progressed; u++) for (let v = 1; v <= 9; v++) {
        if (placedIn(S, u, v)) continue;
        const pos = positions(S, u, v);
        if (pos.length === 0) { bad = `${unitName(u)} would have nowhere for ${v}`; break; }
        if (pos.length === 1) { bad = assign(pos[0], v, `only spot in ${unitName(u)}`); progressed = true; break; }
      }
      if (!progressed) break;
    }
    return { bad, log };
  }

  function contradiction(S) {
    let best = null;
    const order = [...Array(81).keys()].filter(i => !S.values[i]).sort((a, b) => pc(S.cands[a]) - pc(S.cands[b]));
    for (const i of order) for (const d of digits(S.cands[i])) {
      const res = propagate(S, i, d);
      if (res.bad && (!best || res.log.length < best.log.length)) best = { cell: i, d, ...res };
    }
    if (!best) return null;
    const shown = best.log.length > 10 ? best.log.slice(0, 10).concat(['…']) : best.log;
    return step({
      name: 'Contradiction Chain', focus: [best.cell], pattern: [{ cell: best.cell, d: best.d }],
      elim: [{ cell: best.cell, d: best.d }],
      nudge: `Try assuming ${best.d} in ${cellName(best.cell)} and follow the consequences.`,
      text: `Suppose ${cellName(best.cell)} were ${best.d}: ${shown.join(' → ')}. Then ${best.bad}. So ${cellName(best.cell)} can't be ${best.d}.`,
    });
  }

  const TECHNIQUES = [
    cleanup, fullHouse, nakedSingle, hiddenSingle, lockedCandidates,
    S => nakedSubset(S, 2), S => hiddenSubset(S, 2), S => nakedSubset(S, 3), S => hiddenSubset(S, 3),
    S => fish(S, 2), singleDigitLinks, xyWing, xyzWing, wWing,
    S => nakedSubset(S, 4), S => hiddenSubset(S, 4), S => fish(S, 3), uniqueRectangle,
    simpleColoring, S => fish(S, 4), bugPlusOne, xyChain, contradiction,
  ];

  function nextStep(S, solution) {
    for (const t of TECHNIQUES) {
      const st = t(S);
      if (st) return st;
    }
    if (solution) {
      const empty = [...Array(81).keys()].filter(i => !S.values[i]).sort((a, b) => pc(S.cands[a]) - pc(S.cands[b]));
      if (empty.length) {
        const cell = empty[0];
        return step({
          name: 'Reveal', focus: [cell], place: [{ cell, d: solution[cell] }],
          nudge: `None of the techniques I know apply here.`,
          text: `None of the techniques I know make progress from these pencil marks. From the full solution, ${cellName(cell)} is ${solution[cell]}.`,
        });
      }
    }
    return null;
  }

  root.GSSolver = { fromBoard, clone, apply, check, nextStep, solveCount, cellName, unitName, UNITS, rowOf, colOf, boxOf, digits, BIT };
})(typeof window !== 'undefined' ? window : globalThis);
