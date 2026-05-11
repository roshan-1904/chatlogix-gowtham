// ChatLogix Roadmap — app.js
// Reads window.CL_DATA populated by data/phases.js and all module data files.

const PHASES  = window.CL_DATA.phases;
const MODULES = window.CL_DATA.modules;

/* ── STATE (persisted) ──────────────────────────── */
const S = {
  filter   : 'all',
  query    : '',
  tag      : '',
  open     : null,
  statuses : JSON.parse(localStorage.getItem('cl_st') || '{}'),
  checked  : JSON.parse(localStorage.getItem('cl_ck') || '{}'),
};

const persist = () => {
  localStorage.setItem('cl_st', JSON.stringify(S.statuses));
  localStorage.setItem('cl_ck', JSON.stringify(S.checked));
};

const statusOf = id => S.statuses[id] || (MODULES.find(m => m.id === id) || {}).status || 'planned';

/* ── STATS ──────────────────────────────────────── */
function renderStats() {
  const done = MODULES.filter(m => statusOf(m.id) === 'done').length;
  const pct  = MODULES.length ? Math.round(done / MODULES.length * 100) : 0;

  const elDone  = document.getElementById('hdr-done');
  const elTotal = document.getElementById('hdr-total');
  const elBar   = document.getElementById('hdr-bar');
  if (elDone)  elDone.textContent  = done;
  if (elTotal) elTotal.textContent = MODULES.length;
  if (elBar)   elBar.style.width   = pct + '%';
}

/* ── FILTER HELPERS ─────────────────────────────── */
function isVisible(m) {
  const f = S.filter, s = statusOf(m.id), q = S.query.toLowerCase();
  const passF = f === 'all' || f === s || f === ('p' + m.ph);
  if (!passF) return false;
  if (S.tag && !(m.tags || []).includes(S.tag)) return false;
  if (!q) return true;
  return m.title.toLowerCase().includes(q)
      || m.desc.toLowerCase().includes(q)
      || (m.tags || []).some(t => t.includes(q))
      || m.id.includes(q);
}

/* ── RENDER ROADMAP ─────────────────────────────── */
function render() {
  const root = document.getElementById('main-content');
  root.innerHTML = '';

  PHASES.forEach((ph, idx) => {
    const pMods    = MODULES.filter(m => m.ph === ph.id);
    const visMods  = pMods.filter(m => isVisible(m));
    if (!visMods.length && S.filter !== 'all') return;

    if (idx > 0) {
      root.insertAdjacentHTML('beforeend',
        `<div class="phase-connector"><div class="phase-connector-inner"></div></div>`);
    }

    const done = pMods.filter(m => statusOf(m.id) === 'done').length;
    const inp  = pMods.filter(m => statusOf(m.id) === 'in-progress').length;
    const pst  = pMods.length && done === pMods.length ? 'done' : inp ? 'in-progress' : 'planned';
    const badge = pst === 'done' ? '✅ Complete' : pst === 'in-progress' ? '🔄 In Progress' : '📋 Planned';

    const sec = document.createElement('div');
    sec.className = 'phase-section';
    sec.innerHTML =
      `<div class="phase-header">
         <div class="phase-icon-wrap ${pst}">${ph.icon}</div>
         <div class="phase-info">
           <div class="phase-title">${ph.title}</div>
           <div class="phase-sub">${ph.sub}</div>
         </div>
         <div class="phase-count">${done}/${pMods.length} done</div>
         <div class="phase-badge ${pst}">${badge}</div>
       </div>
       <div class="modules-grid" id="g${ph.id}"></div>`;
    root.appendChild(sec);

    const grid = sec.querySelector('#g' + ph.id);

    pMods.forEach(m => {
      const s     = statusOf(m.id);
      const show  = isVisible(m);
      const sicon = s === 'done' ? '✅' : s === 'in-progress' ? '🔄' : '📋';
      const total = (m.checklist || []).length;
      const ck    = total ? (m.checklist || []).filter((_, i) => S.checked[`${m.id}_${i}`]).length : 0;
      const pct   = total ? Math.round(ck / total * 100) : 0;
      const pfill = pct === 100 ? 'var(--green)' : 'var(--blue)';

      const card = document.createElement('div');
      card.className = `mcard ${s}${!show ? ' hidden' : ''}${S.open === m.id ? ' active' : ''}`;
      card.dataset.id = m.id;
      card.innerHTML =
        `<div class="mc-top">
           <div class="mc-id">${m.id.toUpperCase()}</div>
           <div class="mc-status">${sicon}</div>
         </div>
         <span class="mc-icon">${m.icon}</span>
         <div class="mc-title">${m.title}</div>
         <div class="mc-desc">${m.desc}</div>
         ${total ? `<div class="mc-progress-wrap">
           <div class="mc-progress-label"><span>Progress</span><span>${ck}/${total}</span></div>
           <div class="mc-progress-bar">
             <div class="mc-progress-fill" style="width:${pct}%;background:${pfill}"></div>
           </div></div>` : ''}
         <div class="mc-tags">${(m.tags || []).map(t => `<span class="mc-tag">${t}</span>`).join('')}</div>`;

      card.addEventListener('click', () => openDrawer(m.id));
      grid.appendChild(card);
    });
  });
}

/* ── DRAWER ─────────────────────────────────────── */
function openDrawer(id) {
  const m = MODULES.find(x => x.id === id);
  if (!m) return;
  S.open = id;

  document.querySelectorAll('.mcard').forEach(c => c.classList.toggle('active', c.dataset.id === id));

  const s      = statusOf(id);
  const ph     = PHASES.find(p => p.id === m.ph);
  const slabel = s === 'done' ? '✅ Done' : s === 'in-progress' ? '🔄 In Progress' : '📋 Planned';

  const total = (m.checklist || []).length;
  const ck    = total ? (m.checklist || []).filter((_, i) => S.checked[`${id}_${i}`]).length : 0;

  document.getElementById('drawer-body').innerHTML = `
    <div class="dh-phase">${ph.icon} ${ph.title}</div>
    <div class="dh-title">${m.icon} ${m.title}</div>
    <div class="dh-meta">
      <span class="dh-badge ${s}">${slabel}</span>
      ${(m.tags || []).map(t => `<span class="dh-tag">${t}</span>`).join('')}
    </div>

    <div class="ds">
      <div class="ds-title">Status</div>
      <div class="status-row">
        <button class="sbtn${s==='planned'?' on-planned':''}"     onclick="setSt('${id}','planned')">📋 Planned</button>
        <button class="sbtn${s==='in-progress'?' on-in-progress':''}" onclick="setSt('${id}','in-progress')">🔄 In Progress</button>
        <button class="sbtn${s==='done'?' on-done':''}"           onclick="setSt('${id}','done')">✅ Done</button>
      </div>
    </div>

    <div class="ds">
      <div class="ds-title">Overview</div>
      <div class="d-overview">${m.overview || m.desc}</div>
    </div>

    ${m.whatToDo?.length ? `<div class="ds">
      <div class="ds-title">🛠️ What To Build — Developer Tasks</div>
      <ol class="tlist">${m.whatToDo.map(t => `<li>${t}</li>`).join('')}</ol>
    </div>` : ''}

    ${m.uiScreens?.length ? `<div class="ds">
      <div class="ds-title">🖥️ UI Screens to Build</div>
      <ul class="slist">${m.uiScreens.map(s => `<li>${s}</li>`).join('')}</ul>
    </div>` : ''}

    ${m.features?.length ? `<div class="ds">
      <div class="ds-title">Key Features</div>
      <ul class="flist">${m.features.map(f => `<li>${f}</li>`).join('')}</ul>
    </div>` : ''}

    ${m.checklist?.length ? `<div class="ds">
      <div class="ds-title">Implementation Checklist &nbsp;<span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">${ck}/${total} done</span></div>
      <ul class="clist" id="cl-${id}">
        ${m.checklist.map((item, i) => {
          const checked = !!S.checked[`${id}_${i}`];
          return `<li class="${checked ? 'ck' : ''}" onclick="toggleCk('${id}',${i})">
            <span class="cb">${checked ? '✓' : ''}</span>${item}
          </li>`;
        }).join('')}
      </ul>
    </div>` : ''}

    ${m.docRefs?.length ? `<div class="ds">
      <div class="ds-title">📄 Docs to Read</div>
      <div class="doc-grid">
        ${m.docRefs.map(d =>
          `<a class="doc-chip" href="${d.path}" title="${d.path}">
            <span class="doc-icon">${d.icon || '📄'}</span>
            <span class="doc-label">${d.label}</span>
            <span class="doc-path">${d.path.replace('../', '')}</span>
          </a>`
        ).join('')}
      </div>
    </div>` : ''}

    ${m.deps?.length ? `<div class="ds">
      <div class="ds-title">Depends On</div>
      <div class="dep-row">
        ${m.deps.map(d => {
          const dep = MODULES.find(x => x.id === d);
          return dep
            ? `<span class="dep-chip" onclick="openDrawer('${d}')">${dep.icon} ${dep.title}</span>`
            : '';
        }).join('')}
      </div>
    </div>` : ''}

    ${m.tech?.length ? `<div class="ds">
      <div class="ds-title">Tech Stack</div>
      <div class="tgrid">
        ${m.tech.map(t =>
          `<div class="titem"><div class="tkey">${t.k}</div><div class="tval">${t.v}</div></div>`
        ).join('')}
      </div>
    </div>` : ''}
  `;

  document.getElementById('drawer').classList.add('on');
  document.getElementById('overlay').classList.add('on');
}

function closeDrawer() {
  S.open = null;
  document.getElementById('drawer').classList.remove('on');
  document.getElementById('overlay').classList.remove('on');
  document.querySelectorAll('.mcard').forEach(c => c.classList.remove('active'));
}

/* ── GLOBAL ACTIONS (called from inline onclick) ── */
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

window.setSt = function(id, newSt) {
  S.statuses[id] = newSt;
  persist();
  renderStats();
  render();
  openDrawer(id);
};

window.toggleCk = function(id, i) {
  const key = `${id}_${i}`;
  S.checked[key] = !S.checked[key];
  persist();

  const li = document.querySelector(`#cl-${id} li:nth-child(${i + 1})`);
  if (li) {
    li.classList.toggle('ck', S.checked[key]);
    li.querySelector('.cb').textContent = S.checked[key] ? '✓' : '';
  }

  const m     = MODULES.find(x => x.id === id);
  const total = (m.checklist || []).length;
  const done  = (m.checklist || []).filter((_, j) => S.checked[`${id}_${j}`]).length;
  const head  = document.querySelector(`#cl-${id}`)?.closest('.ds')?.querySelector('.ds-title');
  if (head) head.innerHTML = `Implementation Checklist &nbsp;<span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">${done}/${total} done</span>`;

  const card = document.querySelector(`[data-id="${id}"]`);
  if (card && total) {
    const pct   = Math.round(done / total * 100);
    const fill  = card.querySelector('.mc-progress-fill');
    const label = card.querySelector('.mc-progress-label span:last-child');
    if (fill)  { fill.style.width = pct + '%'; fill.style.background = pct === 100 ? 'var(--green)' : 'var(--blue)'; }
    if (label) label.textContent = `${done}/${total}`;
  }
  renderStats();
};

/* ── EVENTS ─────────────────────────────────────── */
document.getElementById('search').addEventListener('input', e => {
  S.query = e.target.value.trim();
  render();
});

const tagSel = document.getElementById('filter-tag');
if (tagSel) {
  tagSel.addEventListener('change', e => {
    S.tag = e.target.value;
    render();
  });
}

document.getElementById('overlay').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ── INIT ───────────────────────────────────────── */
(function populateTags() {
  const sel = document.getElementById('filter-tag');
  if (!sel) return;
  const all = new Set();
  MODULES.forEach(m => (m.tags || []).forEach(t => all.add(t)));
  [...all].sort().forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
})();

renderStats();
render();
