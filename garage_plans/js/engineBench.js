'use strict';
/* ============================================================
   WORKBENCH: defaults, geometry, fasteners, engineering checks

   Coordinates (mm): x = along the bench (0 = left end of the FRAME)
                     y = depth (0 = BACK face of frame, Df = FRONT face)
                     z = height above floor
   Construction (single posts):
   - Posts at the corners + optional interior leg pairs (front + back post).
   - Top frame: long rails on the outside of front/back posts, end rails on the
     outside of the end posts, cross rail beside each interior pair, joists between.
   - Shelf levels: long rails on the outside of posts, cross rails on the inside
     faces of the posts of each bay; boards sit between the posts (no notching).
   - Everything is screwed to the post faces; the screws are checked.
   ============================================================ */

function defaultBenchDesign() {
  return {
    type: 'bench', id: uid('prj'), version: 2,
    name: 'Workbench',
    L: 1800, Dp: 750, H: 900, ohX: 30, ohY: 30,
    grade: 'C18', serviceClass: 2, deflLimit: 200,
    roles: { post: 'p95x95', rail: 'p45x95', joist: 'p45x95', srail: 'p45x95', strip: 'p45x45' },
    legOrient: 'wideX',
    topLayers: ['osb22'], topGlued: false,
    shelfSheetId: 'osb18', panelSheetId: 'osb12',
    pairs: [{ id: uid('lp'), x: 720 }],
    joistMax: 400, shelfJoistMax: 600,
    joistSupport: 'hanger',
    levels: [
      { id: uid('lv'), z: 300, load: 100, bays: 'all', rails: true },
      { id: uid('lv'), z: 540, load: 40, bays: ['E0'], rails: false },
    ],
    panels: { back: false, left: false, right: false },
    loads: { top: 150, point: 1.0, lateral: 400 },
    rules: {
      railLeg: { items: [{ type: 'f6x100w', n: 4 }] },
      railCorner: { items: [{ type: 'f5x80', n: 2 }] },
      joistScrew: { items: [{ type: 'f5x80', n: 2 }] },
      joistHanger: { items: [{ type: 'hanger45', n: 1 }, { type: 'nail4x40', n: 8 }] },
      stripRail: { items: [{ type: 'f5x80', n: 1 }], spacing: 150, edge: 40 },
      topScrews: { items: [{ type: 'f4x50', n: 1 }], spacing: 200, edge: 50 },
      shelfScrews: { items: [{ type: 'f4x40', n: 1 }], spacing: 250, edge: 50 },
      panelScrews: { items: [{ type: 'f4x40', n: 1 }], spacing: 200, edge: 50 },
      foot: { items: [{ type: 'caster100', n: 1 }, { type: 'f6x40', n: 4 }] },
    },
    overrides: {}, manual: [], extras: [],
    cut: { kerf: 3, trim: 5, minOffcut: 300 },
    snap: 5,
  };
}

const BENCH_RULES = {
  railLeg: { label: 'Rail → post (per rail end / crossing)', spaced: false,
    help: 'Screws through the rail into the post. They carry the weight in shear AND stop the bench racking sideways, so they are checked.' },
  railCorner: { label: 'Top frame corner (long rail → end rail)', spaced: false,
    help: 'Through the long rail into the end of the end rail. Holds the corner together.' },
  joistScrew: { label: 'Joist end → rail (per joist end)', spaced: false, when: (d) => d.joistSupport !== 'hanger',
    help: 'Through the rail into the joist end. End grain holds only ⅓ as well, so with "screwed" joists these carry the load and are checked.' },
  joistHanger: { label: 'Joist hanger (per joist end)', spaced: false, when: (d) => d.joistSupport === 'hanger',
    help: 'Steel joist hanger (bjælkesko), fully nailed/screwed. Capacity from the catalog.' },
  stripRail: { label: 'Support strip → rail (along strip)', spaced: true, when: (d) => d.joistSupport === 'strip',
    help: 'The strip under the joist ends is screwed to the rail. The joists rest on it.' },
  topScrews: { label: 'Top → frame (along every rail and joist, per layer)', spaced: true,
    help: 'Screw the top down to every rail and joist. This also makes the frame stiff. Countersink the heads.' },
  shelfScrews: { label: 'Shelf board → supports', spaced: true, help: 'Along every rail / cross rail / joist under a shelf board.' },
  panelScrews: { label: 'Panel → posts / rails (along edges)', spaced: true, when: (d) => d.panels.back || d.panels.left || d.panels.right,
    help: 'Panels brace the bench against racking. Their screws carry that force, so give them a capacity in the catalog to check them.' },
  foot: { label: 'Caster / foot (per leg)', spaced: false,
    help: 'The caster/foot item sets the bench height and the load rating. Add its plate screws. Click a leg\'s marker to use e.g. braked casters on 2 legs only.' },
};

function levelsSorted() { return [...(S.design.levels || [])].sort((a, b) => b.z - a.z); }
function levelLabel(id) {
  if (id === 'top') return 'Top';
  const i = levelsSorted().findIndex(l => l.id === id);
  return i < 0 ? '?' : 'Shelf ' + (i + 1);
}

function footOf(items) {
  let h = 0, f = null;
  for (const it of items || []) {
    const ft = fastener(it.type);
    if (ft && it.n && (ft.kind === 'caster' || ft.kind === 'foot') && (ft.height || 0) >= h) { h = +ft.height || 0; f = ft; }
  }
  return { h, f };
}

function benchFrame(d) {
  const pP = profile(d.roles.post), pR = profile(d.roles.rail), pJ = profile(d.roles.joist), pS = profile(d.roles.srail), pT = profile(d.roles.strip);
  const dx = d.legOrient === 'wideX' ? pP.h : pP.t, dy = d.legOrient === 'wideX' ? pP.t : pP.h;
  const layers = d.topLayers.map(id => sheetDef(id));
  const topT = layers.reduce((a, s) => a + s.t, 0);
  const Lf = d.L - 2 * d.ohX, Df = d.Dp - 2 * d.ohY;
  const rt = pR.t;
  const zF = d.H - topT;
  const foot = footOf(d.rules.foot.items);
  const shS = sheetDef(d.shelfSheetId), shP = sheetDef(d.panelSheetId);
  const needPad = !!(foot.f && foot.f.kind === 'caster' && Math.min(dx, dy) < 70);
  const padT = needPad ? shS.t : 0;
  const z0 = foot.h + padT;
  const interior = [...d.pairs].sort((a, b) => a.x - b.x);
  const pairs = [{ id: 'E0', x: rt + dx / 2, end: true },
    ...interior.map(p => ({ id: p.id, x: p.x, end: false, ref: p })),
    { id: 'E1', x: Lf - rt - dx / 2, end: true }];
  const bays = [];
  for (let i = 0; i < pairs.length - 1; i++)
    bays.push({ key: pairs[i].id, i, a: pairs[i], b: pairs[i + 1], x0: pairs[i].x + dx / 2, x1: pairs[i + 1].x - dx / 2 });
  return { pP, pR, pJ, pS, pT, dx, dy, layers, topT, Lf, Df, rt, zF, foot, shS, shP, needPad, padT, z0, pairs, bays };
}

function levelBays(lv, F) {
  if (lv.bays === 'all') return F.bays.map(b => b.key);
  return lv.bays.filter(k => F.bays.some(b => b.key === k));
}

function buildBenchModel() {
  const d = S.design;
  const F = benchFrame(d);
  const { pP, pR, pJ, pS, pT, dx, dy, layers, topT, Lf, Df, rt, zF, foot, shS, shP, needPad, padT, z0, pairs, bays } = F;
  const trim = d.cut.trim;
  const members = [], sheets = [], joints = [], issues = [], feet = [];
  const issue = (level, msg) => issues.push({ level, msg });
  const add = (m) => { members.push(m); return m; };
  const J = (id, rule, x, y, z, extra = {}) => {
    const ov = d.overrides[id];
    if (ov && ov.deleted) return null;
    const items = ov && ov.items ? ov.items : d.rules[rule].items;
    const j = { id, rule, x, y, z, items, ov: !!ov, ...extra };
    joints.push(j); return j;
  };
  const spaced = (len, rule) => {
    const r = d.rules[rule]; const e = Math.min(r.edge, len / 2);
    const n = Math.max(2, Math.ceil((len - 2 * e) / Math.max(50, r.spacing)) + 1);
    return Array.from({ length: n }, (_, k) => e + (len - 2 * e) * k / (n - 1));
  };
  const yPost = { B: [rt, rt + dy], F: [Df - rt - dy, Df - rt] };
  const yPostC = { B: rt + dy / 2, F: Df - rt - dy / 2 };

  if (Lf < 300 || Df < 250) issue('error', 'The frame is too small. Check length/depth against the overhangs.');

  /* ---------- posts + feet ---------- */
  for (const p of pairs) for (const s of ['B', 'F']) {
    add({ id: `post:${p.id}:${s}`, role: 'post', prof: pP, x0: p.x - dx / 2, x1: p.x + dx / 2, y0: yPost[s][0], y1: yPost[s][1], z0, z1: zF, axis: 'z', where: 'legs' });
    const fj = J(`ft:${p.id}:${s}`, 'foot', p.x, yPostC[s], foot.h / 2, { level: 'floor', postKey: `${p.id}:${s}` });
    const ff = fj ? footOf(fj.items) : { h: 0, f: null };
    if (ff.f) feet.push({ x: p.x, y: yPostC[s], h: ff.h, kind: ff.f.kind });
    if (needPad) sheets.push({ id: `pad:${p.id}:${s}`, role: 'pad', sheetId: shS.id, x0: p.x - 60, x1: p.x + 60, y0: yPostC[s] - 60, y1: yPostC[s] + 60, z0: foot.h, z1: foot.h + padT, w: 120, dpt: 120, where: 'under legs' });
  }

  /* ---------- top frame ---------- */
  const zr0 = zF - pR.h;
  const maxR = maxUsable(pR, trim);
  const topLong = splitAt(Lf, maxR, pairs.map(p => p.x));
  if (!topLong.ok) issue('error', `Top rails are longer than your longest ${pR.name} and there is no leg to join them on. Add a leg pair or a longer stock length.`);
  for (const s of ['B', 'F']) topLong.pieces.forEach(([a, b], i) => add({ id: `rail:${s}:${i}`, role: 'rail', prof: pR,
    x0: a, x1: b, y0: s === 'B' ? 0 : Df - rt, y1: s === 'B' ? rt : Df, z0: zr0, z1: zF, axis: 'x', where: 'top frame', side: s }));
  add({ id: 'endrail:L', role: 'endrail', prof: pR, x0: 0, x1: rt, y0: rt, y1: Df - rt, z0: zr0, z1: zF, axis: 'y', where: 'top frame' });
  add({ id: 'endrail:R', role: 'endrail', prof: pR, x0: Lf - rt, x1: Lf, y0: rt, y1: Df - rt, z0: zr0, z1: zF, axis: 'y', where: 'top frame' });
  const topLines = [{ x: rt / 2, kind: 'end' }, { x: Lf - rt / 2, kind: 'end' }];
  for (const p of pairs.filter(p => !p.end)) {
    add({ id: `topcross:${p.id}`, role: 'topcross', prof: pR, x0: p.x - dx / 2 - pR.t, x1: p.x - dx / 2, y0: rt, y1: Df - rt, z0: zr0, z1: zF, axis: 'y', where: 'top frame' });
    topLines.push({ x: p.x - dx / 2 - pR.t / 2, kind: 'cross', pairId: p.id });
  }
  // joists
  const joistsTop = [];
  for (const bay of bays) {
    const L0 = bay.a.end ? rt / 2 : bay.a.x - dx / 2 - pR.t / 2;
    const R0 = bay.b.end ? Lf - rt / 2 : bay.b.x - dx / 2 - pR.t / 2;
    const span = R0 - L0;
    const n = Math.max(0, Math.ceil(span / Math.max(100, d.joistMax)) - 1);
    const lo = bay.a.x + dx / 2 + pJ.t / 2, hi = (bay.b.end ? bay.b.x - dx / 2 : bay.b.x - dx / 2 - pR.t) - pJ.t / 2;
    for (let k = 1; k <= n; k++) {
      let x = Math.round(L0 + span * k / (n + 1));
      x = Math.min(Math.max(x, lo), hi);
      joistsTop.push({ x, bay: bay.key, k });
      topLines.push({ x, kind: 'joist' });
      add({ id: `joist:top:${bay.key}:${k}`, role: 'joist', prof: pJ, x0: x - pJ.t / 2, x1: x + pJ.t / 2, y0: rt, y1: Df - rt, z0: zF - pJ.h, z1: zF, axis: 'y', where: 'top frame' });
    }
    if (d.joistSupport === 'strip' && n > 0) {
      const xa = bay.a.x + dx / 2, xb = bay.b.end ? bay.b.x - dx / 2 : bay.b.x - dx / 2 - pR.t;
      for (const s of ['B', 'F']) {
        const y0 = s === 'B' ? rt : Df - rt - pT.t;
        add({ id: `strip:${bay.key}:${s}`, role: 'strip', prof: pT, x0: xa, x1: xb, y0, y1: y0 + pT.t, z0: zF - pJ.h - pT.h, z1: zF - pJ.h, axis: 'x', where: 'top frame' });
        spaced(xb - xa, 'stripRail').forEach((u, k) => J(`sr:${bay.key}:${s}:${k}`, 'stripRail', xa + u, s === 'B' ? rt : Df - rt, zF - pJ.h - pT.h / 2, { level: 'top' }));
      }
    }
  }
  if (pJ.h > pR.h) issue('warn', `Joists (${pJ.h} mm) are taller than the rails (${pR.h} mm) and will hang below them.`);
  if (d.joistSupport === 'strip' && joistsTop.length && pR.h < pJ.h + pT.h) issue('error', `Support strip doesn't fit: rail height ${pR.h} must be ≥ joist height ${pJ.h} + strip height ${pT.h}. Use a taller rail, a lower joist, or hangers.`);
  topLines.sort((a, b) => a.x - b.x);

  /* top frame joints */
  for (const p of pairs) for (const s of ['B', 'F']) {
    const y = s === 'B' ? 0 : Df;
    const spliced = topLong.pieces.some(([a]) => Math.abs(a - p.x) < 0.5);
    for (const sd of spliced ? ['L', 'R'] : ['M'])
      J(`rl:top:${s}:${p.id}:${sd}`, 'railLeg', p.x + (sd === 'L' ? -dx / 4 : sd === 'R' ? dx / 4 : 0), y, zr0 + pR.h / 2, { level: 'top', dir: 'x', postKey: `${p.id}:${s}`, side: sd, rail: 'top' });
    if (p.end) J(`rl:top:E:${p.id}:${s}`, 'railLeg', p.id === 'E0' ? 0 : Lf, yPostC[s], zr0 + pR.h / 2, { level: 'top', dir: 'y', postKey: `${p.id}:${s}`, rail: 'top' });
    else J(`rl:top:X:${p.id}:${s}`, 'railLeg', p.x - dx / 2 - pR.t / 2, yPostC[s], zr0 + pR.h / 2, { level: 'top', dir: 'y', postKey: `${p.id}:${s}`, rail: 'top' });
  }
  for (const [c, x, y] of [['BL', 0, 0], ['BR', Lf, 0], ['FL', 0, Df], ['FR', Lf, Df]])
    J(`rc:${c}`, 'railCorner', x + (x ? -rt / 2 : rt / 2), y, zr0 + pR.h / 2, { level: 'top' });
  for (const j of joistsTop) for (const s of ['B', 'F']) {
    const rule = d.joistSupport === 'hanger' ? 'joistHanger' : 'joistScrew';
    J(`je:top:${j.bay}:${j.k}:${s}`, rule, j.x, s === 'B' ? rt : Df - rt, zF - pJ.h / 2, { level: 'top', joist: true });
  }

  /* ---------- top layers ---------- */
  let zl = zF; let prevCuts = [];
  layers.forEach((sh, k) => {
    const cands = topLines.map(l => Math.round(l.x + d.ohX));
    const pref = cands.filter(c => !prevCuts.includes(c));
    let sp = splitAt(d.L, sh.len, pref);
    if (!sp.ok) sp = splitAt(d.L, sh.len, cands);
    if (!sp.ok) issue('error', `Top layer ${k + 1}: the top is longer than one ${sh.name} and no support line falls where the sheets must join.`);
    if (d.Dp > sh.wid) issue('error', `Top depth ${fmtMM(d.Dp)} mm is more than the ${sh.name} sheet width ${fmtMM(sh.wid)} mm.`);
    const cuts = sp.pieces.slice(1).map(p => p[0]);
    if (k > 0 && cuts.some(c => prevCuts.some(pc => Math.abs(pc - c) < 100))) issue('info', `Top layer ${k + 1} has a joint within 100 mm of a joint in the layer below. Stagger them if you can.`);
    prevCuts = cuts;
    sp.pieces.forEach(([a, b], i) => sheets.push({ id: `top:${k}:${i}`, role: 'top', sheetId: sh.id, x0: a - d.ohX, x1: b - d.ohX, y0: -d.ohY, y1: Df + d.ohY, z0: zl, z1: zl + sh.t, w: b - a, dpt: d.Dp, where: `top layer ${k + 1}`, layer: k }));
    // top screws per layer along every support line
    const lines = [
      ...topLines.map(l => ({ id: `x${Math.round(l.x)}`, x0: l.x, x1: l.x, y0: rt, y1: Df - rt })),
      { id: 'B', x0: 0, x1: Lf, y0: rt / 2, y1: rt / 2 }, { id: 'F', x0: 0, x1: Lf, y0: Df - rt / 2, y1: Df - rt / 2 },
    ];
    for (const ln of lines) {
      const len = Math.hypot(ln.x1 - ln.x0, ln.y1 - ln.y0);
      spaced(len, 'topScrews').forEach((u, q) => {
        const t = u / len;
        J(`ts:${k}:${ln.id}:${q}`, 'topScrews', ln.x0 + (ln.x1 - ln.x0) * t + (k ? 12 : 0), ln.y0 + (ln.y1 - ln.y0) * t + (k ? 12 : 0), zl + sh.t, { level: 'top', layer: k });
      });
    }
    zl += sh.t;
  });

  /* ---------- shelf levels ---------- */
  const lvGeo = {};
  const levels = [...d.levels].sort((a, b) => a.z - b.z);
  for (const lv of levels) {
    const ts = shS.t, zR = lv.z - ts, zb = zR - pS.h;
    const keys = levelBays(lv, F);
    const g = { lv, zR, zb, keys, bays: [], runs: [], label: levelLabel(lv.id) };
    lvGeo[lv.id] = g;
    if (!keys.length) { issue('warn', `${g.label} is not in any bay.`); continue; }
    if (zb < z0 + 5) issue('error', `${g.label} is too low: its rails go below the bottom of the legs (${fmtMM(z0)} mm).`);
    else if (zb < z0 + 50) issue('warn', `${g.label}: its rails end only ${fmtMM(zb - z0)} mm above the bottom of the legs. Screws that close to the end of a leg can split it, so keep at least 50 mm (raise the shelf).`);
    if (lv.z > zr0 - 50) issue('error', `${g.label} is above or into the top frame.`);
    const idx = keys.map(k => bays.findIndex(b => b.key === k)).sort((a, b) => a - b);
    // long rail runs over consecutive bays
    if (lv.rails) {
      let run = [idx[0]];
      const runs = [];
      for (let q = 1; q < idx.length; q++) { if (idx[q] === run[run.length - 1] + 1) run.push(idx[q]); else { runs.push(run); run = [idx[q]]; } }
      runs.push(run);
      g.runs = runs;
      runs.forEach((r, ri) => {
        const xa = bays[r[0]].a.x - dx / 2, xb = bays[r[r.length - 1]].b.x + dx / 2;
        const inPairs = pairs.slice(r[0], r[r.length - 1] + 2);
        const sp = splitAt(xb - xa, maxUsable(pS, trim), inPairs.map(p => p.x - xa));
        if (!sp.ok) issue('error', `${g.label}: shelf rail too long for your stock and no leg to join it on.`);
        for (const s of ['B', 'F']) sp.pieces.forEach(([a, b], i) => add({ id: `srail:${lv.id}:${ri}:${s}:${i}`, role: 'srail', prof: pS,
          x0: xa + a, x1: xa + b, y0: s === 'B' ? rt - pS.t : Df - rt, y1: s === 'B' ? rt : Df - rt + pS.t, z0: zb, z1: zR, axis: 'x', where: g.label, levelId: lv.id }));
        for (const p of inPairs) for (const s of ['B', 'F']) {
          const spliced = sp.pieces.some(([a]) => Math.abs(xa + a - p.x) < 0.5);
          for (const sd of spliced ? ['L', 'R'] : ['M'])
            J(`rl:${lv.id}:${s}:${p.id}:${sd}`, 'railLeg', p.x + (sd === 'L' ? -dx / 4 : sd === 'R' ? dx / 4 : 0), s === 'B' ? rt - pS.t : Df - rt + pS.t, zb + pS.h / 2,
              { level: lv.id, dir: 'x', postKey: `${p.id}:${s}`, side: sd, rail: lv.id });
        }
      });
    }
    for (const bi of idx) {
      const bay = bays[bi];
      const bg = { bay, joists: [], pieces: [] };
      g.bays.push(bg);
      // cross rails on the bay side of each post pair
      for (const [side, x0] of [['L', bay.a.x + dx / 2], ['R', bay.b.x - dx / 2 - pS.t]]) {
        add({ id: `scross:${lv.id}:${bay.key}:${side}`, role: 'scross', prof: pS, x0, x1: x0 + pS.t, y0: rt, y1: Df - rt, z0: zb, z1: zR, axis: 'y', where: g.label, levelId: lv.id });
        const pr = side === 'L' ? bay.a : bay.b;
        for (const s of ['B', 'F'])
          J(`rl:${lv.id}:K:${bay.key}:${side}:${s}`, 'railLeg', x0 + pS.t / 2, yPostC[s], zb + pS.h / 2, { level: lv.id, dir: 'y', postKey: `${pr.id}:${s}`, rail: lv.id });
      }
      // shelf joists
      const L0 = bay.x0 + pS.t / 2, R0 = bay.x1 - pS.t / 2, span = R0 - L0;
      if (lv.rails) {
        const n = Math.max(0, Math.ceil(span / Math.max(100, d.shelfJoistMax)) - 1);
        for (let k = 1; k <= n; k++) {
          const x = Math.round(L0 + span * k / (n + 1));
          bg.joists.push(x);
          add({ id: `joist:${lv.id}:${bay.key}:${k}`, role: 'joist', prof: pS, x0: x - pS.t / 2, x1: x + pS.t / 2, y0: rt, y1: Df - rt, z0: zb, z1: zR, axis: 'y', where: g.label, levelId: lv.id });
          for (const s of ['B', 'F'])
            J(`je:${lv.id}:${bay.key}:${k}:${s}`, d.joistSupport === 'hanger' ? 'joistHanger' : 'joistScrew', x, s === 'B' ? rt : Df - rt, zb + pS.h / 2, { level: lv.id, joist: true });
        }
      }
      // board(s)
      const y0 = lv.rails ? rt - pS.t : rt, y1 = lv.rails ? Df - rt + pS.t : Df - rt;
      const sp = splitAt(bay.x1 - bay.x0, shS.len, bg.joists.map(x => x - bay.x0));
      if (!sp.ok) issue('error', `${g.label}: bay is wider than one ${shS.name} and has no joist to join the boards on. Lower the shelf joist spacing.`);
      if (y1 - y0 > shS.wid) issue('error', `${g.label}: board depth ${fmtMM(y1 - y0)} mm is more than the sheet width.`);
      sp.pieces.forEach(([a, b], i) => {
        const s = { id: `shelf:${lv.id}:${bay.key}:${i}`, role: 'shelf', sheetId: shS.id, levelId: lv.id, x0: bay.x0 + a, x1: bay.x0 + b, y0, y1, z0: zR, z1: lv.z, w: b - a, dpt: y1 - y0, where: g.label };
        sheets.push(s); bg.pieces.push(s);
      });
      // shelf screws along supports
      const sl = [bay.x0 + pS.t / 2, bay.x1 - pS.t / 2, ...bg.joists];
      sl.forEach(x => spaced(Df - 2 * rt, 'shelfScrews').forEach((u, q) => J(`ss:${lv.id}:${bay.key}:${Math.round(x)}:${q}`, 'shelfScrews', x, rt + u, lv.z, { level: lv.id })));
      if (lv.rails) for (const s of ['B', 'F'])
        spaced(bay.x1 - bay.x0, 'shelfScrews').forEach((u, q) => J(`ss:${lv.id}:${bay.key}:${s}:${q}`, 'shelfScrews', bay.x0 + u, s === 'B' ? rt - pS.t / 2 : Df - rt + pS.t / 2, lv.z, { level: lv.id }));
    }
  }

  /* ---------- panels ---------- */
  const tp = shP.t;
  const panelInfo = { back: null, left: null, right: null };
  if (d.panels.back) {
    const full = levels.filter(lv => lv.rails && levelBays(lv, F).length === bays.length);
    if (!full.length) issue('error', 'The back panel needs a shelf level with rails in every bay. Its bottom edge is screwed to that rail.');
    else {
      const zb = lvGeo[full[0].id].zb;
      const h = zF - zb;
      const sp = splitAt(Lf, shP.len, pairs.map(p => p.x));
      if (h > shP.wid) issue('error', `Back panel height ${fmtMM(h)} is more than the sheet width.`);
      sp.pieces.forEach(([a, b], i) => sheets.push({ id: `panel:back:${i}`, role: 'panel', sheetId: shP.id, x0: a, x1: b, y0: -tp, y1: 0, z0: zb, z1: zF, w: b - a, dpt: h, where: 'back', vertical: 'xz' }));
      let n = 0;
      for (const zz of [zF - pR.h / 2, zb + pS.h / 2]) spaced(Lf, 'panelScrews').forEach((u, q) => { if (J(`ps:back:${Math.round(zz)}:${q}`, 'panelScrews', u, -tp, zz, { level: 'back' }) && zz > zb + pS.h) n++; });
      panelInfo.back = { nTop: n, zb };
      if (tp > d.ohY) issue('warn', `Back panel (${tp} mm) sticks out past the top's ${d.ohY} mm overhang.`);
    }
  }
  for (const side of ['left', 'right']) {
    if (!d.panels[side]) continue;
    const p = side === 'left' ? pairs[0] : pairs[pairs.length - 1];
    const lvIn = levels.filter(lv => levelBays(lv, F).includes(side === 'left' ? bays[0].key : bays[bays.length - 1].key));
    const zb = lvIn.length ? lvGeo[lvIn[0].id].zb : z0;
    const zt = zr0;
    const x0 = side === 'left' ? p.x - dx / 2 - tp : p.x + dx / 2;
    if (zt - zb > shP.len) issue('error', `${side} panel is taller than a sheet.`);
    sheets.push({ id: `panel:${side}`, role: 'panel', sheetId: shP.id, x0, x1: x0 + tp, y0: rt, y1: Df - rt, z0: zb, z1: zt, w: Df - 2 * rt, dpt: zt - zb, where: side + ' end', vertical: 'yz' });
    let n = 0;
    for (const s of ['B', 'F']) spaced(zt - zb, 'panelScrews').forEach((u, q) => { if (J(`ps:${side}:${s}:${q}`, 'panelScrews', side === 'left' ? x0 : x0 + tp, yPostC[s], zb + u, { level: side })) n++; });
    panelInfo[side] = { n };
  }

  for (const m of d.manual) joints.push({ id: m.id, rule: 'manual', x: m.x, y: m.y, z: m.z, items: m.items, note: m.note, manual: true, level: m.level });

  const model = { d, F, ...F, levels, lvGeo, members, sheets, joints, issues, feet, panelInfo, topLines, joistsTop,
    sh: shS, hasWall: false, isBench: true,
    W: d.L, D: d.Dp, topZ: d.H,
    bbox: { x0: -d.ohX, x1: Lf + d.ohX, y0: -d.ohY, y1: Df + d.ohY, z1: d.H } };
  benchGeometryChecks(model);
  model.checks = benchChecks(model);
  markParts(model);
  return model;
}

function benchGeometryChecks(m) {
  const { d, F, levels, lvGeo } = m;
  const { pairs, bays, dx, zF, pR, z0, foot } = F;
  const issue = (level, msg) => m.issues.push({ level, msg });
  for (const b of bays) if (b.x1 - b.x0 < 150) issue('error', `Two leg pairs are too close (${fmtMM(b.x1 - b.x0)} mm between posts).`);
  // clear heights per bay
  for (const b of bays) {
    const inBay = levels.filter(lv => lvGeo[lv.id] && lvGeo[lv.id].keys.includes(b.key)).sort((a, c) => a.z - c.z);
    for (let i = 0; i < inBay.length; i++) {
      const above = inBay[i + 1];
      const ceil = above ? lvGeo[above.id].zb : zF - pR.h;
      const open = ceil - inBay[i].z;
      if (open < 0) issue('error', `${levelLabel(inBay[i].id)} collides with ${above ? levelLabel(above.id) : 'the top frame'}.`);
      else if (open < 100) issue('warn', `Only ${fmtMM(open)} mm clear above ${levelLabel(inBay[i].id)}.`);
    }
  }
  if (!foot.f) issue('info', 'No casters or feet: put a plastic pad under each leg so it does not soak up water from the concrete.');
  if (F.needPad) issue('info', `Caster plates are wider than the ${Math.min(F.dx, F.dy)} mm posts, so a 120×120 pad of ${F.shS.name} is added under each post (in the cut list). Glue and screw it on.`);
  if (d.H < 750 || d.H > 1050) issue('info', `Work height ${d.H} mm is unusual. A common rule is about 10–15 cm below your elbow height.`);
  const r = d.rules;
  if (r.railLeg.items.every(i => !i.n)) issue('error', 'Rails are not screwed to the posts.');
  if (r.topScrews.items.every(i => !i.n)) issue('warn', 'The top is not screwed down. The screwed top is what keeps the frame square.');
}

/* ---------------- engineering ---------------- */
function kmodShort(mat, sc) {
  if (mat === 'timber') return 0.9;
  if (mat === 'OSB3') return sc === 1 ? 0.9 : 0.7;
  return 0.9;
}

function benchChecks(m) {
  const { d, F, levels, lvGeo, panelInfo, topLines, joints } = m;
  const { pP, pR, pJ, pS, pT, dx, dy, layers, topT, Lf, Df, rt, zF, shS, pairs, bays, z0 } = F;
  const T = TIMBER[d.grade] || TIMBER.C18;
  const tf = timberFactors(d.serviceClass);
  const kmS = kmodShort('timber', d.serviceClass);
  const fmd = T.fmk * tf.kmod / tf.gM, fmdS = T.fmk * kmS / tf.gM;
  const fc0d = T.fc0k * kmS / tf.gM;
  const lim = d.deflLimit;
  const out = [];
  const push = (c) => { c.status = c.util == null ? 'info' : c.util > 1 ? 'fail' : c.util > 0.85 ? 'warn' : 'ok'; out.push(c); };
  const P = (d.loads.point || 0) * 1000, Pd = 1.5 * P;
  const H = d.loads.lateral || 0, Hd = 1.5 * H;
  const sw = (p) => T.rho * p.t * p.h * 1e-9 * G;
  const capOf = (items, kinds = ['screw']) => { let c = 0, any = false; for (const it of items) { const f = fastener(it.type); if (f && f.cap && kinds.includes(f.kind)) { c += f.cap * 1000 * it.n; any = true; } } return any ? c : null; };
  const nOf = (items) => items.reduce((a, it) => { const f = fastener(it.type); return a + (f && f.kind === 'screw' && f.cap ? it.n : 0); }, 0);
  const capEach = (items) => { for (const it of items) { const f = fastener(it.type); if (f && f.kind === 'screw' && f.cap && it.n) return f.cap * 1000; } return null; };
  const postN = {};       // design axial load per post
  const jointV = {};      // design vertical shear per joint id
  const addN = (key, v) => postN[key] = (postN[key] || 0) + v;
  const jById = Object.fromEntries(joints.map(j => [j.id, j]));

  /* ---- top plate ---- */
  const SPs = layers.map(s => ({ s, p: sheetProps(s, d.serviceClass) }));
  const qT = d.loads.top * G / (d.L * d.Dp);
  const gT = SPs.reduce((a, x) => a + x.p.rho * x.s.t * 1e-9 * G, 0);
  // stiffness per mm width
  let EI = 0, stressFactor = [];   // stress in layer i = M * factor_i
  if (d.topGlued && SPs.length > 1) {
    let zc = 0, EA = 0, ES = 0;
    const zs = []; SPs.forEach(x => { zs.push(zc + x.s.t / 2); ES += x.p.E * x.s.t * (zc + x.s.t / 2); EA += x.p.E * x.s.t; zc += x.s.t; });
    const zn = ES / EA;
    SPs.forEach((x, i) => EI += x.p.E * (x.s.t ** 3 / 12 + x.s.t * (zs[i] - zn) ** 2));
    SPs.forEach((x, i) => stressFactor.push(x.p.E * Math.max(Math.abs(zs[i] - x.s.t / 2 - zn), Math.abs(zs[i] + x.s.t / 2 - zn)) / EI));
  } else {
    SPs.forEach(x => EI += x.p.E * x.s.t ** 3 / 12);
    SPs.forEach(x => stressFactor.push(x.p.E * x.s.t / 2 / EI));
  }
  const kdefTop = Math.max(...SPs.map(x => x.p.kdef));
  const plateUtil = (Mlong, Mshort) => Math.max(...SPs.map((x, i) => Math.max(
    Mlong * stressFactor[i] / (x.p.fm * x.p.kmod / x.p.gM),
    Mshort * stressFactor[i] / (x.p.fm * kmodShort(x.s.mat, d.serviceClass) / x.p.gM))));
  {
    let s = 0; for (let i = 0; i < topLines.length - 1; i++) s = Math.max(s, topLines[i + 1].x - topLines[i].x);
    const qd = GAM_G * gT + GAM_Q * qT;
    const bef = Math.min(d.Dp, 100 + 0.6 * s);
    const Ml = qd * s * s / 8, Ms = Ml + Pd * s / 4 / bef;
    const dU = 5 * s ** 4 / (384 * EI) * (gT * (1 + kdefTop) + qT * (1 + PSI2 * kdefTop));
    const dP = P * s ** 3 / (48 * EI * bef);
    const ov = Math.max(d.ohX + rt / 2, d.ohY + rt / 2);
    const Mov = Pd * ov / (100 + 2 * ov);
    const u = Math.max(plateUtil(Ml, Ms), plateUtil(0, Mov), dU / (s / lim), dP / (s / lim));
    push({ name: `Top (${layers.map(l => l.t).join('+')} mm${d.topGlued && layers.length > 1 ? ', glued' : ''}) between supports`, util: u,
      detail: `Largest span ${fmtMM(s)} mm. Spread load sags ${dU.toFixed(1)} mm long-term, the ${d.loads.point} kN point load sags ${dP.toFixed(1)} mm (limit ${(s / lim).toFixed(1)}). Edge overhang ${fmtMM(ov)} mm checked with the point load.`,
      fix: 'Lower the max joist spacing, use a thicker top or a 2nd layer (glued).' });
  }

  /* ---- top joists ---- */
  const Lj = Df - rt;   // centre of rail to centre of rail
  const Ij = pJ.t * pJ.h ** 3 / 12, Wj = pJ.t * pJ.h ** 2 / 6;
  const supportCheck = (Rd, items, method, joistSpacing) => {
    if (method === 'hanger') { const c = capOf(items, ['hardware']); return c == null ? null : Rd / c; }
    if (method === 'strip') {
      const r = d.rules.stripRail; const c = capEach(r.items) && capOf(r.items);
      if (!c) return null;
      const nEff = Math.max(1, Math.min(joistSpacing / Math.max(50, r.spacing), 4));
      return Rd / nEff / c;
    }
    const c = capOf(items); return c == null ? null : Rd / (c / 3);
  };
  if (m.joistsTop.length) {
    let worst = { util: 0 }, worstS = { util: 0, txt: '' }, anyCap = true;
    for (const j of m.joistsTop) {
      const i = topLines.findIndex(l => l.x === j.x);
      const trib = (topLines[i + 1].x - topLines[i - 1].x) / 2;
      const wG = gT * trib + sw(pJ), wQ = qT * trib, wd = GAM_G * wG + GAM_Q * wQ;
      const M = wd * Lj * Lj / 8 + Pd * Lj / 4;
      const dfin = 5 * Lj ** 4 / (384 * T.E0 * Ij) * (wG * (1 + tf.kdef) + wQ * (1 + PSI2 * tf.kdef)) + P * Lj ** 3 / (48 * T.E0 * Ij);
      const u = Math.max(wd * Lj * Lj / 8 / Wj / fmd, M / Wj / fmdS, dfin / (Lj / lim));
      if (u > worst.util) worst = { util: u, txt: `Span ${fmtMM(Lj)} mm, carries ${fmtMM(trib)} mm of top + the point load: stress ${(M / Wj).toFixed(1)}/${fmdS.toFixed(1)} MPa, sag ${dfin.toFixed(1)} mm` };
      const Rd = wd * Lj / 2 + Pd * 0.75;
      const jj = jById[`je:top:${j.bay}:${j.k}:F`] || jById[`je:top:${j.bay}:${j.k}:B`];
      const us = jj ? supportCheck(Rd, jj.items, d.joistSupport, trib) : 9;
      if (us == null) anyCap = false;
      else if (us > worstS.util) worstS = { util: us, txt: `End reaction ${(Rd / 1000).toFixed(2)} kN (design) on ${d.joistSupport === 'hanger' ? 'the hanger' : d.joistSupport === 'strip' ? 'the support strip screws' : 'end-grain screws (⅓ capacity)'}` };
    }
    push({ name: `Top joists (${pJ.t}×${pJ.h})`, util: worst.util, detail: worst.txt, fix: 'Closer joists or a taller profile.' });
    push({ name: `Joist ends (${d.joistSupport === 'hanger' ? 'hangers' : d.joistSupport === 'strip' ? 'support strip' : 'screwed through rail'})`, util: anyCap ? worstS.util : null,
      detail: anyCap ? worstS.txt : 'Enter a capacity for the screw/hanger in the catalog to check this.',
      fix: 'Use joist hangers, a support strip, or more screws.' });
  }

  /* ---- top long rails (front/back) between posts ---- */
  const Ir = pR.t * pR.h ** 3 / 12, Wr = pR.t * pR.h ** 2 / 6;
  {
    const wG = gT * (Df / 2 + d.ohY) + sw(pR), wQ = qT * (Df / 2 + d.ohY), wd = GAM_G * wG + GAM_Q * wQ;
    let worst = { util: 0 };
    for (let i = 0; i < pairs.length - 1; i++) {
      const L = pairs[i + 1].x - pairs[i].x;
      const M = wd * L * L / 8 + Pd * L / 4;
      const dfin = 5 * L ** 4 / (384 * T.E0 * Ir) * (wG * (1 + tf.kdef) + wQ * (1 + PSI2 * tf.kdef)) + P * L ** 3 / (48 * T.E0 * Ir);
      const u = Math.max(wd * L * L / 8 / Wr / fmd, M / Wr / fmdS, dfin / (L / lim));
      if (u > worst.util) worst = { util: u, txt: `Span ${fmtMM(L)} mm between legs with the point load at mid-span: stress ${(M / Wr).toFixed(1)}/${fmdS.toFixed(1)} MPa, sag ${dfin.toFixed(1)} mm (limit ${(L / lim).toFixed(1)})` };
    }
    push({ name: `Top rails front/back (${pR.t}×${pR.h})`, util: worst.util, detail: worst.txt, fix: 'Add a leg pair or use a taller rail.' });
    pairs.forEach((p, i) => {
      const Ll = i ? p.x - pairs[i - 1].x : 0, Lr = i < pairs.length - 1 ? pairs[i + 1].x - p.x : 0;
      const R = wd * (Ll + Lr) / 2 + Pd * 0.5;
      for (const s of ['B', 'F']) {
        addN(`${p.id}:${s}`, R);
        const ids = ['M', 'L', 'R'].map(sd => `rl:top:${s}:${p.id}:${sd}`).filter(id => jById[id]);
        ids.forEach(id => { jointV[id] = R / ids.length * (ids.length > 1 ? 1 : 1); });
      }
    });
  }
  /* ---- top end rails / cross rails ---- */
  {
    const Lc = Df - 2 * rt - dy;
    let worst = { util: 0 };
    const crossLines = topLines.map((l, i) => ({ l, i })).filter(o => o.l.kind !== 'joist');
    for (const { l, i } of crossLines) {
      const left = i ? (l.x - topLines[i - 1].x) / 2 : d.ohX + rt / 2;
      const right = i < topLines.length - 1 ? (topLines[i + 1].x - l.x) / 2 : d.ohX + rt / 2;
      const trib = left + right;
      const wG = gT * trib + sw(pR), wQ = qT * trib, wd = GAM_G * wG + GAM_Q * wQ;
      const M = wd * Lc * Lc / 8 + Pd * Lc / 4;
      const u = Math.max(wd * Lc * Lc / 8 / Wr / fmd, M / Wr / fmdS);
      if (u > worst.util) worst = { util: u, txt: `Span ${fmtMM(Lc)} mm front-to-back post: stress ${(M / Wr).toFixed(1)} MPa` };
      const R = wd * Lc / 2 + Pd * 0.5;
      const pr = l.kind === 'end' ? (l.x < Lf / 2 ? pairs[0] : pairs[pairs.length - 1]) : pairs.find(p => p.id === l.pairId);
      for (const s of ['B', 'F']) {
        addN(`${pr.id}:${s}`, R);
        const id = l.kind === 'end' ? `rl:top:E:${pr.id}:${s}` : `rl:top:X:${pr.id}:${s}`;
        jointV[id] = R;
      }
    }
    push({ name: 'Top end / cross rails', util: worst.util, detail: worst.txt });
  }

  /* ---- shelf levels ---- */
  const SPs_ = sheetProps(shS, d.serviceClass);
  const fmdSh = SPs_.fm * SPs_.kmod / SPs_.gM;
  const Is = pS.t * pS.h ** 3 / 12, Ws = pS.t * pS.h ** 2 / 6;
  for (const lv of levels) {
    const g = lvGeo[lv.id]; if (!g || !g.bays.length) continue;
    const area = g.bays.reduce((a, b) => a + b.pieces.reduce((c, s) => c + s.w * s.dpt, 0), 0);
    const q = lv.load * G / Math.max(area, 1), gs = SPs_.rho * shS.t * 1e-9 * G, qd = GAM_G * gs + GAM_Q * q;
    let wSheet = { util: 0 }, wRail = { util: 0 }, wCross = { util: 0 };
    for (const bg of g.bays) {
      const bay = bg.bay;
      const xs = [bay.x0 + pS.t / 2, ...bg.joists, bay.x1 - pS.t / 2];
      let sx = 0; for (let i = 0; i < xs.length - 1; i++) sx = Math.max(sx, xs[i + 1] - xs[i]);
      const sy = lv.rails ? Df - 2 * rt + pS.t : Infinity;
      const s = Math.min(sx, sy);
      const I1 = shS.t ** 3 / 12;
      const sig = qd * s * s / 8 * 6 / shS.t ** 2;
      const dfin = 5 * s ** 4 / (384 * SPs_.E * I1) * (gs * (1 + SPs_.kdef) + q * (1 + PSI2 * SPs_.kdef));
      const u = Math.max(sig / fmdSh, dfin / (s / lim));
      if (u > wSheet.util) wSheet = { util: u, txt: `Span ${fmtMM(s)} mm (${s === sy ? 'front-to-back between rails' : 'between cross rails/joists'}): long-term sag ${dfin.toFixed(1)} mm (limit ${(s / lim).toFixed(1)})` };
      const bayLen = bay.x1 - bay.x0;
      // long rails (conservatively take half the bay each)
      if (lv.rails) {
        const L = bay.b.x - bay.a.x;
        const wG = gs * Df / 2 + sw(pS), wQ = q * Df / 2, wd = GAM_G * wG + GAM_Q * wQ;
        const sig = wd * L * L / 8 / Ws;
        const df = 5 * L ** 4 / (384 * T.E0 * Is) * (wG * (1 + tf.kdef) + wQ * (1 + PSI2 * tf.kdef));
        const ur = Math.max(sig / fmd, df / (L / lim));
        if (ur > wRail.util) wRail = { util: ur, txt: `Span ${fmtMM(L)} mm: stress ${sig.toFixed(1)} MPa, sag ${df.toFixed(1)} mm` };
        for (const [pr] of [[bay.a], [bay.b]]) for (const s of ['B', 'F']) {
          const R = wd * L / 2; addN(`${pr.id}:${s}`, R);
          ['M', 'L', 'R'].forEach(sd => { const id = `rl:${lv.id}:${s}:${pr.id}:${sd}`; if (jById[id]) jointV[id] = (jointV[id] || 0) + R; });
        }
      }
      // cross rails: each takes half the bay (all of it if no long rails, split over 2 rails)
      const Lc = Df - 2 * rt - dy;
      const share = bayLen / 2;
      const wG = gs * share + sw(pS), wQ = q * share, wd = GAM_G * wG + GAM_Q * wQ;
      const sigc = wd * Lc * Lc / 8 / Ws;
      const dfc = 5 * Lc ** 4 / (384 * T.E0 * Is) * (wG * (1 + tf.kdef) + wQ * (1 + PSI2 * tf.kdef));
      const uc = Math.max(sigc / fmd, dfc / (Lc / lim));
      if (uc > wCross.util) wCross = { util: uc, txt: `Span ${fmtMM(Lc)} mm: stress ${sigc.toFixed(1)} MPa, sag ${dfc.toFixed(1)} mm` };
      for (const side of ['L', 'R']) for (const s of ['B', 'F']) {
        const R = wd * Lc / 2;
        jointV[`rl:${lv.id}:K:${bay.key}:${side}:${s}`] = R;
        addN(`${(side === 'L' ? bay.a : bay.b).id}:${s}`, R * (lv.rails ? 0 : 1));   // avoid double counting with long rails
      }
    }
    push({ name: `${g.label} · board (${shS.t} mm)`, util: wSheet.util, detail: wSheet.txt, fix: 'Turn on rails, lower the shelf joist spacing, or use a thicker board.' });
    if (lv.rails) push({ name: `${g.label} · long rails (${pS.t}×${pS.h})`, util: wRail.util, detail: wRail.txt });
    push({ name: `${g.label} · cross rails`, util: wCross.util, detail: wCross.txt });
  }

  /* ---- rail → post screws (vertical load) ---- */
  {
    let worst = { util: 0, txt: '' }, any = false;
    for (const [id, V] of Object.entries(jointV)) {
      const j = jById[id]; if (!j) continue;
      const c = capOf(j.items); if (c == null) continue; any = true;
      const u = V / c;
      if (u > worst.util) worst = { util: u, txt: `${(V / 1000).toFixed(2)} kN design load on screws rated ${(c / 1000).toFixed(2)} kN (${levelLabel(j.level)})` };
    }
    push({ name: 'Rail → post screws (weight)', util: any ? worst.util : null, detail: any ? worst.txt : 'Enter screw capacity in the catalog to check.', fix: 'More / thicker screws per joint.' });
  }

  /* ---- racking (sideways push at the top) + legs ---- */
  const posts = pairs.flatMap(p => ['B', 'F'].map(s => ({ key: `${p.id}:${s}`, p, s })));
  const nPosts = posts.length;
  const A = dx * dy;
  const Wlx = dy * dx * dx / 6, Wly = dx * dy * dy / 6;   // bending in x-z / y-z plane
  const legMoment = { x: {}, y: {} };
  const racking = (dir) => {
    const braced = dir === 'x' ? !!panelInfo.back : !!(panelInfo.left && panelInfo.right);
    if (braced) {
      const r = d.rules.panelScrews; const c = capEach(r.items);
      if (dir === 'x') {
        const n = Math.max(1, panelInfo.back.nTop);
        return { name: 'Racking along the bench (back panel)', util: c ? Hd / (n * c) : null, detail: c ? `${(Hd / 1000).toFixed(2)} kN shared by ${n} panel screws along the top rail` : 'Braced by the back panel. Give the panel screw a capacity in the catalog to check its screws.' };
      }
      const n = Math.max(1, Math.min(panelInfo.left.n, panelInfo.right.n));
      return { name: 'Racking across the bench (end panels)', util: c ? Hd / 2 / (n * c) : null, detail: c ? `${(Hd / 2000).toFixed(2)} kN per end panel on ${n} screws` : 'Braced by the end panels. Give the panel screw a capacity in the catalog to check its screws.' };
    }
    const V = Hd / nPosts;
    let worstJ = { util: 0, txt: '' }, worstM = 0, anyCap = true;
    for (const pt of posts) {
      const js = joints.filter(j => j.rule === 'railLeg' && j.dir === dir && j.postKey === pt.key);
      const zs = [...new Set(js.map(j => Math.round(j.z)))].sort((a, b) => a - b);
      if (!zs.length) continue;
      const segs = [zs[0]];
      for (let i = 1; i < zs.length; i++) segs.push(zs[i] - zs[i - 1]);
      // moments: bottom segment = cantilever from the floor (pinned), others fixed-fixed
      const Mj = zs.map((z, i) => (i === 0 ? V * segs[0] : V * segs[i] / 2) + (i < zs.length - 1 ? V * segs[i + 1] / 2 : 0));
      worstM = Math.max(worstM, V * segs[0], ...segs.slice(1).map(h => V * h / 2));
      legMoment[dir][pt.key] = Math.max(V * segs[0], ...segs.slice(1).map(h => V * h / 2));
      zs.forEach((z, i) => {
        const jz = js.filter(j => Math.round(j.z) === z);
        const j = jz[0];
        const n = jz.reduce((a, jj) => a + nOf(jj.items), 0), c = capEach(j.items);
        if (!c || !n) { anyCap = false; return; }
        const face = dir === 'x' ? dx : dy;
        const rh = (j.rail === 'top' ? pR.h : pS.h);
        const r = 0.35 * Math.min(rh, face);
        const Vg = jz.reduce((a, jj) => a + (jointV[jj.id] || 0), 0);
        const Fs = Math.sqrt((Mj[i] / (n * r)) ** 2 + (Vg / n) ** 2);
        const u = Fs / c;
        if (u > worstJ.util) worstJ = { util: u, txt: `Worst joint ${fmtMM(z)} mm up: moment ${(Mj[i] / 1e6).toFixed(2)} kNm + weight ${(Vg / 1000).toFixed(2)} kN on ${n} screws → ${(Fs / 1000).toFixed(2)} kN on the worst screw (rated ${(c / 1000).toFixed(2)})` };
      });
    }
    return { name: `Racking ${dir === 'x' ? 'along' : 'across'} the bench (screwed joints, no panel)`, util: anyCap ? worstJ.util : null,
      detail: anyCap ? `${d.loads.lateral} N push at the top. ${worstJ.txt}` : 'Enter screw capacity in the catalog to check.',
      fix: dir === 'x' ? 'Add a back panel, a shelf level with rails lower down, or more screws per joint.' : 'Add end panels, cross rails at more levels, or more screws per joint.' };
  };
  push(racking('x'));
  push(racking('y'));

  {
    // legs: compression + racking bending
    const zsAll = [z0, ...levels.map(l => lvGeo[l.id] && lvGeo[l.id].zb).filter(z => z != null), zF - pR.h / 2].sort((a, b) => a - b);
    let Le = 0; for (let i = 0; i < zsAll.length - 1; i++) Le = Math.max(Le, zsAll[i + 1] - zsAll[i]);
    const tmin = Math.min(dx, dy), i_ = tmin / Math.sqrt(12), lam = Le / i_;
    const lrel = lam / Math.PI * Math.sqrt(T.fc0k / T.E05);
    const k = 0.5 * (1 + 0.2 * (lrel - 0.3) + lrel * lrel);
    const kc = Math.min(1, 1 / (k + Math.sqrt(Math.max(k * k - lrel * lrel, 0))));
    let worst = { util: 0, txt: '' };
    for (const pt of posts) {
      const N = (postN[pt.key] || 0) + GAM_G * T.rho * A * 1e-9 * G * (zF - z0);
      const Mx = legMoment.x[pt.key] || 0, My = legMoment.y[pt.key] || 0;
      const u = N / A / (kc * fc0d) + Math.max(Mx / Wlx, My / Wly) / fmdS;
      if (u > worst.util) worst = { util: u, txt: `${(N / 1000).toFixed(2)} kN + racking bending ${(Math.max(Mx, My) / 1e6).toFixed(2)} kNm, buckling length ${fmtMM(Le)} mm, k_c=${kc.toFixed(2)}` };
    }
    push({ name: `Legs (${pP.t}×${pP.h})`, util: worst.util, detail: worst.txt });
  }

  /* ---- weight, casters, tipping ---- */
  let massTimber = 0; for (const mm of m.members) massTimber += T.rho * (mm.x1 - mm.x0) * (mm.y1 - mm.y0) * (mm.z1 - mm.z0) * 1e-9;
  let massSheets = 0; for (const s of m.sheets) { const sp = sheetProps(sheetDef(s.sheetId), d.serviceClass); massSheets += sp.rho * (s.x1 - s.x0) * (s.y1 - s.y0) * (s.z1 - s.z0) * 1e-9; }
  const massEmpty = massTimber + massSheets;
  const massLoad = d.loads.top + levels.reduce((a, l) => a + (lvGeo[l.id] && lvGeo[l.id].bays.length ? l.load : 0), 0);
  m.mass = { empty: massEmpty, loaded: massEmpty + massLoad };
  {
    const fj = joints.filter(j => j.rule === 'foot');
    let minCap = Infinity, any = false;
    for (const j of fj) for (const it of j.items) { const f = fastener(it.type); if (f && (f.kind === 'caster' || f.kind === 'foot') && f.cap && it.n) { minCap = Math.min(minCap, f.cap * 1000 * it.n); any = true; } }
    const nEff = fj.length >= 4 ? fj.length - 1 : fj.length;
    const Fper = (massEmpty + massLoad) * G / Math.max(1, nEff);
    if (any) push({ name: 'Casters / feet load rating', util: Fper / minCap,
      detail: `${(massEmpty + massLoad).toFixed(0)} kg total (bench ${massEmpty.toFixed(0)} kg + loads ${massLoad} kg) on ${nEff} of ${fj.length} ${fj.length >= 4 ? '(one may be off the floor on an uneven floor)' : ''}: ${(Fper / 1000).toFixed(2)} kN each vs rated ${(minCap / 1000).toFixed(2)} kN`,
      fix: 'Bigger casters, or more legs.' });
  }
  {
    const spanY = Df - 2 * rt - dy, spanX = pairs[pairs.length - 1].x - pairs[0].x;
    const tipY = massEmpty * G * spanY / 2 / d.H, tipX = massEmpty * G * spanX / 2 / d.H;
    push({ name: 'Tipping (information)', util: null, infoOnly: true,
      detail: `Empty, the bench (${massEmpty.toFixed(0)} kg) tips over front-to-back with about ${tipY.toFixed(0)} N (${(tipY / G).toFixed(0)} kg) pushed sideways at the top edge with the wheels locked. Along its length it takes about ${tipX.toFixed(0)} N. Loaded shelves make it much more stable.` });
  }

  return { list: out, basis: { grade: d.grade, fmd, fc0d, fmdS: fmdSh, SP: SPs_, tf } };
}
