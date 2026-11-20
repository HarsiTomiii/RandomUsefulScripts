'use strict';
/* ============================================================
   WORKBENCH 2D views: front elevation, end view (left end), plan of a level
   ============================================================ */

function benchFootSvg(v, f, x) {
  // x = horizontal drawing coordinate of the foot centre
  if (f.kind === 'caster') {
    const plate = 10, r = Math.max(10, (f.h - plate) / 2);
    return `<rect x="${r1(x - 40)}" y="${r1(-f.h)}" width="80" height="${plate}" class="caster-plate"/>` +
      `<circle cx="${r1(x)}" cy="${r1(-r)}" r="${r1(r)}" class="caster-wheel"/>`;
  }
  return `<rect x="${r1(x - 18)}" y="${r1(-f.h)}" width="36" height="${r1(f.h)}" class="caster-plate"/>`;
}

function benchSelLevel() { return S.ui.sel && S.ui.sel.kind === 'level' ? S.ui.sel.id : S.ui.selLevel; }

/* ---------- FRONT ---------- */
function renderBenchFront(m) {
  const v = V.front; if (!v.svg || !v.svg.clientWidth) return;
  const { d, levels, lvGeo, F } = m;
  const { Lf, Df, rt, zF, pR, pS, dx, z0, pairs, bays } = F;
  const H = d.H, xL = -d.ohX;
  const base = Math.max(d.L, H * 1.2);
  const mL = base * 0.12, mR = base * 0.17, mT = base * 0.07, mB = base * 0.17;
  setVB(v, xL - mL, -(H + mT), d.L + mL + mR, H + mT + mB);
  const selL = benchSelLevel();
  let s = hatchDefs('hbf');
  s += rect(xL - mL, 0, d.L + mL + mR, mB * 0.12, 'floor', 'fill="url(#hbf)"') + line(xL - mL, 0, Lf + d.ohX + mR, 0, 'floorline');
  for (const sh of m.sheets.filter(x => x.role === 'panel' && x.vertical === 'xz')) s += rect(sh.x0, -sh.z1, sh.x1 - sh.x0, sh.z1 - sh.z0, 'm-panel ghost');
  // levels (behind posts)
  for (const lv of levels) {
    const g = lvGeo[lv.id]; if (!g) continue;
    const sl = lv.id === selL ? ' shelfsel' : '';
    const da = `data-k="level" data-id="${lv.id}"`;
    for (const mem of m.members.filter(x => x.levelId === lv.id && x.role === 'scross')) s += rect(mem.x0, -mem.z1, mem.x1 - mem.x0, mem.z1 - mem.z0, 'm-cross drag-y' + sl, da);
    for (const sh of m.sheets.filter(x => x.levelId === lv.id)) s += rect(sh.x0, -sh.z1, sh.x1 - sh.x0, sh.z1 - sh.z0, 'm-osb drag-y' + sl, da);
    for (const mem of m.members.filter(x => x.levelId === lv.id && x.role === 'srail' && x.y0 > Df / 2)) s += rect(mem.x0, -mem.z1, mem.x1 - mem.x0, mem.z1 - mem.z0, 'm-front drag-y' + sl, da);
    s += txt(Lf + d.ohX + mR * 0.08, -lv.z + 4 * v.k, `${g.label}  ▲ ${fmtMM(lv.z)}`, v, 'dimtxt edit lbl' + (lv.id === selL ? ' strong' : ''), `data-k="dim" data-dim="levelZ" data-id="${lv.id}"`);
  }
  // posts (front)
  for (const p of pairs) {
    const sel = isSel('pair', p.id) ? ' sel' : '';
    s += rect(p.x - dx / 2, -zF, dx, zF - z0, 'm-leg' + (p.end ? '' : ' drag-x') + sel, p.end ? '' : `data-k="pair" data-id="${p.id}"`);
  }
  for (const sh of m.sheets.filter(x => x.role === 'pad' && x.y0 > Df / 2)) s += rect(sh.x0, -sh.z1, sh.x1 - sh.x0, sh.z1 - sh.z0, 'm-osb');
  for (const sh of m.sheets.filter(x => x.role === 'panel' && x.vertical === 'yz')) s += rect(sh.x0, -sh.z1, sh.x1 - sh.x0, sh.z1 - sh.z0, 'm-panel');
  // top frame + top
  for (const mem of m.members.filter(x => x.role === 'rail' && x.side === 'F')) s += rect(mem.x0, -mem.z1, mem.x1 - mem.x0, mem.z1 - mem.z0, 'm-front');
  for (const sh of m.sheets.filter(x => x.role === 'top')) s += rect(sh.x0, -sh.z1, sh.x1 - sh.x0, sh.z1 - sh.z0, 'm-osb top');
  for (const f of m.feet.filter(f => f.y > Df / 2)) s += benchFootSvg(v, f, f.x);
  s += txt(Lf + d.ohX + mR * 0.08, -H + 4 * v.k, `Top  ▲ ${fmtMM(H)}`, v, 'dimtxt edit lbl', `data-k="dim" data-dim="H"`);
  // fasteners
  if (S.ui.showFasteners !== false) for (const j of m.joints) {
    const front = j.y >= Df - rt - F.dy - 1;
    if ((j.rule === 'railLeg' && j.dir === 'x' && front) || (j.rule === 'foot' && front) || (j.rule === 'railCorner' && j.y > 0) || j.rule === 'manual')
      s += marker(v, j, j.x, j.rule === 'foot' ? -Math.max(j.z, 15) : -j.z);
  }
  // clear-height chains in each bay
  for (const b of bays) {
    const inBay = levels.filter(lv => lvGeo[lv.id] && lvGeo[lv.id].keys.includes(b.key)).sort((a, c) => a.z - c.z);
    const xd = b.x0 + Math.min(70, (b.x1 - b.x0) * 0.2);
    if (!inBay.length) { s += dimV(v, 0, -(zF - pR.h), xd, `clear ${fmtMM(zF - pR.h)}`); continue; }
    s += dimV(v, 0, -lvGeo[inBay[0].id].zb, xd, `${fmtMM(lvGeo[inBay[0].id].zb)}`);
    inBay.forEach((lv, i) => {
      const up = inBay[i + 1];
      const ceil = up ? lvGeo[up.id].zb : zF - pR.h;
      s += dimV(v, -lv.z, -ceil, xd, `opening ${fmtMM(ceil - lv.z)}`, `data-k="dim" data-dim="opening" data-id="${lv.id}" data-up="${up ? up.id : 'top'}"`);
    });
  }
  // leg pair chain + overall length
  const xs = pairs.map(p => p.x);
  s += txt(xL - mL * 0.95, mB * 0.4 - 4 * v.k, 'Legs c/c:', v, 'dimcap', 'text-anchor="start"');
  for (let i = 0; i < xs.length - 1; i++) s += dimH(v, xs[i], xs[i + 1], mB * 0.4, fmtMM(xs[i + 1] - xs[i]), `data-k="dim" data-dim="pairSeg" data-i="${i}"`);
  s += dimH(v, xL, Lf + d.ohX, mB * 0.75, `top length ${fmtMM(d.L)}`, `data-k="dim" data-dim="L"`);
  v.svg.innerHTML = s;
}

/* ---------- SIDE (left end) ---------- */
function renderBenchSide(m) {
  const v = V.side; if (!v.svg || !v.svg.clientWidth) return;
  const { d, levels, lvGeo, F } = m;
  const { Df, rt, zF, pR, pS, dy, z0, pairs, bays } = F;
  const H = d.H;
  const base = Math.max(d.Dp * 1.6, H);
  const mL = base * 0.08, mR = base * 0.26, mT = base * 0.06, mB = base * 0.14;
  setVB(v, -d.ohY - mL, -(H + mT), d.Dp + mL + mR, H + mT + mB);
  const selL = benchSelLevel();
  const p0 = pairs[0], b0 = bays[0];
  let s = hatchDefs('hbs');
  s += rect(-d.ohY - mL, 0, d.Dp + mL + mR, mB * 0.12, 'floor', 'fill="url(#hbs)"') + line(-d.ohY - mL, 0, Df + d.ohY + mR, 0, 'floorline');
  for (const lv of levels) {
    const g = lvGeo[lv.id]; if (!g) continue;
    const inLeft = g.keys.includes(b0.key);
    const cls = (inLeft ? '' : ' ghost') + (lv.id === selL ? ' shelfsel' : '');
    const da = `data-k="level" data-id="${lv.id}"`;
    s += rect(rt, -g.zR, Df - 2 * rt, pS.h, 'm-cross drag-y' + cls, da);
    if (lv.rails) { s += rect(rt - pS.t, -g.zR, pS.t, pS.h, 'm-front' + cls); s += rect(Df - rt, -g.zR, pS.t, pS.h, 'm-front' + cls); }
    const y0 = lv.rails ? rt - pS.t : rt, y1 = lv.rails ? Df - rt + pS.t : Df - rt;
    s += rect(y0, -lv.z, y1 - y0, lv.z - g.zR, 'm-osb drag-y' + cls, da);
    s += txt(Df + d.ohY + mR * 0.06, -lv.z + 4 * v.k, `${g.label} ▲ ${fmtMM(lv.z)}${inLeft ? '' : ' (other bay)'}`, v, 'dimtxt edit lbl' + (lv.id === selL ? ' strong' : ''), `data-k="dim" data-dim="levelZ" data-id="${lv.id}"`);
  }
  for (const s_ of ['B', 'F']) {
    const y0 = s_ === 'B' ? rt : Df - rt - dy;
    s += rect(y0, -zF, dy, zF - z0, 'm-leg');
  }
  for (const sh of m.sheets.filter(x => x.role === 'panel' && x.vertical === 'yz' && x.x0 < p0.x)) s += rect(sh.y0, -sh.z1, sh.y1 - sh.y0, sh.z1 - sh.z0, 'm-panel');
  for (const sh of m.sheets.filter(x => x.role === 'panel' && x.vertical === 'xz')) s += rect(sh.y0, -sh.z1, sh.y1 - sh.y0, sh.z1 - sh.z0, 'm-panel');
  s += rect(0, -zF, rt, pR.h, 'm-front') + rect(Df - rt, -zF, rt, pR.h, 'm-front');
  s += rect(rt, -zF, Df - 2 * rt, pR.h, 'm-ledger');
  for (const sh of m.sheets.filter(x => x.role === 'top')) s += rect(sh.y0, -sh.z1, sh.y1 - sh.y0, sh.z1 - sh.z0, 'm-osb top');
  for (const f of m.feet.filter(f => Math.abs(f.x - p0.x) < 1)) s += benchFootSvg(v, f, f.y);
  if (S.ui.showFasteners !== false) for (const j of m.joints) {
    if (j.x > p0.x + F.dx / 2 + 1) continue;
    if ((j.rule === 'railLeg' && j.dir === 'y') || j.rule === 'foot' || (j.rule === 'panelScrews' && j.level === 'left'))
      s += marker(v, j, j.y, j.rule === 'foot' ? -Math.max(j.z, 15) : -j.z);
  }
  s += txt(Df + d.ohY + mR * 0.06, -H + 4 * v.k, `Top ▲ ${fmtMM(H)}`, v, 'dimtxt edit lbl', `data-k="dim" data-dim="H"`);
  s += txt(-d.ohY, -H - mT * 0.4, '◀ back', v, 'dimcap', 'text-anchor="start"');
  s += txt(Df + d.ohY, -H - mT * 0.4, 'front ▶', v, 'dimcap', 'text-anchor="end"');
  s += dimH(v, -d.ohY, Df + d.ohY, mB * 0.45, `top depth ${fmtMM(d.Dp)}`, `data-k="dim" data-dim="Dp"`);
  v.svg.innerHTML = s;
}

/* ---------- PLAN (top frame or one shelf level) ---------- */
function renderBenchPlan(m) {
  const v = V.plan; if (!v.svg || !v.svg.clientWidth) return;
  const { d, levels, lvGeo, F } = m;
  const { Lf, Df, rt, dx, dy, pairs } = F;
  let lvId = S.ui.planLevel || 'top';
  if (lvId !== 'top' && !lvGeo[lvId]) lvId = S.ui.planLevel = 'top';
  const base = Math.max(d.L, d.Dp * 2.2);
  const mL = base * 0.05, mR = base * 0.1, mT = base * 0.14, mB = base * 0.06;
  setVB(v, -d.ohX - mL, -d.ohY - mT, d.L + mL + mR, d.Dp + mT + mB);
  let s = '';
  const memRect = (mem, cls, attrs = '') => rect(mem.x0, mem.y0, mem.x1 - mem.x0, mem.y1 - mem.y0, cls, attrs);
  if (lvId === 'top') {
    s += rect(-d.ohX, -d.ohY, d.L, d.Dp, 'm-osb plan');
    for (const sh of m.sheets.filter(x => x.role === 'top' && x.layer === 0)) if (sh.x0 > -d.ohX + 1) s += line(sh.x0, -d.ohY, sh.x0, Df + d.ohY, 'ext');
    for (const mem of m.members.filter(x => ['rail', 'endrail', 'topcross', 'joist', 'strip'].includes(x.role) && !x.levelId)) s += memRect(mem, 'm-' + (mem.role === 'joist' ? 'cross' : mem.role === 'strip' ? 'ledger' : 'front') + ' under');
  } else {
    const g = lvGeo[lvId];
    for (const mem of m.members.filter(x => x.levelId === lvId)) s += memRect(mem, 'm-' + (mem.role === 'scross' || mem.role === 'joist' ? 'cross' : 'front') + ' under');
    for (const sh of m.sheets.filter(x => x.levelId === lvId)) {
      s += rect(sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0, 'm-osb plan');
      s += txt((sh.x0 + sh.x1) / 2, (sh.y0 + sh.y1) / 2, `${sh.mark || ''} ${fmtMM(sh.w)}×${fmtMM(sh.dpt)}`, v, 'osblbl', 'text-anchor="middle"');
    }
    if (!g.bays.length) s += txt(Lf / 2, Df / 2, 'This level is not in any bay', v, 'dimcap', 'text-anchor="middle"');
  }
  for (const p of pairs) for (const s_ of ['B', 'F']) {
    const y0 = s_ === 'B' ? rt : Df - rt - dy;
    s += rect(p.x - dx / 2, y0, dx, dy, 'm-leg' + (p.end ? '' : ' drag-x') + (isSel('pair', p.id) ? ' sel' : ''), p.end ? '' : `data-k="pair" data-id="${p.id}"`);
  }
  if (S.ui.showFasteners !== false) for (const j of m.joints) {
    if (j.level !== lvId && !(j.rule === 'manual' && j.level === lvId)) continue;
    s += marker(v, j, j.x, j.y);
  }
  const xs = pairs.map(p => p.x);
  for (let i = 0; i < xs.length - 1; i++) s += dimH(v, xs[i], xs[i + 1], -d.ohY - mT * 0.35, fmtMM(xs[i + 1] - xs[i]), `data-k="dim" data-dim="pairSeg" data-i="${i}"`);
  const title = lvId === 'top' ? `Top frame from above (top board shown see-through). Joists are spread automatically, max ${d.joistMax} mm apart.` : `${lvGeo[lvId].label} from above (z ${fmtMM(lvGeo[lvId].lv.z)})`;
  s += txt(-d.ohX, -d.ohY - mT * 0.75, title + ' Legs c/c:', v, 'dimcap', 'text-anchor="start"');
  s += txt(Lf / 2, Df + d.ohY + mB * 0.7, 'front', v, 'dimcap', 'text-anchor="middle"');
  v.svg.innerHTML = s;
}

function renderBenchViews(m) {
  renderBenchFront(m); renderBenchSide(m); renderBenchPlan(m);
  const pe = document.getElementById('plan-extra');
  if (pe) {
    const cur = S.ui.planLevel || 'top';
    const html = `<select id="planLevelSel"><option value="top">Top frame</option>${levelsSorted().map(l => `<option value="${l.id}" ${l.id === cur ? 'selected' : ''}>${esc(levelLabel(l.id))}</option>`).join('')}</select>`;
    if (pe.dataset.h !== html) { pe.innerHTML = html; pe.dataset.h = html; }
    const sel = document.getElementById('planLevelSel');
    sel.value = cur;
    sel.onchange = () => { S.ui.planLevel = sel.value; App.refresh(); };
  }
}

/* ---------- interaction ---------- */
function benchDragStart(k, ds) {
  const m = S.model, d = S.design, F = m.F;
  if (k === 'pair') {
    const p = d.pairs.find(x => x.id === ds.id); if (!p) return null;
    const i = F.pairs.findIndex(x => x.id === p.id);
    return { obj: p, prop: 'x', axis: 'x', orig: p.x,
      min: F.pairs[i - 1].x + F.dx + 150 + (F.pairs[i - 1].end ? 0 : F.pR.t), max: F.pairs[i + 1].x - F.dx - 150 - F.pR.t,
      sel: { kind: 'pair', id: p.id } };
  }
  if (k === 'level') {
    const lv = d.levels.find(x => x.id === ds.id); if (!lv) return null;
    return { obj: lv, prop: 'z', axis: 'z', orig: lv.z, min: F.z0 + F.shS.t + F.pS.h + 5, max: F.zF - F.pR.h - 20,
      sel: { kind: 'level', id: lv.id }, after: () => { S.ui.selLevel = lv.id; S.ui.planLevel = lv.id; } };
  }
  return null;
}

function benchManualAt(viewKey, p) {
  const m = S.model, F = m.F;
  const nearestLevel = (z) => {
    let best = 'top', bd = Math.abs(F.zF - z);
    for (const lv of m.levels) if (Math.abs(lv.z - z) < bd) { bd = Math.abs(lv.z - z); best = lv.id; }
    return best;
  };
  if (viewKey === 'front') { const z = Math.round(-p.y); return { x: Math.round(p.x), y: F.Df, z, level: nearestLevel(z) }; }
  if (viewKey === 'side') { const z = Math.round(-p.y); return { x: 0, y: Math.round(p.x), z, level: nearestLevel(z) }; }
  const lv = S.ui.planLevel || 'top';
  return { x: Math.round(p.x), y: Math.round(p.y), z: lv === 'top' ? S.design.H : m.lvGeo[lv].lv.z, level: lv };
}

function setBenchLength(Ln) {
  const d = S.design, F = benchFrame(d);
  const a = F.rt + F.dx / 2, oldSpan = F.Lf - 2 * a, newSpan = Ln - 2 * d.ohX - 2 * a;
  d.pairs.forEach(p => p.x = Math.round(a + (p.x - a) * newSpan / oldSpan));
  d.L = Ln;
}

function benchDimEdit(data) {
  const m = S.model, d = S.design, F = m.F;
  const lvl = (id) => d.levels.find(l => l.id === id);
  switch (data.dim) {
    case 'H': return { cur: d.H, title: 'Work height: top surface from the floor', apply: (v) => { d.H = v; } };
    case 'levelZ': { const lv = lvl(data.id); return { cur: lv.z, title: `${levelLabel(lv.id)}: top of shelf board from the floor`, apply: (v) => { lv.z = v; } }; }
    case 'opening': {
      const lo = lvl(data.id);
      const ceil = data.up === 'top' ? F.zF - F.pR.h : m.lvGeo[data.up].zb;
      return { cur: ceil - lo.z, title: `Clear height above ${levelLabel(lo.id)} (moves ${levelLabel(lo.id)})`, apply: (v) => { lo.z = ceil - v; } };
    }
    case 'pairSeg': {
      const i = +data.i, P = F.pairs, cur = P[i + 1].x - P[i].x;
      if (!P[i + 1].end) return { cur, title: 'Leg pair spacing (moves the right-hand pair)', apply: (v) => { P[i + 1].ref.x = P[i].x + v; } };
      if (!P[i].end) return { cur, title: 'Distance to the right end legs (moves the left-hand pair)', apply: (v) => { P[i].ref.x = P[i + 1].x - v; } };
      return { cur, title: 'End leg centres (changes the bench length)', apply: (v) => { setBenchLength(d.L + (v - cur)); } };
    }
    case 'L': return { cur: d.L, title: 'Top length (leg pairs scale along)', apply: (v) => setBenchLength(v) };
    case 'Dp': return { cur: d.Dp, title: 'Top depth (front to back)', apply: (v) => { d.Dp = v; } };
  }
  return null;
}
