(() => {
  const CASE_KEY = 'securefdr_compliance_cases_v1';
  let current = null;

  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const getCases = () => { try { return JSON.parse(localStorage.getItem(CASE_KEY) || '{}'); } catch { return {}; } };
  const saveCases = (v) => localStorage.setItem(CASE_KEY, JSON.stringify(v));
  const token = () => localStorage.getItem('securefdr_token');

  function addStyles() {
    if (document.getElementById('discrepancyReviewStyles')) return;
    const s = document.createElement('style');
    s.id = 'discrepancyReviewStyles';
    s.textContent = `
      .drm-modal{position:fixed;inset:0;background:rgba(15,35,60,.48);display:flex;align-items:center;justify-content:center;z-index:1400;padding:20px}
      .drm-modal.hidden{display:none}.drm-card{width:min(760px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.22)}
      .drm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.drm-close{border:0;background:#eef2f6;border-radius:50%;width:34px;height:34px;font-size:22px;cursor:pointer}
      .drm-banner{margin:18px 0;padding:14px;border:1px solid #f0c7c7;background:#fff7f7;border-radius:12px}.drm-banner strong{display:block;font-size:18px;color:#9f2018;margin-bottom:5px}.drm-banner span{color:#63748b;font-size:13px}
      .drm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.drm-field{border:1px solid #e2e8f0;border-radius:10px;padding:11px}.drm-field span{display:block;font-size:11px;color:#718096;text-transform:uppercase}.drm-field strong{display:block;margin-top:4px;color:#17365d}
      .drm-section{border-top:1px solid #e8edf3;padding-top:16px;margin-top:16px}.drm-section h4{margin:0 0 8px}.drm-list{margin:0;padding-left:20px}.drm-note{width:100%;box-sizing:border-box;border:1px solid #cbd7e6;border-radius:9px;padding:10px;resize:vertical}
      .drm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.drm-btn{border:1px solid #cbd7e6;background:#fff;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer}.drm-btn.primary{background:#174681;color:#fff;border-color:#174681}.drm-btn.warning{background:#fff5d9;color:#8a5a00;border-color:#efd58a}.drm-btn.danger{color:#a5201a;border-color:#e3b2b0}.drm-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700;background:#eef2f6;color:#52657d}.drm-status.open{background:#fff5d9;color:#8a5a00}.drm-status.resolved{background:#e8f7ef;color:#087443}.drm-status.correction{background:#eaf2ff;color:#174681}.drm-status.escalated{background:#fdecec;color:#b42318}
      @media(max-width:650px){.drm-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    if (document.getElementById('drmModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="drmModal" class="drm-modal hidden" role="dialog" aria-modal="true" aria-labelledby="drmTitle">
        <div class="drm-card">
          <div class="drm-head"><div><p class="eyebrow">Discrepancy review</p><h3 id="drmTitle">Review compliance case</h3></div><button id="drmClose" class="drm-close" aria-label="Close">×</button></div>
          <div id="drmBody"></div>
          <div class="drm-actions"><button id="drmCancel" class="drm-btn">Close</button><button id="drmCorrection" class="drm-btn warning">Request correction</button><button id="drmEscalate" class="drm-btn danger">Escalate</button><button id="drmResolve" class="drm-btn primary">Resolve</button></div>
        </div>
      </div>`);
    document.getElementById('drmClose').onclick = close;
    document.getElementById('drmCancel').onclick = close;
    document.getElementById('drmCorrection').onclick = () => save('CORRECTION_REQUESTED');
    document.getElementById('drmEscalate').onclick = () => save('ESCALATED');
    document.getElementById('drmResolve').onclick = () => save('RESOLVED');
  }

  function open(record) {
    ensureModal();
    current = record;
    const all = getCases();
    const c = all[record.id] || {};
    const issues = [];
    if (!record.fdr_number) issues.push('Missing FDR number');
    if (!record.bank_name) issues.push('Missing issuing bank');
    if (!(Number(record.amount) > 0)) issues.push('Invalid amount');
    if (!record.issue_date || !record.expiry_date) issues.push('Missing validity dates');
    if (record.issue_date && record.expiry_date && new Date(record.expiry_date) <= new Date(record.issue_date)) issues.push('Expiry date is not after issue date');
    if (!record.document_url) issues.push('Supporting certificate missing');
    if (record.status === 'VERIFIED' && !record.verified_by) issues.push('Verified without officer identity');
    const duplicate = document.querySelector(`[data-id="${CSS.escape(String(record.id))}"]`)?.closest('tr')?.textContent?.includes('Duplicate FDR number');
    if (duplicate) issues.push('Duplicate FDR number');
    const state = c.discrepancy || {};
    document.getElementById('drmBody').innerHTML = `
      <div class="drm-banner"><strong>${esc(issues[0] || 'Discrepancy requiring scrutiny')}</strong><span>${issues.length} issue(s) identified for this record.</span></div>
      <div class="drm-grid">
        <div class="drm-field"><span>FDR number</span><strong>${esc(record.fdr_number || '—')}</strong></div>
        <div class="drm-field"><span>Institution</span><strong>${esc(record.institution_name || '—')}</strong></div>
        <div class="drm-field"><span>Issuing bank</span><strong>${esc(record.bank_name || '—')}</strong></div>
        <div class="drm-field"><span>Amount</span><strong>₹${Number(record.amount || 0).toLocaleString('en-IN')}</strong></div>
        <div class="drm-field"><span>Issue date</span><strong>${esc(record.issue_date || '—')}</strong></div>
        <div class="drm-field"><span>Expiry date</span><strong>${esc(record.expiry_date || '—')}</strong></div>
        <div class="drm-field"><span>Current status</span><strong>${esc(record.status || '—')}</strong></div>
        <div class="drm-field"><span>Case status</span><strong><span class="drm-status ${String(state.status || 'OPEN').toLowerCase().replace('_','-')}">${esc(state.status || 'OPEN')}</span></strong></div>
      </div>
      <div class="drm-section"><h4>Issues identified</h4><ul class="drm-list">${(issues.length ? issues : ['No automated issue found; officer review requested.']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="drm-section"><h4>Supporting evidence</h4><p>${record.document_url ? `<a href="${esc(record.document_url)}" target="_blank" rel="noopener">View submitted certificate</a>` : 'No supporting certificate is attached.'}</p></div>
      <div class="drm-section"><h4>Officer observation</h4><textarea id="drmNote" class="drm-note" rows="4" maxlength="1000" placeholder="Record what was checked, the discrepancy finding, or the correction required.">${esc(state.note || '')}</textarea></div>
    `;
    document.getElementById('drmModal').classList.remove('hidden');
  }

  function close(){ current = null; document.getElementById('drmModal')?.classList.add('hidden'); }

  function save(status){
    if(!current) return;
    const all = getCases();
    all[current.id] = all[current.id] || {};
    all[current.id].discrepancy = { status, note: document.getElementById('drmNote')?.value.trim() || '', at: new Date().toISOString(), actor: 'Authorized Officer' };
    saveCases(all);
    close();
    document.getElementById('compRefresh')?.click();
  }

  function intercept(e){
    const btn = e.target.closest?.('[data-act="OBSERVE"]');
    if(!btn) return;
    const row = btn.closest('tr');
    if(!row) return;
    const fdr = row.querySelector('strong')?.textContent?.trim();
    if(!fdr) return;
    const records = window.__secureFdrComplianceRecords || [];
    const record = records.find(x => String(x.fdr_number) === fdr);
    if(!record) return;
    e.preventDefault(); e.stopImmediatePropagation();
    open(record);
  }

  function exposeRecords(){
    const originalFetch = window.fetch;
    if(window.__secureFdrFetchWrapped) return;
    window.__secureFdrFetchWrapped = true;
    window.fetch = async (...args) => { const response = await originalFetch(...args); try { const url = String(args[0]?.url || args[0] || ''); if(url.includes('/api/fdr')) { const clone = response.clone(); clone.json().then(data => { window.__secureFdrComplianceRecords = data.fdrs || []; }).catch(()=>{}); } } catch {} return response; };
  }

  function start(){ addStyles(); ensureModal(); exposeRecords(); document.addEventListener('click', intercept, true); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
