'use strict';
(function main() {
  loadState();
  initViews();
  bindPanel();
  bindKeys();
  init3D();

  const dn = document.getElementById('dname');
  dn.onchange = () => { snapshot(); S.design.name = dn.value.trim() || S.design.name; App.refresh(); };

  // projects
  document.getElementById('projSel').onchange = (e) => { switchProject(e.target.value); afterProjectChange(); };
  document.querySelectorAll('[data-proj]').forEach(b => b.onclick = () => {
    const a = b.dataset.proj;
    b.closest('details').open = false;
    if (a === 'new-shelf') newProject('shelf');
    else if (a === 'new-bench') newProject('bench');
    else if (a === 'dup') {
      const c = clone(S.design); c.id = uid('prj'); c.name = S.design.name + ' (copy)';
      S.projects.push(c); switchProject(c.id);
    } else if (a === 'del') {
      if (S.projects.length <= 1) return alert('This is the only project. Create another one first.');
      if (!confirm(`Delete the project "${S.design.name}"? This cannot be undone (use "Save file" first if you want to keep it).`)) return;
      S.projects = S.projects.filter(p => p.id !== S.design.id);
      switchProject(S.projects[0].id);
    }
    afterProjectChange();
  });
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach(m => { if (!m.contains(e.target)) m.open = false; });
  });

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  document.getElementById('status').addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) setTab(g.dataset.goto);
  });
  document.getElementById('undo').onclick = () => { undo(); App.refresh(); };
  document.getElementById('redo').onclick = () => { redo(); App.refresh(); };
  document.getElementById('export').onclick = exportJSON;
  document.getElementById('import').onchange = (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };

  // 3D options
  const o = V3.opts;
  const on = (id, f) => { const el = document.getElementById(id); el.oninput = el.onchange = () => { f(el); update3D(S.model); }; };
  on('o-wall', el => o.wall = el.checked);
  on('o-osb', el => o.osb = el.value);
  on('o-fast', el => o.fasteners = el.checked);
  on('o-explode', el => o.explode = parseFloat(el.value));
  document.getElementById('o-frame').onclick = () => frame3D(S.model);

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { V.front.vb = V.side.vb = V.plan.vb = null; if (S.model) renderViews(S.model); }, 120);
  });

  const tabs = ['design', '3d', 'checks', 'cut', 'cost', 'guide', 'library'];
  const h = location.hash.slice(1);
  setTab(tabs.includes(h) ? h : 'design');
})();
