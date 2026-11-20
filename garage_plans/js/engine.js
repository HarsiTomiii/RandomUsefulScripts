'use strict';
/* ============================================================
   Geometry builder + engineering checks
   Engineering basis (simplified Eurocode 5 approach):
   - ULS: 1.35·G + 1.5·Q,  material design strength f_d = k_mod·f_k / γ_M
   - SLS: final deflection = δ_G(1+k_def) + δ_Q(1+ψ2·k_def), ψ2 = 0.8 (storage)
   - Loads are treated as long-term (storage) actions
   - Simply supported spans (conservative for moments and deflection)
   ============================================================ */

const TIMBER = {
  C18: { fmk: 18, fc0k: 18, fc90k: 2.2, E0: 9000, E05: 6000, rho: 380 },
  C24: { fmk: 24, fc0k: 21, fc90k: 2.5, E0: 11000, E05: 7400, rho: 420 },
};
function timberFactors(sc) { return { kmod: 0.7, kdef: sc === 1 ? 0.6 : 0.8, gM: 1.3 }; }
function sheetProps(sh, sc) {
  // EN 12369-1 / EN 1995-1-1 values. Bending along the sheet's long direction.
  if (sh.mat === 'Plywood') {
    return { E: sh.E || 7000, fm: sh.fm || 20, rho: 500, kmod: 0.7, kdef: sc === 1 ? 0.8 : 1.0, gM: 1.2 };
  }
  const fm = sh.fm || (sh.t <= 10 ? 18.0 : sh.t < 18 ? 16.4 : 14.8);
  return { E: sh.E || 4930, fm, rho: 620, kmod: sc === 1 ? 0.5 : 0.4, kdef: sc === 1 ? 1.5 : 2.25, gM: 1.2 };
}
const PSI2 = 0.8, GAM_G = 1.35, GAM_Q = 1.5;

function ruleItems(design, jointId, ruleKey) {
  const ov = design.overrides[jointId];
  if (ov && ov.deleted) return null;
  if (ov && ov.items) return ov.items;
  return design.rules[ruleKey].items;
}

/* Split a run [0,L] into pieces <= maxLen, choosing split points from candidates (sorted). */
function splitAt(L, maxLen, candidates) {
  const cuts = []; let start = 0; let ok = true;
  while (L - start > maxLen + 0.01) {
    const c = candidates.filter(v => v > start + 1 && v <= start + maxLen + 0.01);
    if (!c.length) { ok = false; cuts.push(start + maxLen); start += maxLen; continue; }
    const pick = c[c.length - 1];
    cuts.push(pick); start = pick;
  }
  const pts = [0, ...cuts, L];
  const pieces = [];
  for (let i = 0; i < pts.length - 1; i++) pieces.push([pts[i], pts[i + 1]]);
  return { pieces, ok };
}

function maxUsable(p, trim) {
  const m = Math.max(...p.stock.map(s => s.len), 0);
  return m - trim;
}

function buildModel() { return TYPES[S.design.type].build(); }

function buildShelfModel() {
  const d = S.design, lib = S.library;
  const pL = profile(d.roles.ledger), pC = profile(d.roles.cross), pF = profile(d.roles.front), pP = profile(d.roles.leg);
  const sh = sheetDef(d.sheetId);
  const tO = sh.t;
  const W = d.W, D = d.D;
  const legDx = d.legOrient === 'wideX' ? pP.h : pP.t;
  const legDy = d.legOrient === 'wideX' ? pP.t : pP.h;
  const shelves = shelvesSorted();
  const topZ = shelves.length ? shelves[0].z : 1000;
  const legs = [...d.legs].sort((a, b) => a.x - b.x);
  const trim = d.cut.trim;

  const members = []; const sheets = []; const joints = []; const issues = [];
  const add = (m) => { members.push(m); return m; };
  const issue = (level, msg, where) => issues.push({ level, msg, where });

  // legs
  for (const l of legs) {
    add({ id: 'leg:' + l.id, role: 'leg', prof: pP, refId: l.id,
      x0: l.x - legDx / 2, x1: l.x + legDx / 2, y0: D, y1: D + legDy, z0: 0, z1: topZ + d.legTopExtra, axis: 'z' });
  }

  const shelfGeo = {};
  for (const s of shelves) {
    const Z = s.z;
    const zBeamTop = Z - tO - pC.h;
    const cross = [...crossOf(s)].sort((a, b) => a.x - b.x);
    const g = { shelf: s, Z, zBeamTop, cross, ledgerPieces: [], frontPieces: [], osbPieces: [], fixings: [] };
    shelfGeo[s.id] = g;

    // ledger, split if longer than stock (prefer joints midway between crossbeams)
    const maxL = maxUsable(pL, trim);
    const mids = [];
    for (let i = 0; i < cross.length - 1; i++) mids.push(Math.round((cross[i].x + cross[i + 1].x) / 2));
    let lsplit = splitAt(W, maxL, mids);
    if (!lsplit.ok) lsplit = splitAt(W, maxL, []);
    lsplit.pieces.forEach(([a, b], i) => {
      g.ledgerPieces.push([a, b]);
      add({ id: `ledger:${s.id}:${i}`, role: 'ledger', prof: pL, shelfId: s.id,
        x0: a, x1: b, y0: 0, y1: pL.t, z0: zBeamTop - pL.h, z1: zBeamTop, axis: 'x' });
    });

    // front beam, split only at leg centres
    const maxF = maxUsable(pF, trim);
    const fsplit = splitAt(W, maxF, legs.map(l => l.x));
    if (!fsplit.ok) issue('error', `${shelfLabel(s.id)}: front beam is longer than your longest ${pF.name} stock and there is no leg to join it on. Add a leg or a longer stock length.`, s.id);
    fsplit.pieces.forEach(([a, b], i) => {
      g.frontPieces.push([a, b]);
      add({ id: `front:${s.id}:${i}`, role: 'front', prof: pF, shelfId: s.id,
        x0: a, x1: b, y0: D - pF.t, y1: D, z0: zBeamTop - pF.h, z1: zBeamTop, axis: 'x' });
    });

    // crossbeams
    for (const c of cross) {
      add({ id: `cross:${s.id}:${c.id}`, role: 'cross', prof: pC, shelfId: s.id, refId: c.id,
        x0: c.x - pC.t / 2, x1: c.x + pC.t / 2, y0: 0, y1: D, z0: zBeamTop, z1: Z - tO, axis: 'y' });
    }
    if (D > maxUsable(pC, trim)) issue('error', `Crossbeams (${fmtMM(D)} mm) are longer than the longest ${pC.name} stock.`);

    // OSB, joints only over crossbeams
    const osb = splitAt(W, sh.len, cross.map(c => c.x));
    if (!osb.ok) issue('error', `${shelfLabel(s.id)}: the shelf is wider than one ${sh.name} sheet and no crossbeam lies where the sheets must join. Add a crossbeam within ${fmtMM(sh.len)} mm of the end.`, s.id);
    osb.pieces.forEach(([a, b], i) => {
      g.osbPieces.push([a, b]);
      sheets.push({ id: `osb:${s.id}:${i}`, shelfId: s.id, x0: a, x1: b, y0: 0, y1: D, z0: Z - tO, z1: Z, w: b - a, dpt: D });
    });
    if (D > sh.wid) issue('error', `Shelf depth ${fmtMM(D)} mm is more than the sheet width ${fmtMM(sh.wid)} mm.`);

    /* -------- joints -------- */
    // ledger → wall fixings
    const rw = d.rules.ledgerWall;
    g.ledgerPieces.forEach(([a, b], pi) => {
      const len = b - a; const e = Math.min(rw.edge, len / 2);
      const n = Math.max(2, Math.ceil((len - 2 * e) / Math.max(50, rw.spacing)) + 1);
      for (let k = 0; k < n; k++) {
        const x = a + e + (len - 2 * e) * k / (n - 1);
        const zc = zBeamTop - pL.h / 2;
        const z = rw.stagger ? zc + (k % 2 === 0 ? 1 : -1) * pL.h * 0.22 : zc;
        const id = `lw:${s.id}:${pi}:${k}`;
        const items = ruleItems(d, id, 'ledgerWall');
        if (!items) continue;
        const j = { id, rule: 'ledgerWall', shelfId: s.id, x, y: pL.t, z, items, ov: !!d.overrides[id] };
        joints.push(j); g.fixings.push(j);
      }
    });
    for (const c of cross) {
      let id = `cl:${s.id}:${c.id}`, items = ruleItems(d, id, 'crossLedger');
      if (items) joints.push({ id, rule: 'crossLedger', shelfId: s.id, x: c.x, y: pL.t / 2, z: zBeamTop, items, ov: !!d.overrides[id] });
      id = `cf:${s.id}:${c.id}`; items = ruleItems(d, id, 'crossFront');
      if (items) joints.push({ id, rule: 'crossFront', shelfId: s.id, x: c.x, y: D - pF.t / 2, z: zBeamTop, items, ov: !!d.overrides[id] });
    }
    // front beam → legs
    for (const l of legs) {
      const zc = zBeamTop - pF.h / 2;
      const spliced = g.frontPieces.some(([a, b]) => Math.abs(a - l.x) < 0.5) && g.frontPieces.some(([a, b]) => Math.abs(b - l.x) < 0.5);
      const sides = spliced ? ['L', 'R'] : ['M'];
      for (const sd of sides) {
        const id = `fl:${s.id}:${l.id}:${sd}`;
        const items = ruleItems(d, id, 'frontLeg');
        if (!items) continue;
        const dx = sd === 'L' ? -legDx / 4 : sd === 'R' ? legDx / 4 : 0;
        joints.push({ id, rule: 'frontLeg', shelfId: s.id, legId: l.id, side: sd, x: l.x + dx, y: D + legDy, z: zc, items, ov: !!d.overrides[id] });
      }
    }
    // OSB → crossbeams
    const ro = d.rules.osbCross;
    for (const c of cross) {
      // a crossbeam at a sheet joint gets a row per sheet
      const atJoint = g.osbPieces.some(([a, b], i) => i > 0 && Math.abs(a - c.x) < 0.5);
      const rows = atJoint ? [-pC.t / 4, pC.t / 4] : [0];
      rows.forEach((dx, ri) => {
        const e = Math.min(ro.edge, D / 2);
        const n = Math.max(2, Math.ceil((D - 2 * e) / Math.max(50, ro.spacing)) + 1);
        for (let k = 0; k < n; k++) {
          const y = e + (D - 2 * e) * k / (n - 1);
          const id = `oc:${s.id}:${c.id}:${ri}:${k}`;
          const items = ruleItems(d, id, 'osbCross');
          if (!items) continue;
          joints.push({ id, rule: 'osbCross', shelfId: s.id, x: c.x + dx, y, z: Z, items, ov: !!d.overrides[id] });
        }
      });
    }
  }
  for (const m of d.manual) {
    joints.push({ id: m.id, rule: 'manual', shelfId: m.shelfId, x: m.x, y: m.y, z: m.z, items: m.items, note: m.note, manual: true });
  }

  for (const mem of members) mem.where = mem.shelfId ? shelfLabel(mem.shelfId) : '';
  for (const s of sheets) { s.where = shelfLabel(s.shelfId); s.sheetId = sh.id; s.role = 'osb'; }
  const model = { d, pL, pC, pF, pP, sh, tO, W, D, legDx, legDy, legs, shelves, shelfGeo, members, sheets, joints, issues, topZ,
    feet: [], hasWall: true, bbox: { x0: 0, x1: W, y0: 0, y1: D + legDy, z1: topZ } };
  geometryChecks(model);
  model.checks = engineeringChecks(model);
  markParts(model);
  return model;
}

/* ---------------- geometry sanity ---------------- */
function geometryChecks(m) {
  const { d, pC, pF, pL, tO, W, legDx, shelves, legs } = m;
  const issue = (level, msg, where) => m.issues.push({ level, msg, where });
  if (legs.length < 2) issue('error', 'At least 2 legs are needed.');
  for (let i = 0; i < legs.length - 1; i++)
    if (legs[i + 1].x - legs[i].x < legDx) issue('error', 'Two legs overlap.');
  if (legs.length && legs[0].x > legDx / 2 + 300) issue('warn', `Left leg is ${fmtMM(legs[0].x - legDx / 2)} mm in from the end, so the front beam cantilevers. Checked below, but legs at the ends are simpler.`);
  if (legs.length && W - legs[legs.length - 1].x > legDx / 2 + 300) issue('warn', 'Right leg is far in from the end, so the front beam cantilevers.');
  const beamDrop = pC.h + Math.max(pF.h, pL.h) + tO;
  for (let i = 0; i < shelves.length; i++) {
    const s = shelves[i];
    const cross = m.shelfGeo[s.id].cross;
    if (cross.length < 2) issue('error', `${shelfLabel(s.id)}: needs at least 2 crossbeams.`, s.id);
    for (let k = 0; k < cross.length - 1; k++)
      if (cross[k + 1].x - cross[k].x < pC.t) issue('error', `${shelfLabel(s.id)}: two crossbeams overlap.`, s.id);
    if (cross.length) {
      if (cross[0].x - pC.t / 2 > 60) issue('warn', `${shelfLabel(s.id)}: the left OSB edge overhangs the first crossbeam by ${fmtMM(cross[0].x)} mm (to its centre).`, s.id);
      if (W - cross[cross.length - 1].x - pC.t / 2 > 60) issue('warn', `${shelfLabel(s.id)}: the right OSB edge overhangs the last crossbeam.`, s.id);
    }
    const below = shelves[i + 1];
    if (below) {
      const open = s.z - beamDrop - below.z;
      if (open < 0) issue('error', `${shelfLabel(s.id)} and ${shelfLabel(below.id)} collide.`, s.id);
      else if (open < 150) issue('warn', `Only ${fmtMM(open)} mm clear opening under ${shelfLabel(s.id)}.`, s.id);
    } else if (s.z - beamDrop < 0) issue('error', `${shelfLabel(s.id)} is too low: its beams go below the floor.`, s.id);
  }
  if (shelves.length && shelves[0].z > 2100) issue('info', `Top shelf at ${fmtMM(shelves[0].z)} mm: you will need a step to reach it.`);
  if (d.rules.crossFront.items.every(it => !it.n)) issue('warn', 'Crossbeams are not screwed to the front beam. They must be, because that is what ties the legs back to the wall.');
  if (d.rules.osbCross.items.every(it => !it.n)) issue('warn', 'OSB is not screwed to the crossbeams. The screwed-down OSB is what makes the rack stiff sideways.');
  if (d.rules.ledgerWall.spacing > 600) issue('warn', 'Ledger wall fixings more than 600 mm apart.');
  const p = profile(d.roles.cross);
  if (p.t < 35 || p.h < 70) issue('info', `${p.name} used as crossbeam is slender. Watch the crossbeam check.`);
}

/* ---------------- engineering ---------------- */
function engineeringChecks(m) {
  const { d, pL, pC, pF, pP, sh, tO, W, D, legs, shelves, shelfGeo, legDx, legDy } = m;
  const T = TIMBER[d.grade] || TIMBER.C18;
  const tf = timberFactors(d.serviceClass);
  const fmd = T.fmk * tf.kmod / tf.gM;
  const fc0d = T.fc0k * tf.kmod / tf.gM;
  const fc90d = T.fc90k * tf.kmod / tf.gM;
  const SP = sheetProps(sh, d.serviceClass);
  const fmdS = SP.fm * SP.kmod / SP.gM;
  const lim = d.deflLimit;
  const out = [];
  const push = (c) => { c.status = c.util == null ? 'info' : c.util > 1 ? 'fail' : c.util > 0.85 ? 'warn' : 'ok'; out.push(c); };

  const legN = Object.fromEntries(legs.map(l => [l.id, 0]));
  const timberLineSW = (p) => T.rho * p.t * p.h * 1e-9 * G; // N/mm

  for (const s of shelves) {
    const g = shelfGeo[s.id]; const lab = shelfLabel(s.id);
    const cross = g.cross;
    const q = s.load * G / (W * D);                 // N/mm² imposed
    const gs = SP.rho * tO * 1e-9 * G;               // N/mm² OSB self weight
    const qd = GAM_G * gs + GAM_Q * q;

    /* OSB between crossbeams (per mm width strip) */
    {
      const I = tO ** 3 / 12;
      let worst = { util: 0, txt: '' };
      for (const [a, b] of g.osbPieces) {
        const cs = cross.map(c => c.x).filter(x => x >= a - 0.5 && x <= b + 0.5);
        if (cs.length < 2) { worst = { util: 9, txt: `OSB piece ${fmtMM(a)}–${fmtMM(b)} has fewer than 2 crossbeams under it` }; continue; }
        for (let i = 0; i < cs.length - 1; i++) {
          const L = cs[i + 1] - cs[i];
          const sig = (qd * L * L / 8) * 6 / tO ** 2;
          const dG = 5 * gs * L ** 4 / (384 * SP.E * I), dQ = 5 * q * L ** 4 / (384 * SP.E * I);
          const dfin = dG * (1 + SP.kdef) + dQ * (1 + PSI2 * SP.kdef);
          const u = Math.max(sig / fmdS, dfin / (L / lim));
          if (u > worst.util) worst = { util: u, txt: `Span ${fmtMM(L)} mm: stress ${sig.toFixed(2)}/${fmdS.toFixed(2)} MPa, long-term sag ${dfin.toFixed(1)} mm (limit ${(L / lim).toFixed(1)})` };
        }
        for (const ov of [cs[0] - a, b - cs[cs.length - 1]]) {
          if (ov <= pC.t / 2 + 1) continue;
          const sig = (qd * ov * ov / 2) * 6 / tO ** 2;
          const dQ = q * ov ** 4 / (8 * SP.E * I), dG = gs * ov ** 4 / (8 * SP.E * I);
          const dfin = dG * (1 + SP.kdef) + dQ * (1 + PSI2 * SP.kdef);
          const u = Math.max(sig / fmdS, dfin / (2 * ov / lim));
          if (u > worst.util) worst = { util: u, txt: `Edge overhang ${fmtMM(ov)} mm: stress ${sig.toFixed(2)} MPa, sag ${dfin.toFixed(1)} mm` };
        }
      }
      push({ shelfId: s.id, name: `${lab} · OSB between crossbeams`, util: worst.util, detail: worst.txt,
        fix: 'Move crossbeams closer together or use thicker sheet.' });
    }

    /* crossbeams */
    const L = D - pL.t / 2 - pF.t / 2;
    const Ic = pC.t * pC.h ** 3 / 12, Wc = pC.t * pC.h ** 2 / 6;
    const rearSLS = [], frontD = [];
    let worstC = { util: 0, txt: '' }, worstB = 0;
    cross.forEach((c, i) => {
      const left = i === 0 ? c.x : (c.x - cross[i - 1].x) / 2;
      const right = i === cross.length - 1 ? W - c.x : (cross[i + 1].x - c.x) / 2;
      const trib = left + right;
      const wQ = q * trib, wG = gs * trib + timberLineSW(pC);
      const wd = GAM_G * wG + GAM_Q * wQ;
      const sig = wd * L * L / 8 / Wc;
      const dfin = (5 * L ** 4 / (384 * T.E0 * Ic)) * (wG * (1 + tf.kdef) + wQ * (1 + PSI2 * tf.kdef));
      const u = Math.max(sig / fmd, dfin / (L / lim));
      if (u > worstC.util) worstC = { util: u, txt: `Worst at x=${fmtMM(c.x)} (carries ${fmtMM(trib)} mm width): stress ${sig.toFixed(1)}/${fmd.toFixed(1)} MPa, long-term sag ${dfin.toFixed(1)} mm (limit ${(L / lim).toFixed(1)})` };
      const Rd = wd * L / 2;
      const bear = Rd / (pC.t * Math.min(pL.t, pF.t));
      worstB = Math.max(worstB, bear / fc90d);
      rearSLS.push({ x: c.x, P: (wG + wQ) * L / 2, Pd: Rd });
      frontD.push({ x: c.x, P: Rd, Psls: (wG + wQ) * L / 2, PG: wG * L / 2, PQ: wQ * L / 2 });
    });
    push({ shelfId: s.id, name: `${lab} · Crossbeams (${pC.t}×${pC.h}, span ${fmtMM(L)})`, util: worstC.util, detail: worstC.txt,
      fix: 'Add crossbeams (less width each) or use a taller profile.' });
    push({ shelfId: s.id, name: `${lab} · Crossbeam bearing on ledger/front beam`, util: worstB,
      detail: `Crushing across the grain: ${(worstB * 100).toFixed(0)} % of capacity` });

    /* front beam spans between legs */
    {
      const If = pF.t * pF.h ** 3 / 12, Wf = pF.t * pF.h ** 2 / 6;
      const wSW = timberLineSW(pF);
      const xs = legs.map(l => l.x);
      let worst = { util: 0, txt: 'no legs' };
      const react = legs.map(() => ({ L: 0, R: 0 }));   // design reactions from left span (L) / right span (R)
      if (xs.length >= 2) {
        // cantilevers
        frontD.forEach(p => {
          let a = null, li = null;
          if (p.x < xs[0] - 0.5) { a = xs[0] - p.x; li = 0; }
          else if (p.x > xs[xs.length - 1] + 0.5) { a = p.x - xs[xs.length - 1]; li = xs.length - 1; }
          if (a == null) return;
          const sig = p.P * a / Wf;
          const dfin = (a ** 3 / (3 * T.E0 * If)) * (p.PG * (1 + tf.kdef) + p.PQ * (1 + PSI2 * tf.kdef));
          const u = Math.max(sig / fmd, dfin / (2 * a / lim));
          if (u > worst.util) worst = { util: u, txt: `Cantilever ${fmtMM(a)} mm past a leg: stress ${sig.toFixed(1)} MPa, sag ${dfin.toFixed(1)} mm` };
          if (li === 0) react[0].L += p.P; else react[li].R += p.P;
        });
        for (let i = 0; i < xs.length - 1; i++) {
          const a = xs[i], b = xs[i + 1], Ls = b - a;
          const pts = frontD.filter(p => p.x >= a - 0.5 && (i === xs.length - 2 ? p.x <= b + 0.5 : p.x < b - 0.5));
          const wd = GAM_G * wSW;
          let RL = wd * Ls / 2, RR = wd * Ls / 2;
          pts.forEach(p => { const u = Math.min(Math.max(p.x - a, 0), Ls); RL += p.P * (Ls - u) / Ls; RR += p.P * u / Ls; });
          // max moment by sampling
          let Mmax = 0;
          for (let k = 0; k <= 60; k++) {
            const xx = Ls * k / 60;
            let M = RL * xx - wd * xx * xx / 2;
            pts.forEach(p => { const u = p.x - a; if (u < xx) M -= p.P * (xx - u); });
            Mmax = Math.max(Mmax, M);
          }
          const sig = Mmax / Wf;
          let dG = 5 * wSW * Ls ** 4 / (384 * T.E0 * If), dQ = 0;
          pts.forEach(p => {
            const u = Math.min(Math.max(p.x - a, 0), Ls); const bb = Math.min(u, Ls - u);
            const f = bb * (3 * Ls * Ls - 4 * bb * bb) / (48 * T.E0 * If);
            dG += p.PG * f; dQ += p.PQ * f;
          });
          const dfin = dG * (1 + tf.kdef) + dQ * (1 + PSI2 * tf.kdef);
          const u = Math.max(sig / fmd, Ls > 0 ? dfin / (Ls / lim) : 0);
          if (u > worst.util) worst = { util: u, txt: `Span ${fmtMM(Ls)} mm between legs: stress ${sig.toFixed(1)}/${fmd.toFixed(1)} MPa, long-term sag ${dfin.toFixed(1)} mm (limit ${(Ls / lim).toFixed(1)})` };
          react[i].R += RL;      // span lies to the right of leg i
          react[i + 1].L += RR;  // and to the left of leg i+1
        }
      }
      push({ shelfId: s.id, name: `${lab} · Front beam (${pF.t}×${pF.h})`, util: worst.util, detail: worst.txt,
        fix: 'Add a leg or use a taller profile.' });

      /* front beam → leg screws */
      let worstS = { util: 0, txt: '' }, anyCap = false;
      legs.forEach((l, i) => {
        const spliced = g.frontPieces.some(([a]) => Math.abs(a - l.x) < 0.5) && g.frontPieces.some(([, b]) => Math.abs(b - l.x) < 0.5);
        const interior = i > 0 && i < legs.length - 1 && !spliced;
        const k = interior ? 1.25 : 1.0;      // continuity allowance over interior legs
        const tot = (react[i].L + react[i].R) * k;
        legN[l.id] += tot;
        const parts = spliced ? [['L', react[i].L], ['R', react[i].R]] : [['M', tot]];
        for (const [sd, R] of parts) {
          const j = m.joints.find(jj => jj.id === `fl:${s.id}:${l.id}:${sd}`);
          let cap = 0;
          if (j) j.items.forEach(it => { const f = fastener(it.type); if (f && f.cap) { cap += f.cap * 1000 * it.n; anyCap = true; } });
          const u = cap > 0 ? R / cap : (R > 0 ? 9 : 0);
          if (u > worstS.util) worstS = { util: u, txt: `Leg at x=${fmtMM(l.x)}: ${(R / 1000).toFixed(2)} kN design load on screws rated ${(cap / 1000).toFixed(2)} kN` };
        }
      });
      push({ shelfId: s.id, name: `${lab} · Front beam → leg screws`, util: anyCap ? worstS.util : null,
        detail: anyCap ? worstS.txt : 'No screw capacity entered in the Library, so this cannot be checked.',
        fix: 'More screws per joint, or screw a support block under the front beam onto the leg.' });
    }

    /* ledger fixings + ledger bending */
    {
      const fixLoad = new Map(g.fixings.map(f => [f.id, 0]));
      const Wl = pL.t * pL.h ** 2 / 6;
      let worstBend = 0;
      for (const p of rearSLS) {
        const pieceIdx = g.ledgerPieces.findIndex(([a, b]) => p.x >= a - 0.5 && p.x <= b + 0.5);
        const fx = g.fixings.filter(f => f.id.startsWith(`lw:${s.id}:${pieceIdx}:`)).sort((a, b) => a.x - b.x);
        if (!fx.length) continue;
        let li = -1; for (let k = 0; k < fx.length; k++) if (fx[k].x <= p.x) li = k;
        if (li === -1) fixLoad.set(fx[0].id, fixLoad.get(fx[0].id) + p.P);
        else if (li === fx.length - 1) fixLoad.set(fx[li].id, fixLoad.get(fx[li].id) + p.P);
        else {
          const A = fx[li], B = fx[li + 1], Ls = B.x - A.x, u = p.x - A.x;
          fixLoad.set(A.id, fixLoad.get(A.id) + p.P * (Ls - u) / Ls);
          fixLoad.set(B.id, fixLoad.get(B.id) + p.P * u / Ls);
          worstBend = Math.max(worstBend, (p.Pd * u * (Ls - u) / Ls) / Wl / fmd);
        }
      }
      const e = pL.t / 2, lever = d.rules.ledgerWall.stagger ? pL.h * 0.44 + pL.h * 0.28 : pL.h * 0.5;
      const ecc = Math.sqrt(1 + (e / lever) ** 2);
      let worst = { util: 0, txt: '' }, anyCap = false;
      for (const f of g.fixings) {
        let cap = 0;
        f.items.forEach(it => { const ft = fastener(it.type); if (ft && ft.cap && ft.kind === 'plug') { cap += ft.cap * 1000 * it.n; anyCap = true; } });
        const P = fixLoad.get(f.id) * ecc;
        const u = cap > 0 ? P / cap : (P > 0 ? 9 : 0);
        if (u > worst.util) worst = { util: u, txt: `Fixing at x=${fmtMM(f.x)}: ${(P / 1000).toFixed(2)} kN working load (incl. ${((ecc - 1) * 100).toFixed(0)} % for prying) vs ${(cap / 1000).toFixed(2)} kN rated` };
      }
      push({ shelfId: s.id, name: `${lab} · Wall plugs (ledger → brick)`, util: anyCap ? worst.util : null,
        detail: anyCap ? worst.txt : 'Enter the plug\'s recommended load (kN) in the Library to check this.',
        fix: 'Closer fixing spacing, bigger plugs, or 2 plugs per point.' });
      push({ shelfId: s.id, name: `${lab} · Ledger bending between fixings`, util: worstBend,
        detail: `${(worstBend * 100).toFixed(0)} % of bending capacity` });
    }
  }

  /* legs: compression + buckling */
  {
    const A = legDx * legDy, tmin = Math.min(legDx, legDy);
    const levels = [0, ...shelves.map(s => shelfGeo[s.id].zBeamTop - pF.h / 2)].sort((a, b) => a - b);
    let Le = 0; for (let i = 0; i < levels.length - 1; i++) Le = Math.max(Le, levels[i + 1] - levels[i]);
    const i_ = tmin / Math.sqrt(12), lam = Le / i_;
    const lrel = lam / Math.PI * Math.sqrt(T.fc0k / T.E05);
    const k = 0.5 * (1 + 0.2 * (lrel - 0.3) + lrel * lrel);
    const kc = Math.min(1, 1 / (k + Math.sqrt(Math.max(k * k - lrel * lrel, 0))));
    let worst = { util: 0, txt: '' };
    const swLeg = T.rho * A * 1e-9 * G * m.topZ * GAM_G;
    legs.forEach(l => {
      const N = legN[l.id] + swLeg;
      const u = N / A / (kc * fc0d);
      if (u >= worst.util) worst = { util: u, txt: `Leg at x=${fmtMM(l.x)}: ${(N / 1000).toFixed(2)} kN, buckling length ${fmtMM(Le)} mm, k_c=${kc.toFixed(2)}` };
    });
    push({ shelfId: null, name: `Legs (${pP.t}×${pP.h}), compression and buckling`, util: worst.util, detail: worst.txt });
  }

  return {
    list: out,
    basis: { grade: d.grade, fmd, fc0d, fmdS, SP, tf },
  };
}

/* ---------------- part marks (cut list) ---------------- */
const ROLE_NAME = {
  leg: 'Leg', ledger: 'Wall ledger', front: 'Front beam', cross: 'Crossbeam',
  post: 'Leg post', rail: 'Top frame rail', endrail: 'Top end rail', topcross: 'Top cross rail', joist: 'Joist',
  srail: 'Shelf rail (long)', scross: 'Shelf cross rail', strip: 'Joist support strip',
};
const ROLE_LETTER = { leg: 'P', ledger: 'L', front: 'F', cross: 'C', post: 'P', rail: 'R', endrail: 'E', topcross: 'X', joist: 'J', srail: 'S', scross: 'K', strip: 'T' };
const ROLE_ORDER = ['leg', 'post', 'ledger', 'front', 'rail', 'endrail', 'topcross', 'joist', 'srail', 'scross', 'strip', 'cross'];
const SHEET_ROLE_NAME = { osb: 'Shelf board', top: 'Bench top', shelf: 'Shelf board', panel: 'Panel', pad: 'Caster pad' };

function markParts(m) {
  const groups = new Map();
  for (const mem of m.members) {
    const len = Math.round(mem.axis === 'x' ? mem.x1 - mem.x0 : mem.axis === 'y' ? mem.y1 - mem.y0 : mem.z1 - mem.z0);
    mem.len = len;
    const key = mem.role + '|' + mem.prof.id + '|' + len;
    if (!groups.has(key)) groups.set(key, { role: mem.role, prof: mem.prof, len, members: [] });
    groups.get(key).members.push(mem);
  }
  const arr = [...groups.values()].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.len - a.len);
  const cnt = {};
  for (const g of arr) {
    const L = ROLE_LETTER[g.role] || 'M';
    cnt[L] = (cnt[L] || 0) + 1;
    g.mark = L + cnt[L];
    g.members.forEach(mm => mm.mark = g.mark);
  }
  m.parts = arr;
  // sheets: grouped by material + size (+ role so tops and shelves get separate marks)
  const sg = new Map();
  for (const s of m.sheets) {
    s.sheetId = s.sheetId || m.sh.id;
    s.role = s.role || 'osb';
    const key = s.sheetId + '|' + s.role + '|' + Math.round(s.w) + 'x' + Math.round(s.dpt) + '|' + (s.note || '');
    if (!sg.has(key)) sg.set(key, { sheetId: s.sheetId, role: s.role, note: s.note || '', w: Math.round(s.w), dpt: Math.round(s.dpt), items: [] });
    sg.get(key).items.push(s);
  }
  let k = 0;
  m.sheetParts = [...sg.values()].sort((a, b) => a.role.localeCompare(b.role) || b.w * b.dpt - a.w * a.dpt).map(g => { g.mark = 'O' + (++k); g.items.forEach(s => s.mark = g.mark); return g; });
}
