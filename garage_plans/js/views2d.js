'use strict';
/* ============================================================
   2D designer views (SVG): front elevation, side section, plan
   ============================================================ */

const V = { front: { id: 'svg-front' }, side: { id: 'svg-side' }, plan: { id: 'svg-plan' } };
let drag = null;

const RULE_COLOR = { ledgerWall: '#c2185b', crossLedger: '#00897b', crossFront: '#00897b', frontLeg: '#e65100', osbCross: '#1e63b5', manual: '#7b1fa2' };

function initViews() {
  for (const key of Object.keys(V)) {
    const v = V[key];
    v.key = key;
    v.svg = document.getElementById(v.id);
    v.svg.addEventListener('pointerdown', (e) => onDown(v, e));
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function toSvg(v, e) {
  const pt = v.svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const m = v.svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function setVB(v, x, y, w, h) {
  if (!drag || !v.vb) v.vb = [x, y, w, h];
  const [vx, vy, vw, vh] = v.vb;
  v.svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  const cw = v.svg.clientWidth || 800, ch = v.svg.clientHeight || 500;
  v.k = Math.max(vw / cw, vh / ch);
}

/* ---------- drawing helpers (user units = mm) ---------- */
const r1 = (n) => Math.round(n * 10) / 10;
function rect(x, y, w, h, cls, attrs = '') {
  return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(w, 0.1))}" height="${r1(Math.max(h, 0.1))}" class="${cls}" ${attrs}/>`;
}
function line(x1, y1, x2, y2, cls, attrs = '') {
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" class="${cls}" ${attrs}/>`;
}
function txt(x, y, s, v, cls = '', attrs = '', size = 1) {
  const fs = 12 * v.k * size;
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(fs)}" class="${cls}" style="stroke-width:${r1(3 * v.k)}" ${attrs}>${esc(s)}</text>`;
}
function dimH(v, x1, x2, y, label, data = '', ext = null) {
  if (Math.abs(x2 - x1) < 0.5) return '';
  const t = 4 * v.k;
  let s = `<g class="dim">`;
  if (ext) { s += line(x1, ext[0], x1, y + t, 'ext'); s += line(x2, ext[1], x2, y + t, 'ext'); }
  s += line(x1, y, x2, y, 'dl') + line(x1 - t, y + t, x1 + t, y - t, 'dl') + line(x2 - t, y + t, x2 + t, y - t, 'dl');
  s += txt((x1 + x2) / 2, y - 4 * v.k, label, v, data ? 'dimtxt edit' : 'dimtxt', data + ' text-anchor="middle"');
  return s + '</g>';
}
function dimV(v, y1, y2, x, label, data = '', ext = null) {
  if (Math.abs(y2 - y1) < 0.5) return '';
  const t = 4 * v.k;
  let s = `<g class="dim">`;
  if (ext) { s += line(ext[0], y1, x + t, y1, 'ext'); s += line(ext[1], y2, x + t, y2, 'ext'); }
  s += line(x, y1, x, y2, 'dl') + line(x - t, y1 + t, x + t, y1 - t, 'dl') + line(x - t, y2 + t, x + t, y2 - t, 'dl');
  const cy = (y1 + y2) / 2;
  s += txt(x - 5 * v.k, cy, label, v, data ? 'dimtxt edit' : 'dimtxt', data + ` text-anchor="middle" transform="rotate(-90 ${r1(x - 5 * v.k)} ${r1(cy)})"`);
  return s + '</g>';
}
function marker(v, j, x, y) {
  const f = j.items[0] ? fastener(j.items[0].type) : null;
  const kind = f ? f.kind : 'screw';
  const r = 4.2 * v.k;
  const col = RULE_COLOR[j.rule] || '#555';
  const sel = S.ui.sel && S.ui.sel.kind === 'joint' && S.ui.sel.id === j.id;
  const cls = `fm${j.ov ? ' ov' : ''}${sel ? ' selm' : ''}`;
  const a = `data-k="joint" data-id="${j.id}" class="${cls}" style="fill:${col}"`;
  const tip = `<title>${esc(jointTitle(j))}</title>`;
  if (kind === 'plug') return `<rect x="${r1(x - r)}" y="${r1(y - r)}" width="${r1(2 * r)}" height="${r1(2 * r)}" ${a}>${tip}</rect>`;
  if (kind === 'hardware') return `<path d="M${r1(x)} ${r1(y - r * 1.2)} L${r1(x + r * 1.1)} ${r1(y + r * .8)} L${r1(x - r * 1.1)} ${r1(y + r * .8)}Z" ${a}>${tip}</path>`;
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" ${a}>${tip}</circle>`;
}
function jointWhere(j) {
  if (j.shelfId) return shelfLabel(j.shelfId);
  if (j.level && S.design.type === 'bench') return ['top', 'back', 'left', 'right', 'floor'].includes(j.level) ? j.level : levelLabel(j.level);
  return '';
}
function jointTitle(j) {
  const rules = TYPES[S.design.type].rules;
  const lab = j.rule === 'manual' ? 'Manual fastener' : rules[j.rule].label.replace(/ \(.*\)$/, '');
  const its = j.items.filter(i => i.n).map(i => `${i.n}× ${(fastener(i.type) || { name: '?' }).name}`).join(', ');
  const w = jointWhere(j);
  return `${lab}${w ? ' · ' + w : ''}: ${its || 'none'}${j.ov ? ' (edited)' : ''}${j.note ? ' · ' + j.note : ''}`;
}
function hatchDefs(id) {
  return `<defs><pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="40" class="hatch"/></pattern></defs>`;
}
const isSel = (kind, id) => S.ui.sel && S.ui.sel.kind === kind && S.ui.sel.id === id;

/* ---------- FRONT ELEVATION ---------- */
function renderFront(m) {
  const v = V.front; if (!v.svg || !v.svg.clientWidth) return;
  const { W, topZ, pC, pF, pL, tO, legs, shelves, shelfGeo, legDx } = m;
  const H = topZ + Math.max(0, S.design.legTopExtra);
  const base = Math.max(W, H);
  const mL = base * 0.13, mR = base * 0.16, mT = base * 0.1, mB = base * 0.14;
  setVB(v, -mL, -(H + mT), W + mL + mR, H + mT + mB);
  const showF = S.ui.showFasteners !== false;
  let s = hatchDefs('hf');
  s += rect(-mL * 0.5, -H - mT * 0.4, W + mL * 0.5 + mR * 0.5, H + mT * 0.4, 'wallbg');
  s += rect(-mL, 0, W + mL + mR, mB * 0.18, 'floor', 'fill="url(#hf)"') + line(-mL, 0, W + mR, 0, 'floorline');

  const selShelf = S.ui.selShelf;
  for (const sh of shelves) {
    const g = shelfGeo[sh.id];
    const ss = sh.id === selShelf;
    // ledger (behind)
    for (const [a, b] of g.ledgerPieces) s += rect(a, -g.zBeamTop, b - a, pL.h, 'm-ledger ghost');
    // crossbeam ends
    for (const c of g.cross)
      s += rect(c.x - pC.t / 2, -(sh.z - tO), pC.t, pC.h, `m-cross drag-x${isSel('cross', c.id) && ss ? ' sel' : ''}`, `data-k="cross" data-shelf="${sh.id}" data-id="${c.id}"`);
    // front beam pieces
    for (const [a, b] of g.frontPieces) s += rect(a, -g.zBeamTop, b - a, pF.h, `m-front drag-y${ss ? ' shelfsel' : ''}`, `data-k="shelf" data-id="${sh.id}"`);
    // OSB
    for (const [a, b] of g.osbPieces) s += rect(a, -sh.z, b - a, tO, `m-osb drag-y${ss ? ' shelfsel' : ''}`, `data-k="shelf" data-id="${sh.id}"`);
    // height tag on the right
    s += txt(W + mR * 0.12, -sh.z + 4 * v.k, `${shelfLabel(sh.id)}  ▲ ${fmtMM(sh.z)}`, v, 'dimtxt edit lbl' + (ss ? ' strong' : ''), `data-k="dim" data-dim="shelfZ" data-id="${sh.id}"`);
    s += line(W + 5 * v.k, -sh.z, W + mR * 0.1, -sh.z, 'ext');
  }
  // legs (in front)
  for (const l of legs) {
    s += rect(l.x - legDx / 2, -(topZ + S.design.legTopExtra), legDx, topZ + S.design.legTopExtra, `m-leg drag-x${isSel('leg', l.id) ? ' sel' : ''}`, `data-k="leg" data-id="${l.id}"`);
  }
  // fasteners
  if (showF) for (const j of m.joints) {
    if (j.rule === 'osbCross') continue;
    s += marker(v, j, j.x, -j.z);
  }
  // opening dims (left)
  const drop = tO + pC.h + Math.max(pF.h, pL.h);
  const xo = -mL * 0.35;
  for (let i = 0; i < shelves.length; i++) {
    const up = shelves[i], lo = shelves[i + 1];
    const yTop = -(up.z - drop);
    if (lo) s += dimV(v, -lo.z, yTop, xo, `opening ${fmtMM(up.z - drop - lo.z)}`, `data-k="dim" data-dim="opening" data-id="${lo.id}" data-up="${up.id}"`, [0, 0]);
    else s += dimV(v, 0, yTop, xo, `under ${fmtMM(up.z - drop)}`, `data-k="dim" data-dim="under" data-id="${up.id}"`);
  }
  // crossbeam chain (top) for selected shelf
  const sg = shelfGeo[selShelf] || shelfGeo[shelves[0] && shelves[0].id];
  if (sg) {
    const yd = -(H + mT * 0.45);
    const pts = [0, ...sg.cross.map(c => c.x), W];
    s += txt(-mL * 0.95, yd - 4 * v.k, `Crossbeams ${shelfLabel(sg.shelf.id)}${S.design.linkCross ? ' (all shelves)' : ''}, centre-to-centre:`, v, 'dimcap', 'text-anchor="start"');
    for (let i = 0; i < pts.length - 1; i++)
      s += dimH(v, pts[i], pts[i + 1], yd + 14 * v.k, fmtMM(pts[i + 1] - pts[i]), `data-k="dim" data-dim="crossSeg" data-shelf="${sg.shelf.id}" data-i="${i}"`);
  }
  // leg chain + overall width (bottom)
  const lp = [0, ...legs.map(l => l.x), W];
  for (let i = 0; i < lp.length - 1; i++)
    s += dimH(v, lp[i], lp[i + 1], mB * 0.45, fmtMM(lp[i + 1] - lp[i]), `data-k="dim" data-dim="legSeg" data-i="${i}"`);
  s += txt(-mL * 0.95, mB * 0.45 - 4 * v.k, 'Legs c/c:', v, 'dimcap', 'text-anchor="start"');
  s += dimH(v, 0, W, mB * 0.8, `width ${fmtMM(W)}`, `data-k="dim" data-dim="W"`);
  v.svg.innerHTML = s;
}

/* ---------- SIDE SECTION ---------- */
function renderSide(m) {
  const v = V.side; if (!v.svg || !v.svg.clientWidth) return;
  const { D, topZ, pC, pF, pL, tO, shelves, shelfGeo, legDy } = m;
  const H = topZ + Math.max(0, S.design.legTopExtra);
  const Dt = D + legDy;
  const base = Math.max(Dt * 1.6, H);
  const mL = base * 0.12, mR = base * 0.24, mT = base * 0.06, mB = base * 0.17;
  setVB(v, -mL, -(H + mT), Dt + mL + mR, H + mT + mB);
  let s = hatchDefs('hs');
  s += rect(-mL * 0.6, -H - mT * 0.6, mL * 0.6, H + mT * 0.6, 'wall', 'fill="url(#hs)"') + line(0, -H - mT * 0.6, 0, 0, 'wallline');
  s += rect(-mL, 0, Dt + mL + mR, mB * 0.15, 'floor', 'fill="url(#hs)"') + line(-mL, 0, Dt + mR, 0, 'floorline');
  const showF = S.ui.showFasteners !== false;
  for (const sh of shelves) {
    const g = shelfGeo[sh.id];
    const ss = sh.id === S.ui.selShelf;
    s += rect(0, -g.zBeamTop, pL.t, pL.h, 'm-ledger');
    s += rect(D - pF.t, -g.zBeamTop, pF.t, pF.h, 'm-front');
    s += rect(0, -(sh.z - tO), D, pC.h, `m-cross drag-y${ss ? ' shelfsel' : ''}`, `data-k="shelf" data-id="${sh.id}"`);
    s += rect(0, -sh.z, D, tO, `m-osb drag-y${ss ? ' shelfsel' : ''}`, `data-k="shelf" data-id="${sh.id}"`);
    s += txt(Dt + mR * 0.1, -sh.z + 4 * v.k, `${shelfLabel(sh.id)} ▲ ${fmtMM(sh.z)}`, v, 'dimtxt edit lbl' + (ss ? ' strong' : ''), `data-k="dim" data-dim="shelfZ" data-id="${sh.id}"`);
    s += txt(Dt + mR * 0.1, -g.zBeamTop + 14 * v.k, `beams top ${fmtMM(g.zBeamTop)}`, v, 'dimcap', '');
  }
  s += rect(D, -(topZ + S.design.legTopExtra), legDy, topZ + S.design.legTopExtra, 'm-leg');
  if (showF) for (const j of m.joints) {
    if (j.rule === 'osbCross' || j.rule === 'manual') continue;
    if (j.rule === 'ledgerWall' || j.rule === 'frontLeg') {
      // only show one per shelf in section (they repeat along the wall)
      if (m.joints.find(o => o.rule === j.rule && o.shelfId === j.shelfId) !== j) continue;
    } else if (m.joints.find(o => o.rule === j.rule && o.shelfId === j.shelfId) !== j) continue;
    const y = j.rule === 'ledgerWall' ? pL.t * 0.5 : j.rule === 'frontLeg' ? D + legDy * 0.5 : j.y;
    s += marker(v, j, y, -j.z);
  }
  s += dimH(v, 0, D, mB * 0.45, `depth ${fmtMM(D)}`, `data-k="dim" data-dim="D"`, [0, 0]);
  s += txt(Dt + 8 * v.k, mB * 0.45 + 4 * v.k, `(footprint ${fmtMM(Dt)} incl. legs)`, v, 'dimcap', '');
  v.svg.innerHTML = s;
}

/* ---------- PLAN (one shelf) ---------- */
function renderPlan(m) {
  const v = V.plan; if (!v.svg || !v.svg.clientWidth) return;
  const { W, D, pC, pF, pL, legs, shelfGeo, legDx, legDy } = m;
  const g = shelfGeo[S.ui.selShelf];
  if (!g) { v.svg.innerHTML = ''; return; }
  const Dt = D + legDy;
  const base = Math.max(W, Dt * 2);
  const mL = base * 0.06, mR = base * 0.1, mT = base * 0.12, mB = base * 0.1;
  setVB(v, -mL, -mT, W + mL + mR, Dt + mT + mB);
  let s = hatchDefs('hp');
  s += rect(-mL, -mT * 0.3, W + mL + mR, mT * 0.3, 'wall', 'fill="url(#hp)"') + line(-mL, 0, W + mR, 0, 'wallline');
  for (const [a, b] of g.ledgerPieces) s += rect(a, 0, b - a, pL.t, 'm-ledger under');
  for (const [a, b] of g.frontPieces) s += rect(a, D - pF.t, b - a, pF.t, 'm-front under');
  g.osbPieces.forEach(([a, b], i) => {
    const sp = m.sheets.find(x => x.id === `osb:${g.shelf.id}:${i}`);
    s += rect(a, 0, b - a, D, 'm-osb plan');
    s += txt((a + b) / 2, D * 0.5, `${sp ? sp.mark : ''} OSB ${fmtMM(b - a)}×${fmtMM(D)}`, v, 'osblbl', 'text-anchor="middle"');
  });
  for (const c of g.cross)
    s += rect(c.x - pC.t / 2, 0, pC.t, D, `m-cross under drag-x${isSel('cross', c.id) ? ' sel' : ''}`, `data-k="cross" data-shelf="${g.shelf.id}" data-id="${c.id}"`);
  for (const l of legs)
    s += rect(l.x - legDx / 2, D, legDx, legDy, `m-leg drag-x${isSel('leg', l.id) ? ' sel' : ''}`, `data-k="leg" data-id="${l.id}"`);
  if (S.ui.showFasteners !== false) for (const j of m.joints) {
    if (j.shelfId !== g.shelf.id) continue;
    let y = j.y;
    if (j.rule === 'ledgerWall') y = pL.t * 0.5;
    if (j.rule === 'frontLeg') y = D + legDy * 0.5;
    s += marker(v, j, j.x, y);
  }
  const pts = [0, ...g.cross.map(c => c.x), W];
  for (let i = 0; i < pts.length - 1; i++)
    s += dimH(v, pts[i], pts[i + 1], -mT * 0.55, fmtMM(pts[i + 1] - pts[i]), `data-k="dim" data-dim="crossSeg" data-shelf="${g.shelf.id}" data-i="${i}"`);
  s += txt(0, -mT * 0.85, `Plan of ${shelfLabel(g.shelf.id)} (z ${fmtMM(g.Z)}). Crossbeams c/c (drag the dashed beams):`, v, 'dimcap', 'text-anchor="start"');
  s += dimV(v, 0, D, W + mR * 0.5, `depth ${fmtMM(D)}`, `data-k="dim" data-dim="D"`);
  v.svg.innerHTML = s;
}

function renderShelfViews(m) { renderFront(m); renderSide(m); renderPlan(m); }

function renderViews(m) {
  TYPES[S.design.type].renderViews(m);
  document.querySelectorAll('.view svg').forEach(el => el.classList.toggle('tool-add', S.ui.tool === 'addFastener'));
}

/* ---------- interaction (generic; type-specific parts in TYPES[type]) ---------- */
function onDown(v, e) {
  if (e.button !== 0) return;
  const t = e.target.closest('[data-k]');
  const p = toSvg(v, e);
  if (S.ui.tool === 'addFastener' && (!t || t.dataset.k !== 'joint')) {
    const mf = TYPES[S.design.type].manualAt(v.key, p);
    if (mf) {
      mf.items = [{ type: S.ui.manualType || (S.library.fasteners[0] && S.library.fasteners[0].id), n: 1 }];
      mf.note = ''; mf.id = uid('mf');
      snapshot(); S.design.manual.push(mf); S.ui.sel = { kind: 'joint', id: mf.id }; App.refresh();
    }
    e.preventDefault();
    return;
  }
  if (!t) { drag = { kind: 'none', v, sx: e.clientX, sy: e.clientY, moved: false }; return; }
  const k = t.dataset.k;
  const dd = { kind: k, v, el: t, sx: e.clientX, sy: e.clientY, p0: p, moved: false, data: { ...t.dataset } };
  if (k !== 'joint' && k !== 'dim') {
    const st = TYPES[S.design.type].dragStart(k, t.dataset);
    if (st) Object.assign(dd, st);
  }
  drag = dd;
  e.preventDefault();
}

function snapV(val, e) {
  const st = e.altKey ? 1 : Math.max(1, S.design.snap || 1);
  return Math.round(val / st) * st;
}

function onMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  if (!drag.obj) return;
  if (!drag.moved) { drag.moved = true; beginGesture(); }
  const p = toSvg(drag.v, e);
  const delta = drag.axis === 'x' ? p.x - drag.p0.x : -(p.y - drag.p0.y);
  let val = snapV(drag.orig + delta, e);
  if (drag.min != null) val = Math.max(val, drag.min);
  if (drag.max != null) val = Math.min(val, drag.max);
  drag.obj[drag.prop] = val;
  if (drag.sel) S.ui.sel = drag.sel;
  if (drag.after) drag.after();
  App.refreshLight();
}

function onUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) { endGesture(); App.refresh(); return; }
  const k = d.kind;
  if (k === 'none') { S.ui.sel = null; App.refresh(); return; }
  if (k === 'joint') { S.ui.sel = { kind: 'joint', id: d.data.id }; App.refresh(); openJointPopover(d.data.id, e.clientX, e.clientY); return; }
  if (k === 'dim') { openDimEdit(d.data, e.clientX, e.clientY); return; }
  if (d.sel) S.ui.sel = d.sel;
  if (d.after) d.after();
  App.refresh();
}

/* ---------- shelf type: drag / manual / dims ---------- */
function shelfDragStart(k, ds) {
  const m = S.model, d = S.design;
  if (k === 'cross') {
    const sh = d.shelves.find(s => s.id === ds.shelf);
    const c = crossOf(sh).find(c => c.id === ds.id);
    return { obj: c, prop: 'x', axis: 'x', orig: c.x, min: m.pC.t / 2, max: d.W - m.pC.t / 2,
      sel: { kind: 'cross', id: c.id, shelfId: ds.shelf }, after: () => { S.ui.selShelf = ds.shelf; } };
  }
  if (k === 'leg') {
    const l = d.legs.find(l => l.id === ds.id);
    return { obj: l, prop: 'x', axis: 'x', orig: l.x, min: m.legDx / 2, max: d.W - m.legDx / 2, sel: { kind: 'leg', id: l.id } };
  }
  if (k === 'shelf') {
    const sh = d.shelves.find(s => s.id === ds.id);
    return { obj: sh, prop: 'z', axis: 'z', orig: sh.z, min: 50, sel: { kind: 'shelf', id: sh.id }, after: () => { S.ui.selShelf = sh.id; } };
  }
  return null;
}
function shelfManualAt(viewKey, p) {
  const m = S.model;
  if (viewKey === 'front') {
    const z = -p.y;
    const near = [...m.shelves].sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];
    return { shelfId: near ? near.id : null, x: Math.round(p.x), y: m.D, z: Math.round(z) };
  }
  if (viewKey === 'plan') {
    const g = m.shelfGeo[S.ui.selShelf];
    return { shelfId: g ? g.shelf.id : null, x: Math.round(p.x), y: Math.round(p.y), z: g ? g.Z : 0 };
  }
  return null;
}

/* ---------- dimension editing ---------- */
function openDimEdit(data, cx, cy) {
  const r = TYPES[S.design.type].dimEdit(data);
  if (!r) return;
  numberPopover(cx, cy, r.title, Math.round(r.cur), (v) => { snapshot(); r.apply(v); App.refresh(); });
}

function shelfDimEdit(data) {
  const m = S.model, d = S.design;
  const drop = m.tO + m.pC.h + Math.max(m.pF.h, m.pL.h);
  let cur = 0, title = '', apply;
  const sh = (id) => d.shelves.find(s => s.id === id);
  switch (data.dim) {
    case 'shelfZ': {
      const s = sh(data.id); cur = s.z; title = `${shelfLabel(s.id)} top of shelf from floor`;
      apply = (v) => { s.z = v; };
      break;
    }
    case 'opening': {
      const lo = sh(data.id), up = sh(data.up); cur = up.z - drop - lo.z;
      title = `Clear opening under ${shelfLabel(up.id)} (moves ${shelfLabel(lo.id)})`;
      apply = (v) => { lo.z = up.z - drop - v; };
      break;
    }
    case 'under': {
      const s = sh(data.id); cur = s.z - drop; title = `Clear height under ${shelfLabel(s.id)}`;
      apply = (v) => { s.z = v + drop; };
      break;
    }
    case 'crossSeg': {
      const s = sh(data.shelf); const arr = [...crossOf(s)].sort((a, b) => a.x - b.x);
      const i = +data.i; const pts = [0, ...arr.map(c => c.x), d.W];
      cur = pts[i + 1] - pts[i];
      if (i < arr.length) { title = `Distance to crossbeam ${i + 1} (moves it)`; apply = (v) => { arr[i].x = pts[i] + v; }; }
      else { title = 'Last crossbeam to right end (moves last crossbeam)'; apply = (v) => { arr[arr.length - 1].x = d.W - v; }; }
      break;
    }
    case 'legSeg': {
      const arr = [...d.legs].sort((a, b) => a.x - b.x);
      const i = +data.i; const pts = [0, ...arr.map(l => l.x), d.W];
      cur = pts[i + 1] - pts[i];
      if (i < arr.length) { title = `Distance to leg ${i + 1} centre (moves it)`; apply = (v) => { arr[i].x = pts[i] + v; }; }
      else { title = 'Last leg centre to right end'; apply = (v) => { arr[arr.length - 1].x = d.W - v; }; }
      break;
    }
    case 'W': cur = d.W; title = 'Overall width (positions scale along)'; apply = (v) => setWidth(v); break;
    case 'D': cur = d.D; title = 'Shelf depth: wall to front face of front beam'; apply = (v) => { d.D = v; }; break;
    default: return null;
  }
  return { cur, title, apply };
}

function setWidth(Wn) {
  const d = S.design, Wo = d.W;
  const pC = profile(d.roles.cross), pP = profile(d.roles.leg);
  const legDx = d.legOrient === 'wideX' ? pP.h : pP.t;
  const sc = (x, w) => Math.round(w / 2 + (x - w / 2) * (Wn - w) / (Wo - w));
  d.cross.forEach(c => c.x = sc(c.x, pC.t));
  d.shelves.forEach(s => s.cross.forEach(c => c.x = sc(c.x, pC.t)));
  d.legs.forEach(l => l.x = sc(l.x, legDx));
  d.W = Wn;
}

function numberPopover(cx, cy, title, value, onOk) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.innerHTML = `<div class="pt">${esc(title)}</div><div class="row"><input type="number" step="1" value="${value}"><span>mm</span><button class="btn primary">OK</button></div>`;
  document.body.appendChild(pop);
  placePopover(pop, cx, cy);
  const inp = pop.querySelector('input');
  inp.focus(); inp.select();
  const ok = () => { const v = parseFloat(inp.value); closePopover(); if (isFinite(v)) onOk(v); };
  pop.querySelector('button').onclick = ok;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') closePopover(); });
}
function placePopover(pop, cx, cy) {
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(cx + 10, window.innerWidth - w - 8)) + 'px';
  pop.style.top = Math.max(8, Math.min(cy + 10, window.innerHeight - h - 8)) + 'px';
}
function closePopover() { document.querySelectorAll('.popover').forEach(p => p.remove()); }
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.popover') && !e.target.closest('[data-k="dim"]') && !e.target.closest('[data-k="joint"]')) closePopover();
}, true);

/* ---------- fastener joint popover ---------- */
function openJointPopover(id, cx, cy) {
  closePopover();
  const j = S.model.joints.find(x => x.id === id);
  if (!j) return;
  const isManual = j.rule === 'manual';
  let items = clone(j.items);
  const pop = document.createElement('div');
  pop.className = 'popover wide';
  const opts = (sel) => S.library.fasteners.map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const draw = () => {
    pop.innerHTML = `
      <div class="pt">${isManual ? 'Manual fastener' : esc(TYPES[S.design.type].rules[j.rule].label)}${jointWhere(j) ? ' · ' + esc(jointWhere(j)) : ''}</div>
      ${isManual ? '' : `<div class="hint">${esc(TYPES[S.design.type].rules[j.rule].help)}</div>`}
      <div class="hint">Position x ${fmtMM(j.x)}, y ${fmtMM(j.y)}, z ${fmtMM(j.z)} mm${j.ov ? '. <b>Edited, differs from the rule.</b>' : ''}</div>
      ${items.map((it, i) => `<div class="row"><input type="number" min="0" step="1" value="${it.n}" data-i="${i}" class="n" style="width:56px"><span>×</span><select data-i="${i}" class="t">${opts(it.type)}</select><button class="btn icon" data-del="${i}" title="Remove">✕</button></div>`).join('')}
      <div class="row"><button class="btn" data-act="add">+ item</button></div>
      ${isManual ? `<div class="row"><input class="note" placeholder="note (optional)" value="${esc(j.note || '')}" style="flex:1"></div>` : ''}
      <div class="row end">
        ${isManual ? '<button class="btn danger" data-act="delm">Delete</button>' :
          `${j.ov ? '<button class="btn" data-act="reset">Reset to rule</button>' : ''}<button class="btn danger" data-act="remove" title="No fastener at this point">Remove point</button>`}
        <button class="btn primary" data-act="save">Save</button>
      </div>`;
    pop.querySelectorAll('input.n').forEach(el => el.onchange = () => { items[+el.dataset.i].n = Math.max(0, parseInt(el.value) || 0); });
    pop.querySelectorAll('select.t').forEach(el => el.onchange = () => { items[+el.dataset.i].type = el.value; });
    pop.querySelectorAll('[data-del]').forEach(el => el.onclick = () => { items.splice(+el.dataset.del, 1); draw(); });
    pop.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
      const a = el.dataset.act;
      if (a === 'add') { items.push({ type: S.library.fasteners[0].id, n: 1 }); draw(); return; }
      snapshot();
      if (isManual) {
        const mf = S.design.manual.find(x => x.id === id);
        if (a === 'delm') S.design.manual = S.design.manual.filter(x => x.id !== id);
        if (a === 'save') { mf.items = items; const nt = pop.querySelector('.note'); if (nt) mf.note = nt.value; }
      } else {
        if (a === 'reset') delete S.design.overrides[id];
        if (a === 'remove') S.design.overrides[id] = { deleted: true };
        if (a === 'save') S.design.overrides[id] = { items };
      }
      closePopover(); App.refresh();
    });
  };
  draw();
  document.body.appendChild(pop);
  placePopover(pop, cx, cy);
}
