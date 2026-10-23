(() => {
  const STORAGE_KEY = 'securefdr_lifecycle_cases_v1';
  const DAYS_WARNING = 30;
  let fdrs = [];

  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem('securefdr_token');

  function cases() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveCases(value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function daysTo(dateValue) {
    if (!dateValue) return null;
    const d = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  }

  function risk(fdr) {
    const days = daysTo(fdr.expiry_date);
    if (days === null) return { label: 'Unknown', cls: 'neutral' };
    if (days < 0 || fdr.status === 'EXPIRED') return { label: 'Expired', cls: 'danger' };
    if (days <= 7) return { label: 'Critical', cls: 'danger' };
    if (days <= DAYS_WARNING) return { label: 'Expiring soon', cls: 'warning' };
    return { label: 'Healthy', cls: 'success' };
  }

  function discrepancies(fdr) {
    const issues = [];
    if (!fdr.fdr_number) issues.push('Missing FDR number');
    if (!fdr.bank_name) issues.push('Missing issuing bank');
    if (!(Number(fdr.amount) > 0)) issues.push('Invalid amount');
    if (!fdr.issue_date || !fdr.expiry_date) issues.push('Missing validity dates');
    if (fdr.issue_date && fdr.expiry_date && new Date(fdr.expiry_date) <= new Date(fdr.issue_date)) issues.push('Expiry before issue date');
    if (!fdr.document_url) issues.push('Supporting certificate missing');
    if (fdr.status === 'VERIFIED' && !fdr.verified_by) issues.push('Verified status has no officer');
    return issues;
  }

  function duplicateIds(list) {
    const counts = new Map();
    list.forEach(f => counts.set(String(f.fdr_number || '').trim().toLowerCase(), (counts.get(String(f.fdr_number || '').trim().toLowerCase()) || 0) + 1));
    return new Set(list.filter(f => counts.get(String(f.fdr_number || '').trim().toLowerCase()) > 1).map(f => f.id));
  }

  function injectStyles() {
    if ($('lifecycleStyles')) return;
    const style = document.createElement('style');
    style.id = 'lifecycleStyles';
    style.textContent = `
      .lifecycle-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .life-stat{background:#fff;border:1px solid #dfe7f1;border-radius:14px;padding:16px}.life-stat span{display:block;color:#63748b;font-size:12px}.life-stat strong{display:block;font-size:25px;margin-top:5px;color:#102a52}.life-panel{margin-top:16px}.life-list{display:grid;gap:10px}.life-alert{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 14px;border:1px solid #e4eaf2;border-radius:12px;background:#fbfcfe}.life-alert strong{display:block}.life-alert small{color:#68788f}.life-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700}.life-badge.danger{background:#fdecec;color:#b42318}.life-badge.warning{background:#fff5d9;color:#9a6700}.life-badge.success{background:#e8f7ef;color:#087443}.life-badge.neutral{background:#eef2f6;color:#5f6f82}.life-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.life-toolbar input,.life-toolbar select{border:1px solid #ccd7e5;border-radius:9px;padding:9px 11px;background:white}.life-actions{display:flex;gap:7px;flex-wrap:wrap}.life-btn{border:1px solid #cbd7e6;background:white;border-radius:8px;padding:7px 10px;font-weight:600;cursor:pointer}.life-btn.primary{background:#174681;color:white;border-color:#174681}.life-btn.danger{color:#b42318}.life-muted{color:#718096}.life-table{width:100%;border-collapse:collapse}.life-table th,.life-table td{padding:11px 8px;border-bottom:1px solid #edf1f5;text-align:left;font-size:13px}.life-table th{color:#62748b;font-size:11px;text-transform:uppercase}.life-note{padding:12px;border-radius:10px;background:#f5f8fc;color:#52657d;font-size:13px}.life-modal{position:fixed;inset:0;background:rgba(15,35,60,.42);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}.life-modal.hidden{display:none}.life-modal-card{background:white;border-radius:16px;max-width:520px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.18)}.life-modal-card textarea{width:100%;box-sizing:border-box;border:1px solid #ccd7e5;border-radius:9px;padding:10px;margin-top:7px}.life-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:800px){.lifecycle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.life-table{min-width:760px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($('lifecyclePanel')) return;
    const app = $('appView');
    const stats = $('stats');
    if (!app || !stats) return;
    const panel = document.createElement('div');
    panel.id = 'lifecyclePanel';
    panel.className = 'card panel life-panel';
    panel.innerHTML = `
      <div class="panel-head"><div><p class="eyebrow">Lifecycle intelligence</p><h3>Monitoring, alerts & compliance actions</h3><p>Track maturity, missing documents, renewals, replacements and release/refund requests.</p></div><div class="life-toolbar"><button id="exportLifecycleBtn" class="life-btn">Export report</button><button id="refreshLifecycleBtn" class="life-btn primary">Refresh intelligence</button></div></div>
      <div id="lifecycleStats" class="lifecycle-grid"></div>
      <div id="lifecycleAlerts" class="life-list"></div>
      <div style="margin-top:18px"><div class="panel-head"><div><h3>FDR lifecycle tracker</h3><p>Smart checks identify cases that need officer attention.</p></div><div class="life-toolbar"><input id="lifeSearch" placeholder="Search FDR or bank"><select id="lifeFilter"><option value="ALL">All lifecycle risks</option><option value="EXPIRING">Expiring ≤ 30 days</option><option value="EXPIRED">Expired</option><option value="MISSING">Missing document</option><option value="DUPLICATE">Duplicate FDR number</option></select></div></div><div class="table-wrap"><table class="life-table"><thead><tr><th>FDR</th><th>Bank</th><th>Expiry</th><th>Risk</th><th>Discrepancies</th><th>Lifecycle action</th></tr></thead><tbody id="lifecycleRows"></tbody></table></div></div>
      <div id="lifecycleCaseNote" class="life-note" style="margin-top:14px">Prototype lifecycle actions are stored in this browser. Production deployment should persist these cases in the central database and connect authorized notification services.</div>
    `;
    stats.insertAdjacentElement('afterend', panel);
    document.body.insertAdjacentHTML('beforeend', `<div id="lifecycleModal" class="life-modal hidden"><div class="life-modal-card"><h3 id="lifeModalTitle">Lifecycle action</h3><p id="lifeModalText" class="life-muted"></p><label>Officer / institution note<textarea id="lifeModalNote" rows="4" maxlength="500"></textarea></label><div class="life-modal-actions"><button id="lifeModalCancel" class="life-btn">Cancel</button><button id="lifeModalConfirm" class="life-btn primary">Save action</button></div></div></div>`);
    $('lifeSearch').addEventListener('input', render);
    $('lifeFilter').addEventListener('change', render);
    $('refreshLifecycleBtn').addEventListener('click', refresh);
    $('exportLifecycleBtn').addEventListener('click', exportReport);
    $('lifeModalCancel').addEventListener('click', closeModal);
    $('lifeModalConfirm').addEventListener('click', saveModalAction);
  }

  let pendingAction = null;
  function openModal(action, fdr) {
    pendingAction = { action, id: fdr.id };
    const titles = { renewal: 'Request renewal', replacement: 'Record replacement', release: 'Request release / refund' };
    $('lifeModalTitle').textContent = titles[action] || 'Lifecycle action';
    $('lifeModalText').textContent = `${fdr.fdr_number} • ${fdr.bank_name} • ₹${Number(fdr.amount).toLocaleString('en-IN')}`;
    $('lifeModalNote').value = '';
    $('lifeModalNote').placeholder = action === 'release' ? 'Reason and authorization reference' : 'Optional note or reference number';
    $('lifecycleModal').classList.remove('hidden');
  }

  function closeModal() { pendingAction = null; $('lifecycleModal').classList.add('hidden'); }

  function saveModalAction() {
    if (!pendingAction) return;
    const all = cases();
    all[pendingAction.id] = all[pendingAction.id] || {};
    const item = all[pendingAction.id];
    const note = $('lifeModalNote').value.trim();
    if (pendingAction.action === 'renewal') item.renewal = { status:'REQUESTED', note, at:new Date().toISOString() };
    if (pendingAction.action === 'replacement') item.replacement = { status:'RECEIVED', note, at:new Date().toISOString() };
    if (pendingAction.action === 'release') item.release = { status:'REQUESTED', note, at:new Date().toISOString() };
    saveCases(all); closeModal(); render();
  }

  function renderStats() {
    const now = new Date();
    const expiring = fdrs.filter(f => { const d=daysTo(f.expiry_date); return d !== null && d >= 0 && d <= DAYS_WARNING; }).length;
    const expired = fdrs.filter(f => { const d=daysTo(f.expiry_date); return d !== null && d < 0; }).length;
    const missing = fdrs.filter(f => !f.document_url).length;
    const verified = fdrs.filter(f => f.status === 'VERIFIED').length;
    const allCases = cases();
    const release = Object.values(allCases).filter(x => x.release?.status === 'REQUESTED').length;
    $('lifecycleStats').innerHTML = [['Active',fdrs.filter(f=>f.status!=='EXPIRED').length],['Expiring ≤30d',expiring],['Expired',expired],['Missing documents',missing],['Verified',verified],['Release/refund requests',release]].map(([l,v])=>`<div class="life-stat"><span>${l}</span><strong>${v}</strong></div>`).join('');
  }

  function renderAlerts() {
    const duplicate = duplicateIds(fdrs);
    const alerts = [];
    fdrs.forEach(f => {
      const d = daysTo(f.expiry_date);
      if (d !== null && d < 0) alerts.push({level:'danger',title:`Expired FDR • ${f.fdr_number}`,text:`Expired ${Math.abs(d)} day(s) ago. Renewal/replacement follow-up required.`});
      else if (d !== null && d <= 30) alerts.push({level:d <= 7 ? 'danger':'warning',title:`Maturity alert • ${f.fdr_number}`,text:`Expires in ${d} day(s). Start renewal/replacement workflow.`});
      if (!f.document_url) alerts.push({level:'warning',title:`Missing certificate • ${f.fdr_number}`,text:'A supporting FDR document is not attached.'});
      if (duplicate.has(f.id)) alerts.push({level:'warning',title:`Duplicate FDR number • ${f.fdr_number}`,text:'The same FDR number appears in more than one record.'});
      discrepancies(f).forEach(issue => { if (!['Supporting certificate missing'].includes(issue)) alerts.push({level:'warning',title:`Data check • ${f.fdr_number}`,text:issue}); });
    });
    const unique = alerts.slice(0,12);
    $('lifecycleAlerts').innerHTML = unique.length ? unique.map(a=>`<div class="life-alert"><div><strong>${esc(a.title)}</strong><small>${esc(a.text)}</small></div><span class="life-badge ${a.level}">${a.level==='danger'?'ACTION REQUIRED':'ATTENTION'}</span></div>`).join('') : '<div class="life-note">No maturity, document or discrepancy alerts detected.</div>';
  }

  function actionSummary(fdr) {
    const item = cases()[fdr.id] || {};
    const bits = [];
    if (item.renewal) bits.push(`Renewal: ${item.renewal.status}`);
    if (item.replacement) bits.push(`Replacement: ${item.replacement.status}`);
    if (item.release) bits.push(`Release: ${item.release.status}`);
    return bits.length ? bits.join(' • ') : 'No lifecycle action';
  }

  function render() {
    const rows = $('lifecycleRows');
    if (!rows) return;
    const q = ($('lifeSearch')?.value || '').trim().toLowerCase();
    const filter = $('lifeFilter')?.value || 'ALL';
    const duplicate = duplicateIds(fdrs);
    const visible = fdrs.filter(f => {
      const text = `${f.fdr_number} ${f.bank_name}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      const d = daysTo(f.expiry_date);
      if (filter==='EXPIRING' && !(d !== null && d >= 0 && d <= DAYS_WARNING)) return false;
      if (filter==='EXPIRED' && !(d !== null && d < 0)) return false;
      if (filter==='MISSING' && f.document_url) return false;
      if (filter==='DUPLICATE' && !duplicate.has(f.id)) return false;
      return true;
    });
    rows.innerHTML = visible.length ? visible.map(f => {
      const r = risk(f), issues = discrepancies(f), d = daysTo(f.expiry_date);
      const item = cases()[f.id] || {};
      const actions = `<div class="life-actions"><button class="life-btn" data-life="renewal" data-id="${f.id}">Renewal</button><button class="life-btn" data-life="replacement" data-id="${f.id}">Replacement</button>${f.status==='VERIFIED' ? `<button class="life-btn danger" data-life="release" data-id="${f.id}">Release / Refund</button>` : ''}</div>`;
      return `<tr><td><strong>${esc(f.fdr_number)}</strong><br><small>${esc(f.institution_name || '')}</small></td><td>${esc(f.bank_name)}</td><td>${esc(String(f.expiry_date).slice(0,10))}<br><small>${d === null ? 'Unknown' : d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}</small></td><td><span class="life-badge ${r.cls}">${r.label}</span></td><td>${issues.length ? `<span class="life-badge warning">${issues.length} issue(s)</span><br><small>${esc(issues.slice(0,2).join(', '))}</small>` : '<span class="life-badge success">Clear</span>'}</td><td>${actions}<small class="life-muted">${esc(actionSummary(f))}</small></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="life-muted">No matching FDR records.</td></tr>';
    rows.querySelectorAll('[data-life]').forEach(btn => btn.addEventListener('click', () => {
      const fdr = fdrs.find(x => String(x.id) === String(btn.dataset.id));
      if (fdr) openModal(btn.dataset.life, fdr);
    }));
    renderStats(); renderAlerts();
  }

  function exportReport() {
    const header = ['FDR','Bank','Amount','Issue Date','Expiry Date','Status','Risk','Document','Discrepancies','Lifecycle Action'];
    const body = fdrs.map(f => [f.fdr_number,f.bank_name,f.amount,f.issue_date,f.expiry_date,f.status,risk(f).label,f.document_url?'Available':'Missing',discrepancies(f).join('; '),actionSummary(f)]);
    const csv = [header,...body].map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`SecureFDR-lifecycle-report-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  async function refresh() {
    if (!token()) return;
    try {
      const response = await fetch('/api/fdr', { headers:{Authorization:`Bearer ${token()}`} });
      if (!response.ok) return;
      const data = await response.json();
      fdrs = data.fdrs || [];
      ensurePanel(); render();
    } catch (error) { console.warn('Lifecycle intelligence unavailable:', error); }
  }

  function start() {
    injectStyles();
    refresh();
    setInterval(refresh, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
