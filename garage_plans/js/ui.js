'use strict';
/* ============================================================
   UI: side panel, tabs, status bar, reports
   ============================================================ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const App = {
  refresh() {
    ensureSelection();
    S.model = buildModel();
    S.cut = computeCutPlan(S.model);
    S.cost = computeCost(S.model, S.cut);
    renderProjects();
    renderPanel();
    renderViews(S.model);
    update3D(S.model);
    renderStatus();
    renderTab();
    saveState();
  },
  refreshLight() {
    S.model = buildModel();
    renderViews(S.model);
    update3D(S.model);
  },
};

function ensureSelection() {
  if (S.design.type !== 'shelf') return;
  const ids = S.design.shelves.map(s => s.id);
  if (!ids.includes(S.ui.selShelf)) S.ui.selShelf = shelvesSorted()[0] ? shelvesSorted()[0].id : null;
}

/* ---------------- projects (header) ---------------- */
function renderProjects() {
  const sel = $('#projSel');
  const html = S.projects.map(p => `<option value="${p.id}" ${p.id === S.design.id ? 'selected' : ''}>${esc(p.name)} (${TYPES[p.type].label})</option>`).join('');
  if (sel.dataset.h !== html) { sel.innerHTML = html; sel.dataset.h = html; }
  sel.value = S.design.id;
  if (document.activeElement !== $('#dname')) $('#dname').value = S.design.name;
  const t = TYPES[S.design.type];
  for (const k of ['front', 'side', 'plan']) {
    const el = $('#vt-' + k);
    if (el && el.dataset.type !== S.design.type) { el.innerHTML = t.viewTitles[k]; el.dataset.type = S.design.type; }
  }
}
function afterProjectChange() {
  V.front.vb = V.side.vb = V.plan.vb = null; _framed = false;
  closePopover();
  App.refresh();
}

/* ---------------- tabs ---------------- */
function setTab(t) {
  S.ui.tab = t;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + t));
  if (t === 'design') { mount3D($('#mini3d')); }
  if (t === '3d') { mount3D($('#full3d')); }
  requestAnimationFrame(() => { V.front.vb = V.side.vb = V.plan.vb = null; App.refresh(); resize3D(); });
}
function renderTab() {
  const t = S.ui.tab;
  if (t === 'checks') renderChecks();
  if (t === 'cut') renderCut();
  if (t === 'cost') renderCost();
  if (t === 'guide') renderGuide();
  if (t === 'library') renderLibrary();
}

/* ---------------- status bar ---------------- */
function checkSummary() {
  const m = S.model;
  const errs = m.issues.filter(i => i.level === 'error').length + m.checks.list.filter(c => c.status === 'fail').length;
  const warns = m.issues.filter(i => i.level === 'warn').length + m.checks.list.filter(c => c.status === 'warn').length;
  const maxU = Math.max(0, ...m.checks.list.filter(c => c.util != null).map(c => c.util));
  return { errs, warns, maxU };
}
function renderStatus() {
  const { errs, warns, maxU } = checkSummary();
  const st = errs ? 'bad' : warns ? 'warnc' : 'good';
  $('#status').innerHTML = `
    <span class="pill ${st}" data-goto="checks">${errs ? `✖ ${errs} problem${errs > 1 ? 's' : ''}` : warns ? `⚠ ${warns} warning${warns > 1 ? 's' : ''}` : '✔ All checks OK'} · max utilisation ${(maxU * 100).toFixed(0)} %</span>
    <span class="pill" data-goto="cost">Total ${fmtKr(S.cost.total)}</span>
    <span class="pill muted" data-goto="cut">${S.cut.timber.reduce((a, t) => a + t.bars.length, 0)} timber lengths · ${S.cut.nSheets} sheet${S.cut.nSheets === 1 ? '' : 's'}</span>
    ${S.model.mass ? `<span class="pill muted">≈ ${S.model.mass.empty.toFixed(0)} kg empty</span>` : ''}
    ${S.library.pricesEdited ? '' : '<span class="pill warnc" data-goto="library">Example prices, so enter yours in the Catalog</span>'}`;
}

/* ---------------- side panel ---------------- */
function opt(v, label, cur) { return `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`; }
function profOpts(cur) { return S.library.profiles.map(p => opt(p.id, p.name, cur)).join(''); }
function fastOpts(cur) { return S.library.fasteners.map(f => opt(f.id, f.name, cur)).join(''); }

const secOpen = (k) => (S.ui.open && S.ui.open[k] === false) ? '' : 'open';
const commonMatHtml = (d) => `
    <label>Timber grade<select data-path="grade">${opt('C18', 'C18 (normal construction timber)', d.grade)}${opt('C24', 'C24 (stronger)', d.grade)}</select></label>
    <label>Environment<select data-path="serviceClass" data-num>${opt(2, 'Unheated garage (service class 2)', d.serviceClass)}${opt(1, 'Heated, dry (service class 1)', d.serviceClass)}</select></label>
    <label>Max. sag (span ÷)<select data-path="deflLimit" data-num>${opt(150, 'L/150 (lenient)', d.deflLimit)}${opt(200, 'L/200 (normal)', d.deflLimit)}${opt(300, 'L/300 (stiff)', d.deflLimit)}</select></label>
    <label>Drag snap (mm)<input type="number" data-path="snap" value="${d.snap}" title="Hold Alt while dragging for 1 mm"></label>`;

function renderPanel() {
  const t = TYPES[S.design.type];
  let h = `<section class="card sel-card"><h3>Selection</h3>${t.selectionHtml()}</section>`;
  h += t.panelHtml();
  h += fastenerSectionHtml();
  $('#panel').innerHTML = h;
}

function fastenerSectionHtml() {
  const d = S.design, rules = TYPES[d.type].rules;
  const nOv = Object.keys(d.overrides).length;
  return `<details ${secOpen('fast')} data-sec="fast"><summary>Screws, plugs &amp; hardware</summary>
    <label class="chk"><input type="checkbox" data-act-change="showF" ${S.ui.showFasteners !== false ? 'checked' : ''}> Show on drawings</label>
    <p class="hint">Rules place fasteners automatically. Click any marker on a drawing to change that one point.</p>
    ${Object.entries(rules).filter(([, info]) => !info.when || info.when(d)).map(([k, info]) => {
      const r = d.rules[k];
      return `<div class="rule"><div class="rh"><span class="dot" style="background:${RULE_COLOR[k] || '#888'}"></span>${esc(info.label)}</div>
      <div class="hint">${esc(info.help)}</div>
      ${r.items.map((it, i) => `<div class="row"><input type="number" min="0" value="${it.n}" data-rule="${k}:${i}:n" style="width:52px">×<select data-rule="${k}:${i}:type">${fastOpts(it.type)}</select><button class="btn icon" data-act="ruledel" data-rule="${k}" data-i="${i}">✕</button></div>`).join('')}
      <div class="row"><button class="btn small" data-act="ruleadd" data-rule="${k}">+ item</button>
      ${info.spaced ? `<label class="inline">every <input type="number" data-rulep="${k}:spacing" value="${r.spacing}" style="width:58px">mm, from ends <input type="number" data-rulep="${k}:edge" value="${r.edge}" style="width:52px"></label>` : ''}
      ${r.stagger !== undefined ? `<label class="chk"><input type="checkbox" data-rulep="${k}:stagger" ${r.stagger ? 'checked' : ''}> staggered</label>` : ''}</div></div>`;
    }).join('')}
    <div class="rule"><div class="rh"><span class="dot" style="background:${RULE_COLOR.manual}"></span>Extra fasteners by hand</div>
      <div class="row"><select id="manualType">${fastOpts(S.ui.manualType)}</select>
      <button class="btn ${S.ui.tool === 'addFastener' ? 'primary' : ''}" data-act="tooladd">${S.ui.tool === 'addFastener' ? 'Placing… (click to stop)' : 'Place by clicking'}</button></div>
      <div class="hint">${d.manual.length} placed by hand. Click in a drawing to place one.</div></div>
    ${nOv ? `<div class="row"><span class="hint">${nOv} point(s) edited by hand.</span><button class="btn small" data-act="clearov">Reset all to rules</button></div>` : ''}
  </details>`;
}

function shelfPanelHtml() {
  const d = S.design, m = S.model;
  const open = secOpen;
  const drop = m.tO + m.pC.h + Math.max(m.pF.h, m.pL.h);
  const shelves = shelvesSorted();
  const selS = d.shelves.find(s => s.id === S.ui.selShelf);
  const crossList = selS ? [...crossOf(selS)].sort((a, b) => a.x - b.x) : [];
  const legs = [...d.legs].sort((a, b) => a.x - b.x);

  let h = '';
  /* rack */
  h += `<details ${open('rack')} data-sec="rack"><summary>Rack &amp; materials</summary><div class="grid2">
    <label>Width (along wall)<input type="number" data-act-change="W" value="${d.W}"></label>
    <label>Depth (wall → front beam)<input type="number" data-path="D" value="${d.D}"></label>
    <label>Wall ledger<select data-path="roles.ledger">${profOpts(d.roles.ledger)}</select></label>
    <label>Crossbeams<select data-path="roles.cross">${profOpts(d.roles.cross)}</select></label>
    <label>Front beam<select data-path="roles.front">${profOpts(d.roles.front)}</select></label>
    <label>Legs<select data-path="roles.leg">${profOpts(d.roles.leg)}</select></label>
    <label>Shelf sheet<select data-path="sheetId">${S.library.sheets.map(s => opt(s.id, s.name, d.sheetId)).join('')}</select></label>
    <label>Leg orientation<select data-path="legOrient">${opt('wideX', 'Wide face to the front', d.legOrient)}${opt('wideY', 'Narrow face to the front', d.legOrient)}</select></label>
    <label>Leg top vs. top shelf<input type="number" data-path="legTopExtra" value="${d.legTopExtra}" title="0 = flush with top shelf surface. Positive = legs stick up above it"></label>
    ${commonMatHtml(d)}
  </div><p class="hint">The front beam is screwed to the back of the legs, so the legs stand just in front of the shelf and the OSB needs no notches. Crossbeams sit <i>on top of</i> the wall ledger and the front beam.</p></details>`;

  /* shelves */
  h += `<details ${open('shelves')} data-sec="shelves"><summary>Shelves (${shelves.length})</summary>
    <table class="tbl"><tr><th></th><th>Top of shelf<br><small>from floor</small></th><th>Load kg</th><th>Opening<br><small>below</small></th><th></th></tr>
    ${shelves.map((s, i) => {
      const lo = shelves[i + 1];
      const opening = lo ? s.z - drop - lo.z : s.z - drop;
      return `<tr class="${s.id === S.ui.selShelf ? 'selrow' : ''}"><td><a href="#" data-act="selshelf" data-id="${s.id}">${shelfLabel(s.id)}</a></td>
      <td><input type="number" data-set="shelf:${s.id}:z" value="${s.z}"></td>
      <td><input type="number" data-set="shelf:${s.id}:load" value="${s.load}"></td>
      <td class="${opening < 150 ? 'neg' : ''}">${fmtMM(opening)}</td>
      <td><button class="btn icon" data-act="delshelf" data-id="${s.id}" title="Delete shelf">✕</button></td></tr>`;
    }).join('')}</table>
    <div class="btnrow">
      <button class="btn" data-act="addshelf" data-where="below">+ below bottom</button>
      <button class="btn" data-act="addshelf" data-where="under">+ under selected</button>
      <button class="btn" data-act="addshelf" data-where="above">+ above top</button>
      <button class="btn" data-act="evenshelves" title="Keep top and bottom shelf, make all openings equal">Equal openings</button>
    </div>
    <p class="hint">Load = what you'll store on that shelf, spread out (kg). "Opening" is the clear height under the shelf above's beams, i.e. the tallest box that slides in.</p></details>`;

  /* crossbeams */
  h += `<details ${open('cross')} data-sec="cross"><summary>Crossbeams${d.linkCross ? '' : ' · ' + (selS ? shelfLabel(selS.id) : '')} (${crossList.length})</summary>
    <label class="chk"><input type="checkbox" data-act-change="link" ${d.linkCross ? 'checked' : ''}> Same layout on all shelves</label>
    ${d.linkCross ? '' : `<p class="hint">Editing ${selS ? shelfLabel(selS.id) : ''}. Pick another shelf in the drawing or the shelf list.</p>`}
    <div class="btnrow"><label class="inline">Count <input type="number" id="crossN" class="cnt" min="2" value="${crossList.length}" style="width:60px"></label>
      <button class="btn" data-act="crossdist">Spread evenly</button><button class="btn" data-act="crossadd">+ in largest gap</button>
      ${d.linkCross ? '' : '<button class="btn" data-act="crosscopy">Copy to all shelves</button>'}</div>
    <table class="tbl"><tr><th>#</th><th>Centre x</th><th>Gap to prev. (c/c)</th><th></th></tr>
    ${crossList.map((c, i) => `<tr class="${isSel('cross', c.id) ? 'selrow' : ''}"><td>${i + 1}</td><td><input type="number" data-set="cross:${selS.id}:${c.id}:x" value="${c.x}"></td><td>${i ? fmtMM(c.x - crossList[i - 1].x) : '–'}</td><td><button class="btn icon" data-act="crossdel" data-id="${c.id}">✕</button></td></tr>`).join('')}</table></details>`;

  /* legs */
  h += `<details ${open('legs')} data-sec="legs"><summary>Legs (${legs.length})</summary>
    <div class="btnrow"><label class="inline">Count <input type="number" id="legN" class="cnt" min="2" value="${legs.length}" style="width:60px"></label>
      <button class="btn" data-act="legdist">Spread evenly</button><button class="btn" data-act="legadd">+ in largest gap</button></div>
    <table class="tbl"><tr><th>#</th><th>Centre x</th><th>Gap (c/c)</th><th></th></tr>
    ${legs.map((l, i) => `<tr class="${isSel('leg', l.id) ? 'selrow' : ''}"><td>${i + 1}</td><td><input type="number" data-set="leg:${l.id}:x" value="${l.x}"></td><td>${i ? fmtMM(l.x - legs[i - 1].x) : '–'}</td><td><button class="btn icon" data-act="legdel" data-id="${l.id}">✕</button></td></tr>`).join('')}</table>
    <p class="hint">If the front beam must be joined (wider than your longest board), the joint is always placed on a leg.</p></details>`;
  return h;
}

function jointSelHtml(sel) {
  const j = S.model && S.model.joints.find(x => x.id === sel.id); if (!j) return '';
  return `<div class="selhead">Fastener point</div><p class="hint">${esc(jointTitle(j))}</p><button class="btn" data-act="editjoint">Edit…</button>`;
}

function shelfSelectionHtml() {
  const sel = S.ui.sel, d = S.design;
  if (!sel) return `<p class="hint">Click a part in a drawing to select it, and drag legs, crossbeams or shelves to move them. <b class="link">Blue numbers</b> are dimensions you can click and type into. Ctrl+Z undoes.</p>`;
  if (sel.kind === 'shelf') {
    const s = d.shelves.find(x => x.id === sel.id); if (!s) return '';
    return `<div class="selhead">Shelf ${shelfLabel(s.id)}</div><div class="grid2">
      <label>Top of shelf (mm)<input type="number" data-set="shelf:${s.id}:z" value="${s.z}"></label>
      <label>Load (kg)<input type="number" data-set="shelf:${s.id}:load" value="${s.load}"></label></div>
      <div class="btnrow"><button class="btn" data-act="addshelf" data-where="under">+ shelf under</button><button class="btn danger" data-act="delshelf" data-id="${s.id}">Delete shelf</button></div>`;
  }
  if (sel.kind === 'cross') {
    const s = d.shelves.find(x => x.id === sel.shelfId) || d.shelves[0];
    const c = crossOf(s).find(x => x.id === sel.id); if (!c) return '';
    return `<div class="selhead">Crossbeam${d.linkCross ? ' (all shelves)' : ' · ' + shelfLabel(s.id)}</div><div class="grid2">
      <label>Centre x (mm)<input type="number" data-set="cross:${s.id}:${c.id}:x" value="${c.x}"></label></div>
      <div class="btnrow"><button class="btn danger" data-act="crossdel" data-id="${c.id}">Delete</button></div><p class="hint">Arrow keys nudge (Shift = 50 mm).</p>`;
  }
  if (sel.kind === 'leg') {
    const l = d.legs.find(x => x.id === sel.id); if (!l) return '';
    return `<div class="selhead">Leg</div><div class="grid2"><label>Centre x (mm)<input type="number" data-set="leg:${l.id}:x" value="${l.x}"></label></div>
      <div class="btnrow"><button class="btn danger" data-act="legdel" data-id="${l.id}">Delete</button></div><p class="hint">Arrow keys nudge (Shift = 50 mm).</p>`;
  }
  if (sel.kind === 'joint') return jointSelHtml(sel);
  return '';
}

/* ---------------- panel events ---------------- */
function bindPanel() {
  const panel = $('#panel');
  panel.addEventListener('toggle', (e) => {
    const sec = e.target.dataset && e.target.dataset.sec;
    if (sec) { S.ui.open = S.ui.open || {}; S.ui.open[sec] = e.target.open; }
  }, true);
  panel.addEventListener('change', onPanelChange);
  panel.addEventListener('click', onPanelClick);
}

function num(el) { const v = parseFloat(el.value); return isFinite(v) ? v : 0; }

function onPanelChange(e) {
  const el = e.target, d = S.design;
  if (el.id === 'manualType') { S.ui.manualType = el.value; return; }
  if (el.classList.contains('cnt')) return;
  if (el.dataset.path) {
    snapshot();
    const isNum = el.type === 'number' || el.dataset.num !== undefined;
    setPath(d, el.dataset.path, el.type === 'checkbox' ? el.checked : isNum ? num(el) : el.value);
    return App.refresh();
  }
  if (el.dataset.rule) {
    snapshot();
    const [k, i, f] = el.dataset.rule.split(':');
    d.rules[k].items[+i][f] = f === 'n' ? Math.max(0, parseInt(el.value) || 0) : el.value;
    return App.refresh();
  }
  if (el.dataset.rulep) {
    snapshot();
    const [k, f] = el.dataset.rulep.split(':');
    d.rules[k][f] = el.type === 'checkbox' ? el.checked : Math.max(1, num(el));
    return App.refresh();
  }
  if (el.dataset.actChange === 'showF') { S.ui.showFasteners = el.checked; return App.refresh(); }
  if (TYPES[d.type].panelChange(el) !== false) App.refresh();
}

function shelfPanelChange(el) {
  const d = S.design;
  if (el.dataset.set) {
    snapshot();
    const p = el.dataset.set.split(':');
    if (p[0] === 'shelf') d.shelves.find(s => s.id === p[1])[p[2]] = num(el);
    if (p[0] === 'cross') { const s = d.shelves.find(s => s.id === p[1]); crossOf(s).find(c => c.id === p[2]).x = num(el); }
    if (p[0] === 'leg') d.legs.find(l => l.id === p[1]).x = num(el);
    return true;
  }
  const a = el.dataset.actChange;
  if (a === 'W') { snapshot(); setWidth(Math.max(300, num(el))); return true; }
  if (a === 'link') {
    snapshot();
    if (el.checked) {
      const s = d.shelves.find(s => s.id === S.ui.selShelf) || d.shelves[0];
      d.cross = clone(s.cross.length ? s.cross : d.cross);
    } else d.shelves.forEach(s => { s.cross = d.cross.map(c => ({ id: uid('c'), x: c.x })); });
    d.linkCross = el.checked;
    S.ui.sel = null;
    return true;
  }
  return false;
}

function largestGapInsert(arr, W) {
  const pts = [0, ...arr.map(o => o.x).sort((a, b) => a - b), W];
  let bi = 0, bg = 0;
  for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > bg) { bg = pts[i + 1] - pts[i]; bi = i; }
  return Math.round((pts[bi] + pts[bi + 1]) / 2);
}

function onPanelClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.type !== 'checkbox') e.preventDefault();
  const a = b.dataset.act, d = S.design;
  switch (a) {
    case 'ruleadd': snapshot(); d.rules[b.dataset.rule].items.push({ type: S.library.fasteners[0].id, n: 1 }); break;
    case 'ruledel': snapshot(); d.rules[b.dataset.rule].items.splice(+b.dataset.i, 1); break;
    case 'tooladd':
      S.ui.tool = S.ui.tool === 'addFastener' ? null : 'addFastener';
      S.ui.manualType = $('#manualType').value; break;
    case 'clearov': snapshot(); d.overrides = {}; break;
    case 'editjoint': {
      const r = b.getBoundingClientRect();
      openJointPopover(S.ui.sel.id, r.right, r.top); return;
    }
    default:
      if (TYPES[d.type].panelAction(a, b) === false) return;
  }
  App.refresh();
}

function shelfPanelAction(a, b) {
  const d = S.design, m = S.model;
  const selS = d.shelves.find(s => s.id === S.ui.selShelf);
  const drop = m.tO + m.pC.h + Math.max(m.pF.h, m.pL.h);
  switch (a) {
    case 'selshelf': S.ui.selShelf = b.dataset.id; S.ui.sel = { kind: 'shelf', id: b.dataset.id }; break;
    case 'delshelf':
      if (d.shelves.length <= 1) return alert('Keep at least one shelf.');
      snapshot(); d.shelves = d.shelves.filter(s => s.id !== b.dataset.id); S.ui.sel = null; break;
    case 'addshelf': {
      snapshot();
      const sh = shelvesSorted();
      const where = b.dataset.where;
      let z;
      if (where === 'above') z = sh[0].z + drop + 400;
      else if (where === 'below') z = Math.max(drop + 100, Math.round(sh[sh.length - 1].z / 2));
      else {
        const i = sh.findIndex(s => s.id === S.ui.selShelf);
        const lower = sh[i + 1];
        z = lower ? Math.round((sh[i].z + lower.z) / 2) : Math.max(drop + 100, Math.round(sh[i].z / 2));
      }
      const ns = { id: uid('s'), z: Math.round(z), load: sh[0].load, cross: selS ? clone(selS.cross).map(c => ({ ...c, id: uid('c') })) : [] };
      if (!d.linkCross && !ns.cross.length) ns.cross = evenly(5, d.W, m.pC.t).map(x => ({ id: uid('c'), x }));
      d.shelves.push(ns); S.ui.selShelf = ns.id; S.ui.sel = { kind: 'shelf', id: ns.id };
      break;
    }
    case 'evenshelves': {
      const sh = shelvesSorted();
      if (sh.length < 3) return alert('Needs at least 3 shelves (top and bottom stay where they are).');
      snapshot();
      const top = sh[0].z, bot = sh[sh.length - 1].z, n = sh.length - 1;
      const open = (top - bot - n * drop) / n;
      sh.forEach((s, i) => { if (i > 0 && i < n) s.z = Math.round(top - i * (open + drop)); });
      break;
    }
    case 'crossdist': {
      const n = Math.max(2, parseInt($('#crossN').value) || 2);
      snapshot();
      const xs = evenly(n, d.W, m.pC.t).map(x => ({ id: uid('c'), x }));
      if (d.linkCross) d.cross = xs; else selS.cross = xs;
      S.ui.sel = null; break;
    }
    case 'crossadd': {
      snapshot();
      const arr = d.linkCross ? d.cross : selS.cross;
      arr.push({ id: uid('c'), x: largestGapInsert(arr, d.W) }); break;
    }
    case 'crosscopy': snapshot(); d.shelves.forEach(s => { if (s !== selS) s.cross = selS.cross.map(c => ({ id: uid('c'), x: c.x })); }); break;
    case 'crossdel': {
      snapshot();
      if (d.linkCross) d.cross = d.cross.filter(c => c.id !== b.dataset.id);
      else d.shelves.forEach(s => s.cross = s.cross.filter(c => c.id !== b.dataset.id));
      S.ui.sel = null; break;
    }
    case 'legdist': {
      const n = Math.max(2, parseInt($('#legN').value) || 2);
      snapshot(); d.legs = evenly(n, d.W, m.legDx).map(x => ({ id: uid('l'), x })); S.ui.sel = null; break;
    }
    case 'legadd': snapshot(); d.legs.push({ id: uid('l'), x: largestGapInsert(d.legs, d.W) }); break;
    case 'legdel': snapshot(); d.legs = d.legs.filter(l => l.id !== b.dataset.id); S.ui.sel = null; break;
    default: return false;
  }
  return true;
}

/* keyboard */
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return App.refresh(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return App.refresh(); }
    if (e.key === 'Escape') { S.ui.tool = null; S.ui.sel = null; closePopover(); return App.refresh(); }
    const sel = S.ui.sel; if (!sel) return;
    const d = S.design;
    const kt = TYPES[d.type].keyTarget(sel);
    if (!kt || !kt.obj) return;
    const step = e.shiftKey ? 50 : (d.snap || 5);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      snapshot(); kt.del();
      S.ui.sel = null; e.preventDefault(); return App.refresh();
    }
    const dirs = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 };
    if (!(e.key in dirs)) return;
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (vertical !== (kt.axis === 'z')) return;
    e.preventDefault();
    snapshot();
    kt.obj[kt.axis === 'z' ? 'z' : 'x'] += dirs[e.key] * step;
    App.refresh();
  });
}

function shelfKeyTarget(sel) {
  const d = S.design;
  if (sel.kind === 'cross') {
    const s = d.shelves.find(x => x.id === sel.shelfId) || d.shelves[0]; const obj = crossOf(s).find(c => c.id === sel.id);
    return { obj, axis: 'x', del: () => { if (d.linkCross) d.cross = d.cross.filter(c => c !== obj); else d.shelves.forEach(s => s.cross = s.cross.filter(c => c !== obj)); } };
  }
  if (sel.kind === 'leg') { const obj = d.legs.find(l => l.id === sel.id); return { obj, axis: 'x', del: () => { d.legs = d.legs.filter(l => l !== obj); } }; }
  if (sel.kind === 'shelf') { const obj = d.shelves.find(s => s.id === sel.id); return { obj, axis: 'z', del: () => { if (d.shelves.length > 1) d.shelves = d.shelves.filter(s => s !== obj); } }; }
  return null;
}

/* ---------------- checks page ---------------- */
function renderChecks() {
  const m = S.model, c = m.checks, b = c.basis;
  const lvl = { error: '✖', warn: '⚠', info: 'ℹ' };
  const rows = c.list.map(ch => {
    const u = ch.util == null ? null : ch.util;
    const w = u == null ? 0 : Math.min(u, 1.5) / 1.5 * 100;
    return `<tr class="st-${ch.status}"><td>${esc(ch.name)}</td>
      <td class="ub">${u == null ? `<span class="muted">${ch.infoOnly ? 'information' : 'not checked'}</span>` : `<div class="bar"><div style="width:${w}%"></div><span class="mark100"></span></div><b>${(u * 100).toFixed(0)} %</b>`}</td>
      <td>${esc(ch.detail || '')}${ch.status === 'fail' && ch.fix ? `<div class="fix">→ ${esc(ch.fix)}</div>` : ''}</td></tr>`;
  }).join('');
  $('#page-checks').innerHTML = `<div class="doc">
    <h2>Engineering checks</h2>
    ${m.issues.length ? `<ul class="issues">${m.issues.map(i => `<li class="lv-${i.level}">${lvl[i.level]} ${esc(i.msg)}</li>`).join('')}</ul>` : '<p class="good">✔ No layout problems found.</p>'}
    <table class="tbl checks"><tr><th>Check</th><th>Utilisation</th><th>Details</th></tr>${rows}</table>
    <p class="hint">Utilisation under 100 % passes. Above 85 % is shown amber: it works, but there is little margin.</p>
    <h3>How this is calculated</h3>
    <ul class="hint basis">${TYPES[S.design.type].basisHtml(b)}</ul>
    <p class="hint"><b>This is a planning aid, not a certified structural calculation.</b></p></div>`;
}

function shelfBasisHtml(b) {
  return `
      <li>Simplified Eurocode 5 method. Loads are long-term (storage). Ultimate load = 1.35 × self-weight + 1.5 × stored load. Timber ${b.grade}: design bending strength ${b.fmd.toFixed(1)} MPa, compression ${b.fc0d.toFixed(1)} MPa.</li>
      <li>Sag (deflection) includes long-term creep (k<sub>def</sub> ${b.tf.kdef} for timber, ${b.SP.kdef} for ${esc(S.model.sh.name)}). Particle boards like OSB creep a lot under constant load, which is why OSB spans usually govern.</li>
      <li>Each span is treated as simply supported (conservative). Interior legs get +25 % because the front beam runs continuously over them.</li>
      <li>Shelf load is spread evenly over the whole shelf. A heavy concentrated item (e.g. an engine block) needs more margin, so put heavy things near legs and the wall.</li>
      <li>Wall plugs: the load per fixing (working load, no safety factors, +prying from the ledger's offset) is compared with the <b>recommended load</b> you enter in the Catalog. Take it from the plug maker's table for your brick type. Solid and hollow (perforated) brick differ a lot.</li>
      <li>Screws: front beam → leg shear uses the design capacity per screw entered in the Catalog.</li>
      <li>Sideways stability comes from the OSB screwed to the crossbeams, tied to the wall ledgers. No diagonal braces are needed while the rack is fixed to the wall.</li>`;
}

/* ---------------- cut plan page ---------------- */
function whereText(items) {
  const w = [...new Set(items.map(m => m.where).filter(Boolean))].sort();
  return w.join(', ');
}
function renderCut() {
  const m = S.model, cut = S.cut, d = S.design;
  const { kerf, trim, minOffcut } = d.cut;
  let h = `<div class="doc"><div class="headrow"><h2>Cut plan</h2><button class="btn" onclick="window.print()">🖨 Print</button></div>
    <div class="row settings">
      <label class="inline">Saw kerf <input type="number" data-cut="kerf" value="${kerf}" style="width:56px"> mm</label>
      <label class="inline">End trim per board <input type="number" data-cut="trim" value="${trim}" style="width:56px"> mm</label>
      <label class="inline">Keep offcuts ≥ <input type="number" data-cut="minOffcut" value="${minOffcut}" style="width:64px"> mm</label>
    </div>
    <h3>Cut list</h3>
    <table class="tbl"><tr><th>Mark</th><th>Part</th><th>Profile</th><th>Length</th><th>Qty</th><th>Used in</th></tr>
    ${m.parts.map(p => `<tr><td><b>${p.mark}</b></td><td>${ROLE_NAME[p.role]}</td><td>${esc(p.prof.name)}</td><td>${fmtMM(p.len)}</td><td>${p.members.length}</td><td>${whereText(p.members)}</td></tr>`).join('')}
    ${m.sheetParts.map(p => `<tr><td><b>${p.mark}</b></td><td>${SHEET_ROLE_NAME[p.role] || 'Board'}</td><td>${esc(sheetDef(p.sheetId).name)}</td><td>${fmtMM(p.w)} × ${fmtMM(p.dpt)}</td><td>${p.items.length}</td><td>${whereText(p.items)}</td></tr>`).join('')}
    </table>`;

  for (const t of cut.timber) {
    if (t.error) { h += `<p class="neg">${esc(t.error)}</p>`; continue; }
    const maxLen = Math.max(...t.bars.map(b => b.len));
    const totLen = t.bars.reduce((a, b) => a + b.len, 0), usedLen = t.pieces.reduce((a, p) => a + p.len, 0);
    h += `<h3>${esc(t.prof.name)}: ${t.bars.length} length${t.bars.length > 1 ? 's' : ''}, ${fmtKr(t.cost)} <span class="muted">(waste ${(100 - usedLen / totLen * 100).toFixed(0)} %)</span></h3><div class="bars">`;
    t.bars.forEach((b, bi) => {
      const pc = (v) => (v / b.len * 100).toFixed(3) + '%';
      let x = b.exact ? 0 : trim;
      let segs = b.exact ? '' : `<div class="seg trim" style="width:${pc(trim)}" title="end trim ${trim} mm"></div>`;
      b.pieces.forEach((p, i) => {
        if (i) { segs += `<div class="seg kerf" style="width:${pc(kerf)}"></div>`; x += kerf; }
        segs += `<div class="seg pc r-${p.role}" style="width:${pc(p.len)}" title="${p.mark} ${ROLE_NAME[p.role]} ${p.len} mm"><span>${p.mark} · ${p.len}</span></div>`;
        x += p.len;
      });
      const off = b.len - x - (b.pieces.length ? kerf : 0);
      if (off > 1) segs += `<div class="seg kerf" style="width:${pc(kerf)}"></div><div class="seg off ${off >= minOffcut ? 'keep' : ''}" style="width:${pc(off)}" title="offcut ${Math.round(off)} mm"><span>${off >= minOffcut ? 'offcut ' + Math.round(off) : Math.round(off)}</span></div>`;
      h += `<div class="barrow"><div class="bl">#${bi + 1} · ${fmtMM(b.len)} mm<br><small class="muted">${fmtKr(+b.price || 0)}</small></div>
        <div class="barwrap"><div class="barline" style="width:${(b.len / maxLen * 100).toFixed(2)}%">${segs}</div></div></div>`;
    });
    h += `</div>`;
  }
  // sheets
  h += `<p class="hint">Sheets: rip the long strips first (along the sheet's length), then cross-cut. Pieces keep the sheet's long direction along the length of the rack/bench, which is the strong direction for OSB.</p>`;
  for (const sp of cut.sheets) {
    const sh = sp.def;
    h += `<h3>${esc(sh.name)}: ${sp.sheets.length} sheet${sp.sheets.length === 1 ? '' : 's'} (${fmtMM(sh.len)} × ${fmtMM(sh.wid)}), ${fmtKr(sp.cost)}</h3>`;
    sp.errors.forEach(e => h += `<p class="neg">${esc(e)}</p>`);
    h += `<div class="sheets">`;
    sp.sheets.forEach((s, si) => {
      let g = `<rect x="0" y="0" width="${sh.len}" height="${sh.wid}" class="sheetbg"/>`;
      s.strips.forEach(st => st.items.forEach(p => {
        g += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.dpt}" class="pc r-osb"/>`;
        const fs = Math.min(70, p.dpt * 0.4, p.w / 6);
        g += `<text x="${p.x + p.w / 2}" y="${p.y + p.dpt / 2}" class="sht" style="font-size:${fs}px">${p.mark} ${p.w}×${p.dpt}</text>`;
      }));
      h += `<div class="sheetbox"><div class="bl">Sheet ${si + 1}</div><svg viewBox="-10 -10 ${sh.len + 20} ${sh.wid + 20}" class="sheetsvg">${g}</svg></div>`;
    });
    h += `</div>`;
  }
  h += `</div>`;
  $('#page-cut').innerHTML = h;
  $$('#page-cut [data-cut]').forEach(el => el.onchange = () => { snapshot(); S.design.cut[el.dataset.cut] = Math.max(0, num(el)); App.refresh(); });
}

/* ---------------- cost page ---------------- */
function renderCost() {
  const c = S.cost;
  const groups = ['Timber', 'Sheets', 'Fasteners', 'Hardware', 'Other'];
  let h = `<div class="doc"><div class="headrow"><h2>Material cost</h2><button class="btn" onclick="window.print()">🖨 Print</button></div>
    ${S.library.pricesEdited ? '' : '<p class="banner">The prices are <b>examples</b>. Enter your real prices in the Catalog tab.</p>'}
    <table class="tbl cost"><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr>`;
  for (const g of groups) {
    const ls = c.lines.filter(l => l.group === g);
    if (!ls.length && g !== 'Other') continue;
    const sub = ls.reduce((a, l) => a + l.total, 0);
    h += `<tr class="grp"><td colspan="3">${g}</td><td class="r">${fmtKr(sub)}</td></tr>`;
    h += ls.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${fmtKr(l.unit, 2)}</td><td class="r">${fmtKr(l.total, 2)}</td></tr>`).join('');
  }
  h += `<tr class="tot"><td colspan="3">Total to buy</td><td class="r">${fmtKr(c.total, 2)}</td></tr></table>
    <p class="hint">Fasteners are bought in whole boxes. The value of the screws actually used is ${fmtKr(c.usedFastValue, 2)} of the ${fmtKr(c.fastBuy, 2)} in boxes. Timber is priced per whole stock length, so offcuts are included.</p>
    <h3>Fastener count</h3><table class="tbl"><tr><th>Type</th><th class="r">Needed</th><th class="r">Per box</th><th class="r">Boxes</th></tr>
    ${c.fast.map(f => `<tr><td>${esc(f.f.name)}</td><td class="r">${f.n}</td><td class="r">${f.f.perBox}</td><td class="r">${f.boxes}</td></tr>`).join('')}</table>
    <h3>Other items</h3><p class="hint">Anything else to buy: joist hangers, leg pads, drill bits, glue…</p>
    <table class="tbl"><tr><th>Name</th><th>Qty</th><th>Unit price (kr)</th><th></th></tr>
    ${S.design.extras.map(e => `<tr><td><input data-ex="${e.id}:name" value="${esc(e.name)}"></td><td><input type="number" data-ex="${e.id}:qty" value="${e.qty}" style="width:70px"></td><td><input type="number" data-ex="${e.id}:price" value="${e.price}" style="width:90px"></td><td><button class="btn icon" data-exdel="${e.id}">✕</button></td></tr>`).join('')}
    </table><button class="btn" id="exadd">+ item</button></div>`;
  $('#page-cost').innerHTML = h;
  $$('#page-cost [data-ex]').forEach(el => el.onchange = () => {
    snapshot(); const [id, f] = el.dataset.ex.split(':');
    const e = S.design.extras.find(x => x.id === id); e[f] = f === 'name' ? el.value : num(el); App.refresh();
  });
  $$('#page-cost [data-exdel]').forEach(el => el.onclick = () => { snapshot(); S.design.extras = S.design.extras.filter(x => x.id !== el.dataset.exdel); App.refresh(); });
  $('#exadd').onclick = () => { snapshot(); S.design.extras.push({ id: uid('x'), name: '', qty: 1, price: 0 }); App.refresh(); };
}

/* ---------------- build guide ---------------- */
function renderGuide() { $('#page-guide').innerHTML = TYPES[S.design.type].guideHtml(); }
function shelfGuideHtml() {
  const m = S.model, d = S.design;
  const { pL, pC, pF, pP, sh, tO, W, D, legs, shelves, shelfGeo, legDx } = m;
  const plugs = d.rules.ledgerWall.items.map(it => fastener(it.type)).filter(f => f && f.kind === 'plug');
  const fn = (rule) => d.rules[rule].items.filter(i => i.n).map(i => `${i.n}× ${(fastener(i.type) || { name: '?' }).name}`).join(' + ') || 'none';
  let h = `<div class="doc guide"><div class="headrow"><h2>Build guide</h2><button class="btn" onclick="window.print()">🖨 Print</button></div>
  <p class="hint">All heights are from the floor; all x positions from the <b>left end</b> of the rack. If the floor isn't level, draw one level reference line on the wall and measure from that instead.</p>
  <h3>Tools</h3><p>Circular or mitre saw, drill/driver, hammer drill with a masonry bit sized for your plugs${plugs[0] ? ' (' + esc(plugs[0].name) + ')' : ''}, long spirit level, tape measure, square, pencil, clamps.</p>
  <ol>
  <li><b>Buy and cut.</b> Cut all parts from the Cut plan tab and write the mark (${m.parts.map(p => p.mark).join(', ')}, ${m.sheetParts.map(p => p.mark).join(', ')}) on each piece. Cut square: every joint here is a plain butt joint.</li>
  <li><b>Mark the wall.</b> For each shelf draw a level line at the <i>top of the ledger</i>:
    <table class="tbl"><tr><th>Shelf</th><th>Top of shelf</th><th>Ledger top / front beam top</th><th>Ledger bottom</th></tr>
    ${shelves.map(s => { const g = shelfGeo[s.id]; return `<tr><td>${shelfLabel(s.id)}</td><td>${fmtMM(s.z)}</td><td><b>${fmtMM(g.zBeamTop)}</b></td><td>${fmtMM(g.zBeamTop - pL.h)}</td></tr>`; }).join('')}</table>
    Mark the rack's left end on the wall (plumb line). This is x = 0.</li>
  <li><b>Fix the ledgers</b> (${esc(pL.name)}, on edge, ${pL.h} mm tall) with their top on the line, starting with the top one. Fixings: ${fn('ledgerWall')} per point at x =
    <ul>${shelves.map(s => { const g = shelfGeo[s.id]; return `<li>${shelfLabel(s.id)}: ${g.fixings.map(f => fmtMM(f.x)).join(', ')}${g.ledgerPieces.length > 1 ? ` <i>(ledger in ${g.ledgerPieces.length} pieces, joints at ${g.ledgerPieces.slice(1).map(p => fmtMM(p[0])).join(', ')})</i>` : ''}</li>`; }).join('')}</ul>
    ${d.rules.ledgerWall.stagger ? `Alternate the fixings upper/lower (about ${Math.round(pL.h * 0.28)} mm from the top and bottom edge). ` : ''}
    Drill the ledger first, hold it on the line and mark through the holes. Then drill the wall: <b>into the brick, not the mortar joints</b> (shift a fixing 20–30 mm if it lands on a joint). Drill the hole about 10 mm deeper than the plug, blow out the dust, tap the plug in, then screw.</li>
  <li><b>Build the front frame on the floor.</b> Lay the front beams flat on the floor, parallel, with the gaps below. Then lay the legs across them and screw <i>down through each leg into the beam</i> (${fn('frontLeg')} per crossing). On the legs, the <b>top of each front beam</b> is at
    <ul>${shelves.map(s => `<li>${shelfLabel(s.id)}: ${fmtMM(shelfGeo[s.id].zBeamTop)} mm from the leg's bottom end</li>`).join('')}</ul>
    Legs at x = ${legs.map(l => fmtMM(l.x)).join(', ')} (centre). Front beams run 0 → ${fmtMM(W)}${shelfGeo[shelves[0].id].frontPieces.length > 1 ? `, joined on legs at x = ${shelfGeo[shelves[0].id].frontPieces.slice(1).map(p => fmtMM(p[0])).join(', ')}` : ''}. Check the frame is square: both diagonals should be equal. Pre-drill 3 mm near the ends of pieces to stop splitting.</li>
  <li><b>Stand the frame up</b> with the front beams facing the wall, ${fmtMM(D)} mm from the wall (wall → front face of front beam). Prop it or have a helper hold it.</li>
  <li><b>Fit the crossbeams</b> (${esc(pC.name)}, on edge, ${fmtMM(D)} mm long), top shelf first. Each one rests on the ledger and on the front beam, back end against the wall, front end flush with the front beam. Positions (centre x):
    <ul>${d.linkCross ? `<li>all shelves: ${shelfGeo[shelves[0].id].cross.map(c => fmtMM(c.x)).join(', ')}</li>` : shelves.map(s => `<li>${shelfLabel(s.id)}: ${shelfGeo[s.id].cross.map(c => fmtMM(c.x)).join(', ')}</li>`).join('')}</ul>
    Toe-screw each end: ${fn('crossLedger')} into the ledger and ${fn('crossFront')} into the front beam. Before screwing the first ones, check the legs are plumb (level on two faces).</li>
  <li><b>Lay the shelf boards</b> (${esc(sh.name)}). Keep the sheet's long side along the wall, the way it came off the sheet. Sheet joints always land on a crossbeam, with each board getting its own row of screws there. Screw down: ${fn('osbCross')} every ${d.rules.osbCross.spacing} mm along every crossbeam.</li>
  <li><b>Finish.</b> Put a plastic or rubber pad under each leg so the wood doesn't soak up water from the concrete. Shim any leg that doesn't touch the floor.</li>
  ${d.manual.length ? `<li><b>Extra fasteners by hand:</b><ul>${d.manual.map(mf => `<li>${mf.shelfId ? shelfLabel(mf.shelfId) + ': ' : ''}x ${fmtMM(mf.x)}, y ${fmtMM(mf.y)}, z ${fmtMM(mf.z)}: ${mf.items.map(i => `${i.n}× ${(fastener(i.type) || { name: '?' }).name}`).join(', ')}${mf.note ? ' (' + esc(mf.note) + ')' : ''}</li>`).join('')}</ul></li>` : ''}
  </ol>
  <h3>Using it</h3>
  <ul><li>Design loads: ${shelves.map(s => `${shelfLabel(s.id)} ${s.load} kg`).join(', ')}, spread out. Heaviest items low and near the legs and wall.</li>
  <li>Don't climb on the rack.</li></ul></div>`;
  return h;
}

/* ---------------- library page ---------------- */
function renderLibrary() {
  const L = S.library;
  const usedProf = new Set(S.projects.flatMap(p => Object.values(p.roles)));
  const usedSheet = new Set(S.projects.flatMap(p => [p.sheetId, p.shelfSheetId, p.panelSheetId, ...(p.topLayers || [])].filter(Boolean)));
  let h = `<div class="doc"><h2>Catalog: prices &amp; materials</h2>
  <p class="hint">One catalog shared by all projects (shelf racks and workbenches). It is stored in this browser. Enter what your timber yard charges.</p>
  ${L.pricesEdited ? '' : '<p class="banner">Example prices loaded. Change any price (or click <a href="#" id="pricesok">these are fine</a>) to hide this note.</p>'}
  <h3>Timber profiles</h3><table class="tbl lib">
  <tr><th>Name</th><th>Thickness</th><th>Height</th><th>Stock lengths (mm) and price per length (kr)</th><th></th></tr>
  ${L.profiles.map(p => `<tr><td><input data-lib="profiles:${p.id}:name" value="${esc(p.name)}"></td>
    <td><input type="number" data-lib="profiles:${p.id}:t" value="${p.t}" style="width:60px"></td>
    <td><input type="number" data-lib="profiles:${p.id}:h" value="${p.h}" style="width:60px"></td>
    <td class="stock">${p.stock.map((s, i) => `<span class="stk"><input type="number" data-stock="${p.id}:${i}:len" value="${s.len}" style="width:68px">mm <input type="number" step="0.01" data-stock="${p.id}:${i}:price" value="${s.price}" style="width:70px">kr<button class="btn icon" data-stockdel="${p.id}:${i}">✕</button></span>`).join('')}
      <button class="btn small" data-stockadd="${p.id}">+ length</button></td>
    <td>${usedProf.has(p.id) ? '<span class="muted">in use</span>' : `<button class="btn icon" data-libdel="profiles:${p.id}">✕</button>`}</td></tr>`).join('')}
  </table><button class="btn" data-libadd="profiles">+ profile</button>
  <p class="hint">Thickness = the thin side (e.g. 45), height = the wide side (e.g. 95). Beams are always used on edge (tall side vertical).</p>

  <h3>Sheets</h3><table class="tbl lib"><tr><th>Name</th><th>Type</th><th>Thickness</th><th>Length</th><th>Width</th><th>Price/sheet</th><th title="Leave blank for standard values">E (MPa)</th><th title="Leave blank for standard values">f<sub>m,k</sub> (MPa)</th><th></th></tr>
  ${L.sheets.map(s => `<tr><td><input data-lib="sheets:${s.id}:name" value="${esc(s.name)}"></td>
    <td><select data-lib="sheets:${s.id}:mat">${opt('OSB3', 'OSB/3', s.mat)}${opt('Plywood', 'Plywood', s.mat)}</select></td>
    <td><input type="number" data-lib="sheets:${s.id}:t" value="${s.t}" style="width:56px"></td>
    <td><input type="number" data-lib="sheets:${s.id}:len" value="${s.len}" style="width:70px"></td>
    <td><input type="number" data-lib="sheets:${s.id}:wid" value="${s.wid}" style="width:70px"></td>
    <td><input type="number" step="0.01" data-lib="sheets:${s.id}:price" value="${s.price}" style="width:80px"></td>
    <td><input type="number" data-lib="sheets:${s.id}:E" value="${s.E || ''}" placeholder="std" style="width:64px"></td>
    <td><input type="number" data-lib="sheets:${s.id}:fm" value="${s.fm || ''}" placeholder="std" style="width:56px"></td>
    <td>${usedSheet.has(s.id) ? '<span class="muted">in use</span>' : `<button class="btn icon" data-libdel="sheets:${s.id}">✕</button>`}</td></tr>`).join('')}
  </table><button class="btn" data-libadd="sheets">+ sheet</button>

  <h3>Screws, plugs, casters &amp; hardware</h3><table class="tbl lib"><tr><th>Name</th><th>Kind</th><th>Per pack</th><th>Pack price</th><th title="Screws: design shear capacity per screw. Plugs: maker's recommended working load per plug in your wall. Casters/feet: rated load each. Hardware: design capacity each.">Capacity kN</th><th title="Casters/feet only: floor to top of plate">Height mm</th><th>Note</th><th></th></tr>
  ${L.fasteners.map(f => `<tr><td><input data-lib="fasteners:${f.id}:name" value="${esc(f.name)}"></td>
    <td><select data-lib="fasteners:${f.id}:kind">${opt('screw', 'Screw', f.kind)}${opt('plug', 'Plug / anchor', f.kind)}${opt('hardware', 'Hardware', f.kind)}${opt('caster', 'Caster', f.kind)}${opt('foot', 'Foot', f.kind)}</select></td>
    <td><input type="number" data-lib="fasteners:${f.id}:perBox" value="${f.perBox}" style="width:64px"></td>
    <td><input type="number" step="0.01" data-lib="fasteners:${f.id}:boxPrice" value="${f.boxPrice}" style="width:76px"></td>
    <td><input type="number" step="0.01" data-lib="fasteners:${f.id}:cap" value="${f.cap ?? ''}" placeholder="–" style="width:60px"></td>
    <td>${f.kind === 'caster' || f.kind === 'foot' ? `<input type="number" data-lib="fasteners:${f.id}:height" value="${f.height ?? ''}" style="width:60px">` : ''}</td>
    <td><input data-lib="fasteners:${f.id}:note" value="${esc(f.note || '')}" style="width:100%"></td>
    <td><button class="btn icon" data-libdel="fasteners:${f.id}">✕</button></td></tr>`).join('')}
  </table><button class="btn" data-libadd="fasteners">+ fastener</button>
  <p class="hint"><b>Capacity</b>: for screws, the design shear capacity per screw (5 mm screw in 45 mm softwood ≈ 0.8–1.0 kN). For plugs, the <i>recommended load</i> from the maker's table for your brick (solid brick: often 0.4–1 kN for 8 mm nylon plugs, hollow brick: much less). Leave blank if unknown; that check will then show "not checked".</p></div>`;
  $('#page-library').innerHTML = h;
  bindLibrary();
}

function bindLibrary() {
  const L = S.library, pg = $('#page-library');
  const pok = $('#pricesok', pg);
  if (pok) pok.onclick = (e) => { e.preventDefault(); L.pricesEdited = true; App.refresh(); };
  $$('[data-lib]', pg).forEach(el => el.onchange = () => {
    snapshot();
    const [coll, id, f] = el.dataset.lib.split(':');
    const o = L[coll].find(x => x.id === id);
    const numeric = el.type === 'number';
    let v = numeric ? (el.value === '' ? null : parseFloat(el.value)) : el.value;
    o[f] = v;
    if (/price/i.test(f)) L.pricesEdited = true;
    App.refresh();
  });
  $$('[data-stock]', pg).forEach(el => el.onchange = () => {
    snapshot();
    const [id, i, f] = el.dataset.stock.split(':');
    L.profiles.find(p => p.id === id).stock[+i][f] = num(el);
    if (f === 'price') L.pricesEdited = true;
    App.refresh();
  });
  $$('[data-stockdel]', pg).forEach(el => el.onclick = () => {
    const [id, i] = el.dataset.stockdel.split(':');
    const p = L.profiles.find(p => p.id === id);
    if (p.stock.length <= 1) return alert('A profile needs at least one stock length.');
    snapshot(); p.stock.splice(+i, 1); App.refresh();
  });
  $$('[data-stockadd]', pg).forEach(el => el.onclick = () => {
    snapshot(); const p = L.profiles.find(p => p.id === el.dataset.stockadd);
    const last = p.stock[p.stock.length - 1];
    p.stock.push({ len: last ? last.len + 600 : 2400, price: last ? last.price : 0 }); App.refresh();
  });
  $$('[data-libdel]', pg).forEach(el => el.onclick = () => {
    const [coll, id] = el.dataset.libdel.split(':');
    if (coll === 'fasteners') {
      const used = S.projects.filter(d => Object.values(d.rules).some(r => r.items.some(i => i.type === id)) || d.manual.some(m => m.items.some(i => i.type === id)) || Object.values(d.overrides).some(o => o.items && o.items.some(i => i.type === id)));
      if (used.length) return alert('This item is used in: ' + used.map(p => p.name).join(', ') + '. Change those rules/points first.');
    }
    snapshot(); L[coll] = L[coll].filter(x => x.id !== id); App.refresh();
  });
  $$('[data-libadd]', pg).forEach(el => el.onclick = () => {
    snapshot();
    const coll = el.dataset.libadd;
    if (coll === 'profiles') L.profiles.push({ id: uid('p'), name: 'New profile', t: 45, h: 95, stock: [{ len: 2400, price: 0 }] });
    if (coll === 'sheets') L.sheets.push({ id: uid('sh'), name: 'New sheet', mat: 'OSB3', t: 18, len: 2440, wid: 1220, price: 0 });
    if (coll === 'fasteners') L.fasteners.push({ id: uid('f'), name: 'New fastener', kind: 'screw', perBox: 100, boxPrice: 0, cap: null, note: '' });
    App.refresh();
  });
}

/* ---------------- file ops ---------------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify({ app: 'garage-planner', design: S.design, library: S.library }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (S.design.name || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* Opening a file adds it as a new project. Catalog items it uses that are missing here are added;
   your existing prices are only replaced if you say so. */
function importJSON(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o.design) throw new Error('No design in file');
      const d = migrateDesign(o.design);
      if (S.projects.some(p => p.id === d.id)) d.id = uid('prj');
      if (S.projects.some(p => p.name === d.name)) d.name += ' (imported)';
      if (o.library) {
        let added = 0;
        for (const coll of ['profiles', 'sheets', 'fasteners']) for (const it of o.library[coll] || [])
          if (!S.library[coll].find(x => x.id === it.id)) { S.library[coll].push(it); added++; }
        if (confirm(`Opened "${d.name}".${added ? ` ${added} catalog item(s) from the file were added.` : ''}\n\nAlso overwrite your current prices with the prices saved in the file?\n(Cancel keeps your prices.)`)) {
          for (const coll of ['profiles', 'sheets', 'fasteners']) for (const it of o.library[coll] || []) {
            const i = S.library[coll].findIndex(x => x.id === it.id); if (i >= 0) S.library[coll][i] = it;
          }
        }
      }
      S.projects.push(d);
      switchProject(d.id);
      afterProjectChange();
    } catch (e) { alert('Could not read file: ' + e.message); }
  };
  rd.readAsText(file);
}
