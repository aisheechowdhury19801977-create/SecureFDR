(() => {
  const KEY = 'securefdr_renewal_requests_v1';
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem('securefdr_token');
  let selected = null;

  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  function getRequests() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }
  function saveRequests(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

  function addStyles() {
    if ($('renewalWorkflowStyles')) return;
    const s = document.createElement('style');
    s.id = 'renewalWorkflowStyles';
    s.textContent = `
      .renewal-modal{position:fixed;inset:0;background:rgba(15,35,60,.48);display:flex;align-items:center;justify-content:center;z-index:1400;padding:20px}.renewal-modal.hidden{display:none}.renewal-card{width:min(680px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.22)}.renewal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.renewal-grid label{display:block;font-size:13px;font-weight:600;color:#243b5a}.renewal-grid input{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd7e6;border-radius:9px;padding:10px;background:#fff}.renewal-grid .full{grid-column:1/-1}.renewal-help{padding:10px 12px;background:#f5f8fc;border-radius:10px;color:#52657d;font-size:13px;margin:12px 0}.renewal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.renewal-btn{border:1px solid #cbd7e6;background:#fff;border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer}.renewal-btn.primary{background:#174681;color:#fff;border-color:#174681}.renewal-message{min-height:20px;font-size:13px}.renewal-history{margin-top:18px;border-top:1px solid #edf1f5;padding-top:14px}.renewal-history table{width:100%;border-collapse:collapse}.renewal-history th,.renewal-history td{padding:8px;border-bottom:1px solid #edf1f5;text-align:left;font-size:12px}.renewal-history th{color:#62748b;text-transform:uppercase;font-size:10px}@media(max-width:700px){.renewal-grid{grid-template-columns:1fr}.renewal-grid .full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    if ($('renewalModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="renewalModal" class="renewal-modal hidden" role="dialog" aria-modal="true">
        <div class="renewal-card">
          <div class="panel-head"><div><p class="eyebrow">FDR lifecycle</p><h3>Submit renewed FDR</h3><p>Submit the replacement instrument while keeping the original FDR record for audit history.</p></div><button id="renewalClose" class="icon-btn" aria-label="Close">×</button></div>
          <div id="renewalSummary" class="renewal-help"></div>
          <form id="renewalForm" class="form renewal-grid">
            <label>New FDR number<input id="renewalFdrNumber" required placeholder="FDR-2027-0001"></label>
            <label>Bank name<input id="renewalBank" required placeholder="Bank / financial institution"></label>
            <label>Amount (₹)<input id="renewalAmount" type="number" min="1" step="0.01" required></label>
            <label>Issue date<input id="renewalIssueDate" type="date" required></label>
            <label>New expiry date<input id="renewalExpiryDate" type="date" required></label>
            <label>Document name<input id="renewalDocumentName" placeholder="Renewed_FDR.pdf"></label>
            <label class="upload-field full">Upload renewed FDR certificate<input id="renewalFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required><small>PDF, JPG or PNG • maximum 600 KB</small></label>
            <div class="full renewal-message" id="renewalMessage"></div>
            <div class="full renewal-actions"><button type="button" id="renewalCancel" class="renewal-btn">Cancel</button><button type="submit" id="renewalSubmit" class="renewal-btn primary">Submit renewal</button></div>
          </form>
          <div class="renewal-history"><strong>Recent renewal requests</strong><div id="renewalHistory"></div></div>
        </div>
      </div>
    `);
    $('renewalClose').addEventListener('click', close);
    $('renewalCancel').addEventListener('click', close);
    $('renewalForm').addEventListener('submit', submit);
    $('renewalModal').addEventListener('click', e => { if (e.target === $('renewalModal')) close(); });
  }

  function open(fdr) {
    if (!token()) return;
    selected = fdr;
    ensureModal();
    $('renewalSummary').innerHTML = `<strong>Renewing:</strong> ${esc(fdr.fdr_number)} • ${esc(fdr.bank_name)} • ₹${Number(fdr.amount).toLocaleString('en-IN')} • expires ${esc(String(fdr.expiry_date).slice(0,10))}`;
    $('renewalFdrNumber').value = '';
    $('renewalBank').value = fdr.bank_name || '';
    $('renewalAmount').value = fdr.amount || '';
    $('renewalIssueDate').value = new Date().toISOString().slice(0,10);
    $('renewalExpiryDate').value = '';
    $('renewalDocumentName').value = '';
    $('renewalFile').value = '';
    $('renewalMessage').textContent = '';
    renderHistory();
    $('renewalModal').classList.remove('hidden');
  }

  function close() { selected = null; if ($('renewalModal')) $('renewalModal').classList.add('hidden'); }

  function renderHistory() {
    const all = Object.values(getRequests()).slice(-8).reverse();
    $('renewalHistory').innerHTML = all.length ? `<table><thead><tr><th>Original FDR</th><th>New FDR</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${all.map(r => `<tr><td>${esc(r.originalFdr)}</td><td>${esc(r.newFdr)}</td><td>${esc(r.status)}</td><td>${esc(new Date(r.at).toLocaleString('en-IN'))}</td></tr>`).join('')}</tbody></table>` : '<div class="renewal-help">No renewal requests recorded yet.</div>';
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected) return;
    const file = $('renewalFile').files?.[0];
    const issueDate = $('renewalIssueDate').value;
    const expiryDate = $('renewalExpiryDate').value;
    const newNumber = $('renewalFdrNumber').value.trim();
    if (!file) return setMessage('Please attach the renewed FDR certificate.');
    if (new Date(expiryDate) <= new Date(issueDate)) return setMessage('New expiry date must be after the issue date.');
    if (file.size > 600 * 1024) return setMessage('The document must be 600 KB or smaller.');
    if (!['application/pdf','image/jpeg','image/png'].includes(file.type)) return setMessage('Please select a PDF, JPG or PNG file.');

    const button = $('renewalSubmit');
    button.disabled = true;
    setMessage('Uploading renewed certificate…', true);
    try {
      const documentUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read the selected document.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/fdr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdrNumber: newNumber,
          bankName: $('renewalBank').value.trim(),
          amount: Number($('renewalAmount').value),
          issueDate,
          expiryDate,
          documentName: $('renewalDocumentName').value.trim() || file.name,
          documentUrl
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Renewal submission failed');

      const all = getRequests();
      const id = `${selected.id}-${Date.now()}`;
      all[id] = { id, originalFdrId:selected.id, originalFdr:selected.fdr_number, newFdr:data.fdr?.fdr_number || newNumber, newFdrId:data.fdr?.id || null, status:'SUBMITTED_FOR_VERIFICATION', at:new Date().toISOString() };
      saveRequests(all);
      setMessage('Renewal submitted successfully. The new FDR is now in the officer verification queue.', true);
      renderHistory();
      setTimeout(close, 900);
      document.dispatchEvent(new CustomEvent('securefdr:renewal-submitted'));
    } catch (error) {
      setMessage(error.message || 'Renewal submission failed.');
    } finally { button.disabled = false; }
  }

  function setMessage(text, ok=false) { const el=$('renewalMessage'); if(el){el.textContent=text;el.style.color=ok?'#177245':'#b23b3b';} }

  async function init() {
    addStyles();
    document.addEventListener('click', async event => {
      const button = event.target.closest('[data-act="RENEWAL"]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const response = await fetch('/api/fdr', { headers: { Authorization: `Bearer ${token()}` } });
        const data = await response.json();
        const fdr = (data.fdrs || []).find(x => String(x.id) === String(button.dataset.id));
        if (fdr) open(fdr); else alert('FDR record could not be loaded.');
      } catch (error) { alert(error.message || 'Unable to load FDR.'); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();