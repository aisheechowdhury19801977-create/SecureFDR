(() => {
  const token = () => localStorage.getItem('securefdr_token');
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let records = [];

  function isInstitution() {
    return /•\s*INSTITUTION\b/i.test(document.getElementById('userBadge')?.textContent || '');
  }

  function styles() {
    if (document.getElementById('institutionDashboardStyles')) return;
    const s = document.createElement('style');
    s.id = 'institutionDashboardStyles';
    s.textContent = `
      .institution-home{margin-bottom:20px}.institution-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.institution-hero h3{margin:3px 0 6px;font-size:24px;color:#102a52}.institution-hero p{margin:0;color:#63758d;max-width:700px}.institution-actions{display:flex;gap:8px;flex-wrap:wrap}.inst-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.inst-stat{border:1px solid #dfe7f1;border-radius:14px;padding:15px;background:#fff}.inst-stat span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7b90}.inst-stat strong{display:block;font-size:25px;color:#102a52;margin-top:5px}.inst-alerts{display:grid;gap:9px;margin-top:16px}.inst-alert{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid #e4eaf2;border-radius:12px;padding:12px 14px;background:#fff}.inst-alert.danger{border-left:4px solid #c53a3a}.inst-alert.warning{border-left:4px solid #d08a00}.inst-alert.success{border-left:4px solid #25805a}.inst-alert small{display:block;color:#718096;margin-top:3px}.inst-records{margin-top:18px}.inst-record-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.inst-record{border:1px solid #e2e9f2;border-radius:13px;padding:14px;background:#fff}.inst-record-head{display:flex;justify-content:space-between;gap:10px}.inst-record strong{color:#173b75}.inst-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.inst-meta div{padding:8px 9px;background:#f7f9fc;border-radius:9px}.inst-meta span{display:block;font-size:10px;color:#718096;text-transform:uppercase}.inst-meta b{display:block;font-size:12px;margin-top:2px;color:#243b5a}.inst-record-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.inst-btn{border:1px solid #cbd7e6;background:#fff;color:#173b75;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer}.inst-btn.primary{background:#174681;color:#fff;border-color:#174681}.inst-btn.danger{color:#b42318}.inst-empty{padding:16px;border:1px dashed #cbd7e6;border-radius:12px;color:#60728a;background:#fbfcfe}@media(max-width:800px){.inst-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inst-record-grid{grid-template-columns:1fr}.institution-hero{flex-direction:column}}@media(max-width:520px){.inst-stat-grid{grid-template-columns:1fr}.inst-meta{grid-template-columns:1fr}.institution-hero h3{font-size:21px}}
    `;
    document.head.appendChild(s);
  }

  function daysTo(value){
    const d = new Date(`${String(value).slice(0,10)}T00:00:00`); if(Number.isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0,0,0,0); return Math.ceil((d-today)/86400000);
  }
  function status(status){return `<span class="pill ${String(status).toLowerCase()}">${String(status).replaceAll('_',' ')}</span>`;}
  function alertFor(f){
    const d=daysTo(f.expiry_date);
    if(f.status==='REJECTED') return {kind:'danger',title:`Action required • ${f.fdr_number}`,text:f.verification_note||'Your FDR was rejected. Review the officer note and submit a corrected document.'};
    if(!f.document_url) return {kind:'warning',title:`Document required • ${f.fdr_number}`,text:'Upload the prescribed FDR certificate to complete your submission.'};
    if(d!==null&&d<0) return {kind:'danger',title:`Expired • ${f.fdr_number}`,text:'This FDR has passed its expiry date. Submit a replacement or follow the applicable lifecycle process.'};
    if(d!==null&&d<=30) return {kind:'warning',title:`Renewal approaching • ${f.fdr_number}`,text:`Expires in ${d} day(s). Start renewal or replacement early.`};
    if(f.status==='SUBMITTED'||f.status==='UNDER_REVIEW') return {kind:'warning',title:`Verification pending • ${f.fdr_number}`,text:'The FDR is awaiting officer review.'};
    return null;
  }

  function render(){
    const panel=document.getElementById('institutionActionCenter'); if(!panel||!isInstitution()) return;
    const total=records.length, verified=records.filter(f=>f.status==='VERIFIED').length, pending=records.filter(f=>['SUBMITTED','UNDER_REVIEW'].includes(f.status)).length, rejected=records.filter(f=>f.status==='REJECTED').length;
    const alerts=records.map(alertFor).filter(Boolean).slice(0,5);
    panel.innerHTML=`<div class="institution-home card">
      <div class="institution-hero"><div><p class="eyebrow">Institution workspace</p><h3>My FDR Portfolio</h3><p>Submit your security deposits, monitor verification, respond to discrepancies and manage renewals or release/refund requests.</p></div><div class="institution-actions"><button class="inst-btn primary" data-scroll-submit>+ Submit New FDR</button></div></div>
      <div class="inst-stat-grid"><div class="inst-stat"><span>My FDRs</span><strong>${total}</strong></div><div class="inst-stat"><span>Verified</span><strong>${verified}</strong></div><div class="inst-stat"><span>Awaiting verification</span><strong>${pending}</strong></div><div class="inst-stat"><span>Action required</span><strong>${rejected+records.filter(f=>{const d=daysTo(f.expiry_date);return d!==null&&d<=30}).length}</strong></div></div>
      <div class="inst-alerts">${alerts.length?alerts.map(a=>`<div class="inst-alert ${a.kind}"><div><strong>${esc(a.title)}</strong><small>${esc(a.text)}</small></div><span class="comp-badge ${a.kind==='danger'?'danger':'warning'}">${a.kind==='danger'?'ACTION REQUIRED':'ATTENTION'}</span></div>`).join(''):'<div class="inst-alert success"><div><strong>✓ No immediate action required</strong><small>Your submitted FDR portfolio has no current alerts.</small></div><span class="comp-badge success">HEALTHY</span></div>'}</div>
      <div class="inst-records"><div class="panel-head"><div><p class="eyebrow">Institution records</p><h3>Manage my FDRs</h3><p>Only records belonging to your institution are shown.</p></div></div><div class="inst-record-grid">${records.length?records.map(f=>{const d=daysTo(f.expiry_date);const urgency=d!==null&&d<=30&&d>=0;return `<article class="inst-record"><div class="inst-record-head"><div><strong>${esc(f.fdr_number)}</strong><div class="muted-text">${esc(f.bank_name)}</div></div>${status(f.status)}</div><div class="inst-meta"><div><span>Amount</span><b>₹${Number(f.amount||0).toLocaleString('en-IN')}</b></div><div><span>Expiry</span><b>${esc(String(f.expiry_date).slice(0,10))}</b></div><div><span>Verification</span><b>${f.status==='VERIFIED'?'Verified':f.status==='REJECTED'?'Correction required':'Awaiting officer'}</b></div><div><span>Deadline</span><b>${d===null?'—':d<0?'Expired':`${d} day(s) left`}</b></div></div><div class="inst-record-actions"><button class="inst-btn" data-view-id="${esc(f.id)}">View</button>${(urgency||f.status==='REJECTED')?`<button class="inst-btn" data-act="RENEWAL" data-id="${esc(f.id)}">Renew</button><button class="inst-btn" data-act="REPLACEMENT" data-id="${esc(f.id)}">Replace</button>`:''}<button class="inst-btn danger" data-act="RELEASE" data-id="${esc(f.id)}">Request release/refund</button></div></article>`}).join(''):'<div class="inst-empty">No FDRs submitted yet. Use “Submit New FDR” to create your first record.</div>'}</div></div>
    </div>`;
    panel.querySelector('[data-scroll-submit]')?.addEventListener('click',()=>document.getElementById('institutionPanel')?.scrollIntoView({behavior:'smooth',block:'start'}));
    panel.querySelectorAll('[data-view-id]').forEach(btn=>btn.addEventListener('click',()=>{const row=records.find(x=>String(x.id)===String(btn.dataset.viewId));if(row){document.getElementById('recordsPanel')?.scrollIntoView({behavior:'smooth',block:'start'});const tr=document.querySelector(`tr[data-fdr-id="${CSS.escape(String(row.id))}"]`);tr?.scrollIntoView({behavior:'smooth',block:'center'});tr?.classList.add('row-highlight');setTimeout(()=>tr?.classList.remove('row-highlight'),1800);}}));
  }

  async function load(){if(!token()||!isInstitution())return;try{const r=await fetch('/api/fdr',{headers:{Authorization:`Bearer ${token()}`}});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load institution records');records=data.fdrs||[];render();}catch(e){console.warn('Institution dashboard unavailable',e)}}
  function start(){styles();setTimeout(load,350);setInterval(load,20000);document.addEventListener('securefdr:renewal-submitted',load);document.addEventListener('securefdr:replacement-submitted',load);document.addEventListener('securefdr:release-requested',load);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
