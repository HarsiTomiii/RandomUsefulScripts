'use strict';
/* ============================================================
   Data model, global catalog, projects, persistence, undo/redo
   Each project is a design object with { id, type: 'shelf'|'bench', name, ... }.
   The catalog (S.library) is global and shared by all projects.
   ============================================================ */

const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const clone = (o) => JSON.parse(JSON.stringify(o));
const G = 9.81;

/* ---------------- global catalog ---------------- */
const DEFAULT_PROFILES = [
  { id: 'p45x95', name: '45×95 construction timber', t: 45, h: 95,
    stock: [{ len: 2400, price: 55 }, { len: 3000, price: 69 }, { len: 3600, price: 82 }, { len: 4800, price: 110 }] },
  { id: 'p45x70', name: '45×70 construction timber', t: 45, h: 70,
    stock: [{ len: 2400, price: 42 }, { len: 3000, price: 52 }, { len: 3600, price: 62 }] },
  { id: 'p45x120', name: '45×120 construction timber', t: 45, h: 120,
    stock: [{ len: 2400, price: 72 }, { len: 3600, price: 105 }] },
  { id: 'p24x49', name: '24×49 batten', t: 24, h: 49,
    stock: [{ len: 2400, price: 15 }] },
  { id: 'p95x95', name: '95×95 post', t: 95, h: 95,
    stock: [{ len: 2400, price: 119 }, { len: 3000, price: 149 }] },
  { id: 'p45x45', name: '45×45 batten', t: 45, h: 45,
    stock: [{ len: 2400, price: 29 }] },
];
const DEFAULT_SHEETS = [
  { id: 'osb12', name: 'OSB/3 12 mm', mat: 'OSB3', t: 12, len: 2440, wid: 1220, price: 199 },
  { id: 'osb18', name: 'OSB/3 18 mm', mat: 'OSB3', t: 18, len: 2440, wid: 1220, price: 289 },
  { id: 'osb22', name: 'OSB/3 22 mm', mat: 'OSB3', t: 22, len: 2440, wid: 1220, price: 349 },
];
const DEFAULT_FASTENERS = [
  { id: 'f5x80', name: 'Wood screw 5×80 (part thread)', kind: 'screw', perBox: 100, boxPrice: 129, cap: 0.9,
    note: 'Design shear capacity per screw, 45 mm softwood.' },
  { id: 'f4x40', name: 'Wood screw 4×40', kind: 'screw', perBox: 200, boxPrice: 79, cap: null, note: 'Sheets to timber.' },
  { id: 'f6x100', name: 'Screw 6×100 (for wall plugs)', kind: 'screw', perBox: 50, boxPrice: 99, cap: null,
    note: 'Length ≈ ledger thickness + plug length + 5 mm.' },
  { id: 'plug8', name: 'Nylon plug 8×50 (brick)', kind: 'plug', perBox: 100, boxPrice: 59, cap: 0.4,
    note: 'Recommended working load per plug in YOUR brick. Check the manufacturer table. Hollow brick is much lower!' },
  { id: 'f6x100w', name: 'Wood screw 6×100 (part thread)', kind: 'screw', perBox: 50, boxPrice: 129, cap: 1.2,
    note: 'Design shear capacity per screw through 45 mm into a post.' },
  { id: 'f4x50', name: 'Wood screw 4×50', kind: 'screw', perBox: 200, boxPrice: 89, cap: null, note: 'Thicker sheets / 2nd layer.' },
  { id: 'f6x40', name: 'Screw 6×40 (caster plates)', kind: 'screw', perBox: 100, boxPrice: 79, cap: null, note: '' },
  { id: 'nail4x40', name: 'Anchor nail/screw 4×40 (for hangers)', kind: 'screw', perBox: 250, boxPrice: 99, cap: null, note: '' },
  { id: 'hanger45', name: 'Joist hanger 45×95', kind: 'hardware', perBox: 10, boxPrice: 129, cap: 3.0,
    note: 'Design capacity per hanger when fully nailed. Check the maker\'s data.' },
  { id: 'caster100', name: 'Swivel caster Ø100 with brake', kind: 'caster', perBox: 1, boxPrice: 89, cap: 1.0, height: 128,
    note: 'Cap = rated load per caster (kN; 1 kN ≈ 100 kg). Height = floor to top of plate.' },
  { id: 'foot_lvl', name: 'Levelling foot M10', kind: 'foot', perBox: 4, boxPrice: 79, cap: 2.0, height: 40,
    note: 'Cap = rated load per foot (kN). Height = floor to underside of leg.' },
];
function defaultLibrary() {
  return {
    pricesEdited: false,
    seeded: [...DEFAULT_PROFILES.map(p => p.id), ...DEFAULT_SHEETS.map(s => s.id), ...DEFAULT_FASTENERS.map(f => f.id)],
    profiles: clone(DEFAULT_PROFILES),
    sheets: clone(DEFAULT_SHEETS),
    fasteners: clone(DEFAULT_FASTENERS),
  };
}
/* add catalog items introduced in newer versions (but never re-add ones the user deleted) */
function migrateLibrary(L) {
  L.seeded = L.seeded || ['p45x95', 'p45x70', 'p45x120', 'p24x49', 'osb12', 'osb18', 'osb22', 'f5x80', 'f4x40', 'f6x100', 'plug8'];
  const add = (coll, defs) => defs.forEach(d => {
    if (!L.seeded.includes(d.id)) { if (!L[coll].find(x => x.id === d.id)) L[coll].push(clone(d)); L.seeded.push(d.id); }
  });
  add('profiles', DEFAULT_PROFILES); add('sheets', DEFAULT_SHEETS); add('fasteners', DEFAULT_FASTENERS);
  return L;
}

function evenly(n, total, memberWidth) {
  if (n <= 1) return [total / 2];
  const a = memberWidth / 2, b = total - memberWidth / 2;
  return Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * i / (n - 1)));
}

/* ---------------- shelf rack defaults ---------------- */
function defaultShelfDesign() {
  const W = 2400;
  return {
    type: 'shelf', id: uid('prj'), version: 2,
    name: 'Shelf rack',
    W, D: 600,
    grade: 'C18', serviceClass: 2, deflLimit: 200,
    roles: { ledger: 'p45x95', cross: 'p45x95', front: 'p45x95', leg: 'p45x95' },
    sheetId: 'osb18',
    legOrient: 'wideX', legTopExtra: 0,
    linkCross: true,
    cross: evenly(5, W, 45).map(x => ({ id: uid('c'), x })),
    shelves: [
      { id: uid('s'), z: 1800, load: 100, cross: [] },
      { id: uid('s'), z: 1150, load: 100, cross: [] },
      { id: uid('s'), z: 500, load: 100, cross: [] },
    ],
    legs: evenly(3, W, 95).map(x => ({ id: uid('l'), x })),
    rules: {
      ledgerWall: { items: [{ type: 'f6x100', n: 1 }, { type: 'plug8', n: 1 }], spacing: 400, edge: 100, stagger: true },
      crossLedger: { items: [{ type: 'f5x80', n: 2 }] },
      crossFront: { items: [{ type: 'f5x80', n: 2 }] },
      frontLeg: { items: [{ type: 'f5x80', n: 4 }] },
      osbCross: { items: [{ type: 'f4x40', n: 1 }], spacing: 200, edge: 50 },
    },
    overrides: {}, manual: [], extras: [],
    cut: { kerf: 3, trim: 5, minOffcut: 300 },
    snap: 5,
  };
}
const defaultDesign = defaultShelfDesign;

const SHELF_RULES = {
  ledgerWall: { label: 'Ledger → wall (per fixing point)', spaced: true,
    help: 'Plug + screw through the ledger into the brick. Spacing along the ledger.' },
  crossLedger: { label: 'Crossbeam → ledger (per crossbeam end)', spaced: false,
    help: 'Toe-screwed (at ~45°) through the side of the crossbeam into the ledger. Holds position; the timber carries the load.' },
  crossFront: { label: 'Crossbeam → front beam (per crossbeam end)', spaced: false,
    help: 'Toe-screwed into the front beam. Ties the front frame back to the wall, so do not skip.' },
  frontLeg: { label: 'Front beam → leg (per beam end / crossing)', spaced: false,
    help: 'Screwed from the front through the leg into the front beam. Carries the front load in shear; this is checked.' },
  osbCross: { label: 'OSB → crossbeam (per crossbeam, along depth)', spaced: true,
    help: 'Screw OSB down to every crossbeam. This also makes the rack stiff sideways.' },
};
const RULE_INFO = SHELF_RULES; // legacy name used by shelf code

/* ---------------- global state ---------------- */
const STORE_KEY_V1 = 'garagePlanner.shelf.v1';
const STORE_KEY = 'garagePlanner.v2';
const S = {
  projects: [],
  design: null,          // = the current project's design object
  library: null,
  ui: { tab: 'design', selShelf: null, selLevel: null, planLevel: 'top', sel: null, tool: null },
  hist: [], fut: [],
};

function crossOf(shelf) { return S.design.linkCross ? S.design.cross : shelf.cross; }
function shelvesSorted() { return [...S.design.shelves].sort((a, b) => b.z - a.z); }
function shelfLabel(id) {
  const i = shelvesSorted().findIndex(s => s.id === id);
  return i < 0 ? '?' : 'S' + (i + 1);
}
function profile(id) { return S.library.profiles.find(p => p.id === id) || S.library.profiles[0]; }
function sheetDef(id) { return S.library.sheets.find(s => s.id === id) || S.library.sheets[0]; }
function fastener(id) { return S.library.fasteners.find(f => f.id === id); }

function migrateDesign(d) {
  if (!d.type) d.type = 'shelf';
  if (!d.id) d.id = uid('prj');
  const def = d.type === 'bench' ? defaultBenchDesign() : defaultShelfDesign();
  for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = clone(def[k]);
  for (const k of Object.keys(def.rules)) if (!d.rules[k]) d.rules[k] = clone(def.rules[k]);
  return d;
}
const migrate = migrateDesign;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.projects && o.projects.length && o.library) {
        S.library = migrateLibrary(o.library);
        S.projects = o.projects.map(migrateDesign);
        S.design = S.projects.find(p => p.id === o.currentId) || S.projects[0];
        return;
      }
    }
    const old = localStorage.getItem(STORE_KEY_V1);     // version 1: single shelf design
    if (old) {
      const o = JSON.parse(old);
      if (o && o.design && o.library) {
        S.library = migrateLibrary(o.library);
        S.projects = [migrateDesign(o.design)];
        S.design = S.projects[0];
        return;
      }
    }
  } catch (e) { console.warn('load failed', e); }
  S.library = defaultLibrary();
  S.projects = [defaultShelfDesign()];
  S.design = S.projects[0];
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ projects: S.projects, currentId: S.design.id, library: S.library }));
  } catch (e) { console.warn('save failed', e); }
}

/* projects */
function switchProject(id) {
  const p = S.projects.find(x => x.id === id);
  if (!p) return;
  S.design = p;
  S.hist = []; S.fut = [];
  S.ui.sel = null; S.ui.selShelf = null; S.ui.selLevel = null; S.ui.planLevel = 'top'; S.ui.tool = null;
}
function newProject(type) {
  const d = type === 'bench' ? defaultBenchDesign() : defaultShelfDesign();
  const base = d.name; let n = 1;
  while (S.projects.some(p => p.name === d.name)) d.name = `${base} ${++n}`;
  S.projects.push(d);
  switchProject(d.id);
  return d;
}

/* history: snapshot() BEFORE mutating, or begin/endGesture() around a drag */
let _pending = null;
const _snap = () => JSON.stringify({ design: S.design, library: S.library });
function _restore(str) {
  const o = JSON.parse(str);
  const i = S.projects.findIndex(p => p.id === o.design.id);
  S.design = o.design; S.library = o.library;
  if (i >= 0) S.projects[i] = S.design;
}
function snapshot() {
  S.hist.push(_snap());
  if (S.hist.length > 150) S.hist.shift();
  S.fut = [];
}
function beginGesture() { _pending = _snap(); }
function endGesture() {
  if (_pending) {
    if (_snap() !== _pending) { S.hist.push(_pending); S.fut = []; }
    _pending = null;
  }
}
function undo() { if (!S.hist.length) return; S.fut.push(_snap()); _restore(S.hist.pop()); }
function redo() { if (!S.fut.length) return; S.hist.push(_snap()); _restore(S.fut.pop()); }

/* path helpers for data-bound inputs */
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) {
  const ks = path.split('.');
  const last = ks.pop();
  const t = ks.reduce((o, k) => o[k], obj);
  t[last] = val;
}

/* formatting */
const fmtMM = (v) => String(Math.round(v));
const fmtKr = (v, dec = 0) => v.toLocaleString('da-DK', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' kr';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
