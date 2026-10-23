(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const token = () => localStorage.getItem('securefdr_token');
  const REQUEST_KEY = 'securefdr_sih_requests_v2';
  let records = [];

  const readRequests = () => { try { return JSON.parse(localStorage.getItem(REQUEST_KEY) || '[]'); } catch { return []; } };
  const saveRequests = value => localStorage.setItem(REQUEST_KEY, JSON.stringify(value));
  const daysLeft = date => {
    const d = new Date(`${String(date || '').slice(0,10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.ceil((d - today) / 86400000);
  };
  const duplicateIds = list => {
    const counts = {};
    list.forEach(f => { const k = String(f.fdr_number || '').trim().toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; });
    return new Set(list.filter(f => { const k = String(f.fdr_number || '').trim().toLowerCase(); return k && counts[k] > 1; }).map(f => f.id));
  };
  const issues = f => {
    const out = [];
    if (!f.document_url) out.push('Missing supporting document');
    if (!f.fdr_number) out.push('Missing FDR number');
    if (!f.bank_name) out.push('Missing issuing bank');
    if (!(Number(f.amount) > 0)) out.push('Invalid amount');
    if (f.issue_date && f.expiry_date && new Date(f.expiry_date) <= new Date(f.issue_date)) out.push('Invalid validity period');
    if (f.status === 'REJECTED') out.push(`Rejected: ${f.verification_note || 'officer review required'}`);
    return out;
  };

  function styles() {
    if ($('sihFeatureStyles')) return;
    const s = document.createElement('style'); s.id = 'sihFeatureStyles';
    s.textContent = `
      .sih-panel{margin-top:16px}.sih-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.sih-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#66809e;font-weight:800}.sih-tools{display:flex;gap:8px;flex-wrap:wrap}.sih-btn{border:1px solid #cbd7e6;background:#fff;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}.sih-btn.primary{background:#174681;color:#fff;border-color:#174681}.sih-btn.danger{color:#b42318}.sih-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}.sih-card{border:1px solid #dfe7f1;border-radius:14px;padding:14px;background:#fff}.sih-card span{display:block;color:#64748b;font-size:12px}.sih-card strong{display:block;font-size:23px;color:#102a52;margin-top:4px}.sih-alerts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.sih-alert{border:1px solid #e5ebf3;border-radius:11px;padding:11px 12px;background:#fbfcfe}.sih-alert.warning{border-color:#f1dfac;background:#fffaf0}.sih-alert.danger{border-color:#f0c4c4;background:#fff6f6}.sih-alert strong{display:block}.sih-alert small{display:block;color:#68788f;margin-top:3px}.sih-evidence{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.sih-chip{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#eef3f8;color:#53677d}.sih-chip.good{background:#e8f7ef;color:#087443}.sih-chip.warn{background:#fff5d9;color:#9a6700}.sih-table{width:100%;border-collapse:collapse;margin-top:15px}.sih-table th,.sih-table td{padding:9px 8px;border-bottom:1px solid #edf1f5;text-align:left;font-size:12px}.sih-table th{font-size:10px;text-transform:uppercase;color:#62748b}.sih-modal{position:fixed;inset:0;background:rgba(15,35,60,.48);display:flex;align-items:center;justify-content:center;z-index:1600;padding:20px}.sih-modal.hidden{display:none}.sih-modal-card{width:min(620px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.22)}.sih-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sih-form label{font-size:13px;font-weight:700;color:#243b5a}.sih-form input,.sih-form select,.sih-form textarea{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd7e6;border-radius:9px;padding:9px;background:#fff}.sih-form textarea{min-height:95px}.sih-full{grid-column:1/-1}.sih-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.sih-message{min-height:18px;font-size:13px}@media(max-width:900px){.sih-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sih-alerts{grid-template-columns:1fr}}@media(max-width:650px){.sih-grid{grid-template-columns:1fr}.sih-form{grid-template-columns:1fr}.sih-full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function build() {
    if ($('sihFeaturePanel') || !$('stats')) return;
    const p = document.createElement('section'); p.id='sihFeaturePanel'; p.className='card panel sih-panel';
    p.innerHTML = `<div class="sih-head"><div><div class="sih-kicker">SIH problem statement coverage</div><h3>FDR lifecycle & compliance command center</h3><p>Centralized monitoring for verification, discrepancies, maturity, renewal/replacement and release/refund workflows.</p></div><div class="sih-tools"><button id="sihRefresh" class="sih-btn primary">Run compliance scan</button><button id="sihExport" class="sih-btn">Export report</button></div></div><div id="sihCards" class="sih-grid"></div><div id="sihAlerts" class="sih-alerts"></div><div class="table-wrap"><table class="sih-table"><thead><tr><th>FDR</th><th>Evidence state</th><th>Discrepancy</th><th>Lifecycle</th><th>Action</th></tr></thead><tbody id="sihRows"></tbody></table></div>`;
    $('stats').insertAdjacentElement('afterend', p);
    document.body.insertAdjacentHTML('beforeend', `<div id="sihModal" class="sih-modal hidden"><div class="sih-modal-card"><div class="panel-head"><div><div class="sih-kicker">Controlled lifecycle workflow</div><h3 id="sihModalTitle">Create request</h3><p id="sihModalSummary"></p></div><button id="sihClose" class="icon-btn">×</button></div><form id="sihForm" class="sih-form"></form></div></div>`);
    $('sihRefresh').onclick = load;
    $('sihExport').onclick = exportReport;
    $('sihClose').onclick = closeModal;
    $('sihModal').onclick = e => { if (e.target === $('sihModal')) closeModal(); };
  }

  function openRequest(fdr, type) {
    const labels = {RENEWAL:'Renewal request', REPLACEMENT:'Replacement request', RELEASE:'Release request', REFUND:'Refund request'};
    $('sihModalTitle').textContent = labels[type];
    $('sihModalSummary').textContent = `${fdr.fdr_number} • ${fdr.bank_name} • ₹${Number(fdr.amount).toLocaleString('en-IN')}`;
    const release = type === 'RELEASE' || type === 'REFUND';
    $('sihForm').innerHTML = `<label>Request type<select id="sihType"><option value="${type}">${labels[type]}</option></select></label><label>Reference number<input id="sihRef" placeholder="Approval / bank reference"></label>${release ? `<label>Amount (₹)<input id="sihAmount" type="number" min="1" max="${Number(fdr.amount)}" value="${Number(fdr.amount)}"></label>` : `<label>Target date<input id="sihDate" type="date"></label>`}<label class="sih-full">Reason / observation<textarea id="sihReason" maxlength="1000" required placeholder="Enter justification, observation or prescribed follow-up."></textarea></label><p id="sihMessage" class="sih-message sih-full"></p><div class="sih-modal-actions sih-full"><button type="button" id="sihCancel" class="sih-btn">Cancel</button><button type="submit" class="sih-btn primary">Submit request</button></div>`;
    $('sihForm').onsubmit = e => { e.preventDefault(); const requests=readRequests(); requests.unshift({id:crypto.randomUUID(),fdrId:fdr.id,fdrNumber:fdr.fdr_number,type,amount:release?Number($('sihAmount').value):null,reference:$('sihRef').value.trim(),reason:$('sihReason').value.trim(),date:release?null:($('sihDate').value||null),status:'SUBMITTED',createdAt:new Date().toISOString()}); saveRequests(requests); closeModal(); render(); };
    $('sihCancel').onclick = closeModal;
    $('sihModal').classList.remove('hidden');
  }
  function closeModal(){ if($('sihModal')) $('sihModal').classList.add('hidden'); }

  function render() {
    if (!$('sihRows')) return;
    const dup = duplicateIds(records); const requests=readRequests();
    const active = records.filter(f => f.status !== 'EXPIRED').length;
    const verified = records.filter(f => f.status === 'VERIFIED').length;
    const pending = records.filter(f => ['SUBMITTED','UNDER_REVIEW'].includes(f.status)).length;
    const expired = records.filter(f => { const d=daysLeft(f.expiry_date); return f.status==='EXPIRED'||(d!==null&&d<0); }).length;
    const renewal90 = records.filter(f => { const d=daysLeft(f.expiry_date); return d!==null&&d>=0&&d<=90; }).length;
    const urgent = records.filter(f => { const d=daysLeft(f.expiry_date); return d!==null&&d>=0&&d<=30; }).length;
    const critical = records.filter(f => { const d=daysLeft(f.expiry_date); return d!==null&&d>=0&&d<=7; }).length;
    const missing = records.filter(f => !f.document_url).length;
    const discrepancies = records.filter(f => issues(f).length || dup.has(f.id)).length;
    $('sihCards').innerHTML = [['Active',active],['Verified',verified],['Pending review',pending],['Expired',expired],['Renewal ≤90d',renewal90],['Urgent ≤30d',urgent],['Critical ≤7d',critical],['Missing docs',missing]].map(([l,v])=>`<div class="sih-card"><span>${l}</span><strong>${v}</strong></div>`).join('');

    const alerts=[];
    records.forEach(f=>{const d=daysLeft(f.expiry_date); if(d!==null&&d>=0&&d<=7) alerts.push(`<div class="sih-alert danger"><strong>🔴 Critical maturity • ${esc(f.fdr_number)}</strong><small>Expires in ${d} day(s). Start renewal/replacement workflow now.</small></div>`); else if(d!==null&&d>=0&&d<=30) alerts.push(`<div class="sih-alert warning"><strong>🟠 Renewal warning • ${esc(f.fdr_number)}</strong><small>Expires in ${d} day(s). Prepare the prescribed renewal/replacement documents.</small></div>`); if(!f.document_url) alerts.push(`<div class="sih-alert warning"><strong>📄 Missing document • ${esc(f.fdr_number)}</strong><small>Supporting FDR certificate is not attached.</small></div>`); if(dup.has(f.id)) alerts.push(`<div class="sih-alert warning"><strong>⚠ Duplicate instrument • ${esc(f.fdr_number)}</strong><small>The same FDR number appears in more than one record.</small></div>`);});
    $('sihAlerts').innerHTML = alerts.length ? alerts.slice(0,8).join('') : `<div class="sih-alert"><strong>✓ No active compliance alerts</strong><small>Current records are within the configured prototype rules.</small></div>`;

    $('sihRows').innerHTML = records.length ? records.map(f=>{
      const iss=issues(f), dupText=dup.has(f.id)?'Duplicate FDR number':'';
      const req=requests.find(r=>String(r.fdrId)===String(f.id));
      const lifecycle=req ? `${req.type.replaceAll('_',' ')} • ${req.status}` : 'No active request';
      const evidence=f.status==='VERIFIED'?`<span class="sih-chip good">Officer verified</span>`:`<span class="sih-chip">Institution submitted</span>`;
      const discrepancy = iss.length || dupText ? `<span class="sih-chip warn">${esc(dupText || iss[0])}</span>` : `<span class="sih-chip good">Clear</span>`;
      const buttons = [];
      if(['INSTITUTION'].includes(window.secureFdrRole || '')) { buttons.push(`<button class="sih-btn" data-sih="RENEWAL" data-id="${f.id}">Renew</button>`,`<button class="sih-btn" data-sih="REPLACEMENT" data-id="${f.id}">Replace</button>`,`<button class="sih-btn danger" data-sih="RELEASE" data-id="${f.id}">Release/refund</button>`); }
      else { buttons.push(`<button class="sih-btn" data-sih="REVIEW" data-id="${f.id}">Review</button>`); }
      return `<tr><td><strong>${esc(f.fdr_number)}</strong><br><small>${esc(f.institution_name||'Institution')}</small></td><td>${evidence}</td><td>${discrepancy}</td><td>${esc(lifecycle)}</td><td><div class="sih-tools">${buttons.join('')}</div></td></tr>`;
    }).join('') : `<tr><td colspan="5">No FDR records available.</td></tr>`;
    $('sihRows').querySelectorAll('[data-sih]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=records.find(x=>String(x.id)===String(btn.dataset.id)); if(!f)return;
      const action=btn.dataset.sih;
      if(action==='REVIEW'){ document.querySelector(`[data-action="review"][data-id="${CSS.escape(String(f.id))}"]`)?.click(); return; }
      openRequest(f, action==='RELEASE' ? 'RELEASE' : action);
    }));
    window.secureFdrRecords = records; window.secureFdrSihDiscrepancies = discrepancies;
  }

  function exportReport(){
    const requests=readRequests(); const dup=duplicateIds(records); const header=['FDR','Institution','Bank','Amount','Issue date','Expiry','Status','Verification evidence','Discrepancy','Lifecycle request'];
    const lines=[header.join(',')];
    records.forEach(f=>{const req=requests.find(r=>String(r.fdrId)===String(f.id));const values=[f.fdr_number,f.institution_name,f.bank_name,f.amount,f.issue_date,f.expiry_date,f.status,f.status==='VERIFIED'?'Officer verified':'Institution submitted',dup.has(f.id)?'Duplicate FDR':'',req?`${req.type}:${req.status}`:''];lines.push(values.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));});
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='securefdr-sih-compliance-report.csv';a.click();URL.revokeObjectURL(url);
  }

  async function load(){
    const t=token(); if(!t)return;
    try{const response=await fetch('/api/fdr',{headers:{Authorization:`Bearer ${t}`}});if(!response.ok)return;const data=await response.json();records=data.fdrs||[];build();render();}catch(e){console.warn('SIH feature center unavailable',e);}
  }
  function start(){styles();load();setInterval(load,20000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
