'use strict';
/* ============================================================
   3D view (three.js r128, loaded from CDN)
   three.x = x (along wall), three.y = z (up), three.z = y (out from wall)
   Units: metres in the scene.
   ============================================================ */

const V3 = { ok: false, host: null, opts: { wall: true, osb: 'solid', fasteners: false, explode: 0 } };
const ROLE_COL = {
  leg: 0xb07a43, ledger: 0x9c6b3c, front: 0xc8925a, cross: 0xd9a86c, osb: 0xd8c08a,
  post: 0xb07a43, rail: 0xc8925a, endrail: 0xc08a52, topcross: 0xc08a52, joist: 0xd9a86c, srail: 0xc8925a, scross: 0xd9a86c, strip: 0x9c6b3c,
  top: 0xd8c08a, shelf: 0xe0c995, panel: 0xcdb682, pad: 0xa08a60,
};

function init3D() {
  if (typeof THREE === 'undefined') { V3.ok = false; return; }
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9dde2);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  cam.position.set(2.8, 1.9, 3.6);
  const ctr = new THREE.OrbitControls(cam, r.domElement);
  ctr.enableDamping = true;
  ctr.target.set(1.2, 0.9, 0.3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(2, 4, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.far = 15;
  scene.add(sun); scene.add(sun.target);
  const group = new THREE.Group(); scene.add(group);
  Object.assign(V3, { ok: true, r, scene, cam, ctr, sun, group });
  const loop = () => {
    requestAnimationFrame(loop);
    if (!V3.host || !V3.host.offsetParent) return;
    ctr.update();
    r.render(scene, cam);
  };
  loop();
  window.addEventListener('resize', () => resize3D());
}

function mount3D(host) {
  if (!V3.ok) {
    host.innerHTML = '<div class="nothree">3D needs an internet connection the first time (three.js loads from a CDN). The rest of the planner works offline.</div>';
    return;
  }
  if (V3.host !== host) { V3.host = host; host.appendChild(V3.r.domElement); }
  resize3D();
}
function resize3D() {
  if (!V3.ok || !V3.host) return;
  const w = V3.host.clientWidth, h = V3.host.clientHeight;
  if (!w || !h) return;
  V3.r.setSize(w, h);
  V3.cam.aspect = w / h; V3.cam.updateProjectionMatrix();
}

function woodMat(col, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, metalness: 0, ...opts });
}

function box(x0, x1, y0, y1, z0, z1, mat) {
  // mm → m, axis remap
  const g = new THREE.BoxGeometry((x1 - x0) / 1000, (z1 - z0) / 1000, (y1 - y0) / 1000);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set((x0 + x1) / 2000, (z0 + z1) / 2000, (y0 + y1) / 2000);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.35 }));
  mesh.add(edges);
  return mesh;
}

let _framed = false;
function update3D(m) {
  if (!V3.ok || !m) return;
  const grp = V3.group;
  while (grp.children.length) {
    const c = grp.children.pop();
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const ex = V3.opts.explode;           // 0..1: lift everything in proportion to its height, sheets a bit more
  const exZ = (zc, isSheet) => ex * (zc * 0.45 + (isSheet ? 120 : 0));
  const sel = S.ui.sel;
  const selMatch = (mem) => sel && (
    (sel.kind === 'cross' && mem.role === 'cross' && mem.refId === sel.id) ||
    (sel.kind === 'leg' && mem.role === 'leg' && mem.refId === sel.id) ||
    (sel.kind === 'shelf' && mem.shelfId === sel.id) ||
    (sel.kind === 'pair' && mem.role === 'post' && mem.id.startsWith('post:' + sel.id + ':')) ||
    (sel.kind === 'level' && mem.levelId === sel.id));

  for (const mem of m.members) {
    const mat = woodMat(selMatch(mem) ? 0xff8c1a : (ROLE_COL[mem.role] || 0xc8925a));
    const dz = mem.role === 'post' || mem.role === 'leg' ? 0 : exZ((mem.z0 + mem.z1) / 2, false);
    grp.add(box(mem.x0, mem.x1, mem.y0, mem.y1, mem.z0 + dz, mem.z1 + dz, mat));
  }
  const osbMode = V3.opts.osb;
  if (osbMode !== 'hidden') for (const s of m.sheets) {
    const vertical = !!s.vertical;
    const col = sel && sel.kind === 'level' && s.levelId === sel.id ? 0xffb060 : (ROLE_COL[s.role] || ROLE_COL.osb);
    const mat = woodMat(col, osbMode === 'ghost' ? { transparent: true, opacity: 0.35, depthWrite: false } : {});
    const dz = vertical ? 0 : exZ((s.z0 + s.z1) / 2, true);
    const inset = vertical ? 0 : 1;
    const b = box(s.x0 + inset, s.x1 - inset, s.y0, s.y1, s.z0 + dz, s.z1 + dz, mat);
    if (osbMode === 'ghost') b.castShadow = false;
    grp.add(b);
  }
  // casters / feet
  for (const f of m.feet || []) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 });
    if (f.kind === 'caster') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.08), metal);
      plate.position.set(f.x / 1000, (f.h - 4) / 1000, f.y / 1000); grp.add(plate);
      const r = Math.max(0.02, (f.h - 15) / 2000);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(f.x / 1000, r, f.y / 1000); wheel.castShadow = true; grp.add(wheel);
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.04, (f.h - r * 1000) / 1000, 0.03), metal);
      fork.position.set(f.x / 1000, (r * 1000 + (f.h - r * 1000) / 2) / 1000, f.y / 1000); grp.add(fork);
    } else {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, f.h / 1000, 16), metal);
      foot.position.set(f.x / 1000, f.h / 2000, f.y / 1000); grp.add(foot);
    }
  }
  if (V3.opts.fasteners) {
    const geo = new THREE.SphereGeometry(0.008, 10, 8);
    for (const j of m.joints) {
      const col = new THREE.Color(RULE_COLOR[j.rule] || '#555');
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
      mesh.position.set(j.x / 1000, j.z / 1000, j.y / 1000);
      grp.add(mesh);
    }
  }
  // floor + wall
  const bb = m.bbox, cx = (bb.x0 + bb.x1) / 2000, cy = (bb.y0 + bb.y1) / 2000;
  const W = bb.x1 - bb.x0, H = bb.z1 + 300;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W / 1000 + 3, 4), new THREE.MeshStandardMaterial({ color: 0xbdbab3, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, m.hasWall ? 1.5 : cy); floor.receiveShadow = true;
  grp.add(floor);
  if (V3.opts.wall && m.hasWall) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W / 1000 + 3, H / 1000 + 0.6), new THREE.MeshStandardMaterial({ color: 0xb5583c, roughness: 1 }));
    wall.position.set(cx, (H / 1000 + 0.6) / 2, -0.001); wall.receiveShadow = true;
    grp.add(wall);
  }
  V3.sun.target.position.set(cx, 0, cy);
  const wl = document.getElementById('o-wall'); if (wl) wl.parentElement.style.display = m.hasWall ? '' : 'none';
  if (!_framed) { frame3D(m); _framed = true; }
}

function frame3D(m) {
  if (!V3.ok) return;
  const bb = m.bbox;
  const W = (bb.x1 - bb.x0) / 1000, H = bb.z1 / 1000, D = (bb.y1 - bb.y0) / 1000;
  const cx = (bb.x0 + bb.x1) / 2000, cy = (bb.y0 + bb.y1) / 2000;
  V3.ctr.target.set(cx, H / 2, cy);
  const dist = Math.max(W, H) * 1.6 + 0.8;
  V3.cam.position.set(cx + dist * 0.55, H * 0.75 + 0.4 + (m.hasWall ? 0 : 0.3), cy + D / 2 + dist * 0.85);
  V3.ctr.update();
}
