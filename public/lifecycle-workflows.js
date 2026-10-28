(() => {
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem('securefdr_token');
  let selected = null;
  let mode = null;

  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  function styles() {
    if ($('lifecycleWorkflowStyles')) return;
    const s = document.createElement('style');
    s.id = 'lifecycleWorkflowStyles';
    s.textContent = `
      .lw-modal{position:fixed;inset:0;background:rgba(15,35,60,.48);display:flex;align-items:center;justify-content:center;z-index:1500;padding:20px}.lw-modal.hidden{display:none}.lw-card{width:min(680px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.22)}.lw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.lw-grid label{display:block;font-size:13px;font-weight:600;color:#243b5a}.lw-grid input,.lw-grid select,.lw-grid textarea{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd7e6;border-radius:9px;padding:10px;background:#fff}.lw-grid textarea{min-height:90px;resize:vertical}.lw-full{grid-column:1/-1}.lw-help{padding:10px 12px;background:#f5f8fc;border-radius:10px;color:#52657d;font-size:13px;margin:12px 0}.lw-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.lw-btn{border:1px solid #cbd7e6;background:#fff;border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer}.lw-btn.primary{background:#174681;color:#fff;border-color:#174681}.lw-btn.danger{color:#b42318}.lw-message{min-height:20px;font-size:13px}.lw-history{margin-top:18px;border-top:1px solid #edf1f5;padding-top:14px}.lw-history table{width:100%;border-collapse:collapse}.lw-history th,.lw-history td{padding:8px;border-bottom:1px solid #edf1f5;text-align:left;font-size:12px}.lw-history th{color:#62748b;text-transform:uppercase;font-size:10px}@media(max-width:700px){.lw-grid{grid-template-columns:1fr}.lw-full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    if ($('lifecycleWorkflowModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="lifecycleWorkflowModal" class="lw-modal hidden" role="dialog" aria-modal="true">
        <div class="lw-card">
          <div class="panel-head"><div><p class="eyebrow">FDR lifecycle</p><h3 id="lwTitle">Lifecycle action</h3><p id="lwSubtitle">Submit a controlled lifecycle request.</p></div><button id="lwClose" class="icon-btn" aria-label="Close">×</button></div>
          <div id="lwSummary" class="lw-help"></div>
          <form id="lwForm" class="form lw-grid"></form>
          <div id="lwHistory" class="lw-history"></div>
        </div>
      </div>
    `);
    $('lwClose').addEventListener('click', close);
    $('lifecycleWorkflowModal').addEventListener('click', e => { if (e.target === $('lifecycleWorkflowModal')) close(); });
  }

  function setForm(html) { $('lwForm').innerHTML = html; $('lwForm').onsubmit = submit; }

  function openReplacement(fdr) {
    selected = fdr; mode = 'replacement'; ensureModal();
    $('lwTitle').textContent = 'Submit replacement FDR';
    $('lwSubtitle').textContent = 'Create the new instrument and link it to the previous FDR for complete lifecycle history.';
    $('lwSummary').innerHTML = `<strong>Replacing:</strong> ${esc(fdr.fdr_number)} • ${esc(fdr.bank_name)} • ₹${Number(fdr.amount).toLocaleString('en-IN')} • expires ${esc(String(fdr.expiry_date).slice(0,10))}`;
    setForm(`
      <label>New FDR number<input id="lwNumber" required placeholder="FDR-2027-0002"></label>
      <label>Bank name<input id="lwBank" required></label>
      <label>Amount (₹)<input id="lwAmount" type="number" min="1" step="0.01" required></label>
      <label>Issue date<input id="lwIssue" type="date" required></label>
      <label>New expiry date<input id="lwExpiry" type="date" required></label>
      <label>Document name<input id="lwDocName" placeholder="Replacement_FDR.pdf"></label>
      <label class="upload-field lw-full">Upload replacement FDR certificate<input id="lwFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required><small>PDF, JPG or PNG • maximum 600 KB</small></label>
      <div id="lwMessage" class="lw-message lw-full"></div>
      <div class="lw-actions lw-full"><button type="button" id="lwCancel" class="lw-btn">Cancel</button><button type="submit" id="lwSubmit" class="lw-btn primary">Submit replacement</button></div>
    `);
    $('lwBank').value = fdr.bank_name || '';
    $('lwAmount').value = fdr.amount || '';
    $('lwIssue').value = new Date().toISOString().slice(0,10);
    $('lwCancel').onclick = close;
    $('lifecycleWorkflowModal').classList.remove('hidden');
  }

  function openRelease(fdr) {
    selected = fdr; mode = 'release'; ensureModal();
    $('lwTitle').textContent = 'Request release / refund';
    $('lwSubtitle').textContent = 'Submit a controlled request for competent-authority processing and audit tracking.';
    $('lwSummary').innerHTML = `<strong>Request for:</strong> ${esc(fdr.fdr_number)} • ${esc(fdr.bank_name)} • ₹${Number(fdr.amount).toLocaleString('en-IN')}`;
    setForm(`
      <label>Request type<select id="lwType"><option value="RELEASE">Release of security deposit</option><option value="REFUND">Refund of security deposit</option></select></label>
      <label>Requested amount (₹)<input id="lwAmount" type="number" min="1" step="0.01" max="${Number(fdr.amount)}" value="${Number(fdr.amount)}" required></label>
      <label class="lw-full">Reason / justification<textarea id="lwReason" maxlength="1000" required placeholder="Enter the reason for release/refund and relevant case details."></textarea></label>
      <label>Authorization / reference no.<input id="lwReference" maxlength="120" placeholder="Approval/reference number"></label>
      <label>Preferred processing date<input id="lwDate" type="date"></label>
      <div id="lwMessage" class="lw-message lw-full"></div>
      <div class="lw-actions lw-full"><button type="button" id="lwCancel" class="lw-btn">Cancel</button><button type="submit" id="lwSubmit" class="lw-btn danger">Submit request</button></div>
    `);
    loadReleaseHistory();
    $('lwCancel').onclick = close;
    $('lifecycleWorkflowModal').classList.remove('hidden');
  }

  async function loadReleaseHistory() {
    if (!selected) return;
    try {
      const response = await fetch('/api/lifecycle-requests', {headers:{Authorization:`Bearer ${token()}`}});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load request history');
      const list = (data.requests || []).filter(x => String(x.fdr_id) === String(selected.id)).slice(0,8);
      $('lwHistory').innerHTML = list.length ? `<strong>Request history</strong><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${list.map(x => `<tr><td>${esc(x.request_type)}</td><td>₹${Number(x.requested_amount).toLocaleString('en-IN')}</td><td>${esc(x.status)}</td><td>${esc(new Date(x.created_at).toLocaleString('en-IN'))}</td></tr>`).join('')}</tbody></table>` : '<div class="lw-help">No release/refund requests recorded for this FDR.</div>';
    } catch (e) {
      $('lwHistory').innerHTML = `<div class="lw-help">Request history unavailable: ${esc(e.message)}</div>`;
    }
  }

  function close() { selected = null; mode = null; if ($('lifecycleWorkflowModal')) $('lifecycleWorkflowModal').classList.add('hidden'); }
  function message(text, ok=false) { const el=$('lwMessage'); if(el){el.textContent=text;el.style.color=ok?'#177245':'#b23b3b';} }

  async function submit(event) {
    event.preventDefault();
    if (!selected || !mode) return;
    if (mode === 'release') return submitRelease();
    const file = $('lwFile').files?.[0];
    const issueDate = $('lwIssue').value;
    const expiryDate = $('lwExpiry').value;
    const newNumber = $('lwNumber').value.trim();
    if (!file) return message('Please attach the replacement FDR certificate.');
    if (!newNumber) return message('Enter the new FDR number.');
    if (new Date(expiryDate) <= new Date(issueDate)) return message('New expiry date must be after the issue date.');
    if (file.size > 600 * 1024) return message('The document must be 600 KB or smaller.');
    if (!['application/pdf','image/jpeg','image/png'].includes(file.type)) return message('Please select a PDF, JPG or PNG file.');
    const button = $('lwSubmit'); button.disabled = true; message('Uploading replacement certificate…', true);
    try {
      const documentUrl = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Unable to read the selected document.'));r.readAsDataURL(file);});
      const response = await fetch('/api/fdr', {method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({fdrNumber:newNumber,bankName:$('lwBank').value.trim(),amount:Number($('lwAmount').value),issueDate,expiryDate,documentName:$('lwDocName').value.trim()||file.name,documentUrl})});
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || 'Replacement submission failed');
      const linkResponse = await fetch(`/api/fdr/${selected.id}/lifecycle`, {method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'REPLACEMENT',newFdrId:data.fdr.id,note:'Replacement instrument submitted through SecureFDR lifecycle workflow.'})});
      const linkData = await linkResponse.json().catch(()=>({}));
      if (!linkResponse.ok) throw new Error(linkData.error || 'Replacement was submitted but could not be linked to the previous FDR.');
      message('Replacement submitted and linked to the original FDR.', true);
      setTimeout(close, 1000);
      document.dispatchEvent(new CustomEvent('securefdr:replacement-submitted'));
    } catch(e) { message(e.message || 'Replacement submission failed.'); }
    finally { button.disabled = false; }
  }

  async function submitRelease() {
    const amount = Number($('lwAmount').value);
    const reason = $('lwReason').value.trim();
    if (!(amount > 0) || amount > Number(selected.amount)) return message('Enter a valid amount not greater than the FDR amount.');
    if (!reason) return message('Reason / justification is required.');
    const button=$('lwSubmit'); button.disabled=true; message('Submitting request…',true);
    try {
      const response=await fetch(`/api/fdr/${selected.id}/release-request`,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({requestType:$('lwType').value,amount,reason,referenceNumber:$('lwReference').value.trim(),preferredDate:$('lwDate').value||null})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Release/refund request failed');
      message('Request submitted and recorded in the lifecycle audit trail.',true);
      await loadReleaseHistory();
      setTimeout(close,1100);
      document.dispatchEvent(new CustomEvent('securefdr:release-requested'));
    } catch(e){message(e.message||'Release/refund request failed.');}
    finally{button.disabled=false;}
  }

  async function getFdr(id) {
    const response = await fetch('/api/fdr', {headers:{Authorization:`Bearer ${token()}`}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load FDR');
    return (data.fdrs || []).find(x => String(x.id) === String(id));
  }

  function bind() {
    styles();
    document.addEventListener('click', async event => {
      const button = event.target.closest('[data-act="REPLACEMENT"],[data-act="RELEASE"]');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const fdr = await getFdr(button.dataset.id);
        if (!fdr) return alert('FDR record could not be loaded.');
        if (button.dataset.act === 'REPLACEMENT') openReplacement(fdr);
        else openRelease(fdr);
      } catch(e) { alert(e.message || 'Unable to load FDR.'); }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
