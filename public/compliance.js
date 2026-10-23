(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const token = () => localStorage.getItem('securefdr_token');
  let records = [];
  let selected = null;
  const CASE_KEY = 'securefdr_compliance_cases_v1';

  function cases() { try { return JSON.parse(localStorage.getItem(CASE_KEY) || '{}'); } catch { return {}; } }
  function saveCases(v) { localStorage.setItem(CASE_KEY, JSON.stringify(v)); }
  function daysTo(dateValue) {
    if (!dateValue) return null;
    const d = new Date(`${String(dateValue).slice(0,10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.ceil((d.getTime()-today.getTime())/86400000);
  }
  function issues(f) {
    const out=[];
    if (!f.fdr_number) out.push('Missing FDR number');
    if (!f.bank_name) out.push('Missing issuing bank');
    if (!(Number(f.amount)>0)) out.push('Invalid amount');
    if (!f.issue_date || !f.expiry_date) out.push('Missing validity dates');
    if (f.issue_date && f.expiry_date && new Date(f.expiry_date)<=new Date(f.issue_date)) out.push('Expiry date is not after issue date');
    if (!f.document_url) out.push('Supporting certificate missing');
    if (f.status==='VERIFIED' && !f.verified_by) out.push('Verified without officer identity');
    return out;
  }
  function duplicateSet(list) {
    const counts={}; list.forEach(f=>{const k=String(f.fdr_number||'').trim().toLowerCase(); if(k) counts[k]=(counts[k]||0)+1;});
    return new Set(list.filter(f=>{const k=String(f.fdr_number||'').trim().toLowerCase(); return k&&counts[k]>1;}).map(f=>f.id));
  }
  function risk(f) {
    const d=daysTo(f.expiry_date);
    if(d===null) return ['Unknown','neutral'];
    if(d<0) return ['Expired','danger'];
    if(d<=7) return ['Critical','danger'];
    if(d<=30) return ['Urgent','danger'];
    if(d<=90) return ['Renewal soon','warning'];
    return ['Healthy','success'];
  }
  function style() {
    if ($('complianceStyles')) return;
    const s=document.createElement('style'); s.id='complianceStyles';
    s.textContent=`
      .compliance-panel{margin-top:16px}.compliance-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.compliance-stat{border:1px solid #dfe7f1;border-radius:14px;padding:15px;background:#fff}.compliance-stat span{display:block;font-size:12px;color:#64748b}.compliance-stat strong{display:block;font-size:24px;color:#102a52;margin-top:4px}.compliance-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.compliance-toolbar input,.compliance-toolbar select{border:1px solid #cbd7e6;border-radius:8px;padding:8px 10px;background:#fff}.compliance-table{width:100%;border-collapse:collapse}.compliance-table th,.compliance-table td{padding:10px 8px;border-bottom:1px solid #edf1f5;text-align:left;font-size:13px}.compliance-table th{font-size:11px;text-transform:uppercase;color:#62748b}.comp-badge{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700}.comp-badge.success{background:#e8f7ef;color:#087443}.comp-badge.warning{background:#fff5d9;color:#9a6700}.comp-badge.danger{background:#fdecec;color:#b42318}.comp-badge.neutral{background:#eef2f6;color:#5f6f82}.comp-action{border:1px solid #cbd7e6;background:#fff;border-radius:7px;padding:6px 9px;font-weight:600;cursor:pointer}.comp-action.primary{background:#174681;color:#fff;border-color:#174681}.comp-action.danger{color:#b42318}.comp-alert{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e5ebf3;border-radius:10px;background:#fbfcfe;margin-top:8px}.comp-alert small{display:block;color:#68788f;margin-top:3px}.comp-empty{padding:12px;border-radius:10px;background:#f5f8fc;color:#52657d}.comp-modal{position:fixed;inset:0;background:rgba(15,35,60,.45);display:flex;align-items:center;justify-content:center;z-index:1200;padding:20px}.comp-modal.hidden{display:none}.comp-card{width:min(620px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.2)}.comp-card textarea{width:100%;box-sizing:border-box;border:1px solid #cbd7e6;border-radius:8px;padding:9px;margin-top:7px}.comp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}@media(max-width:850px){.compliance-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.compliance-table{min-width:850px}}
    `; document.head.appendChild(s);
  }
  function panel() {
    if ($('compliancePanel') || !$('stats')) return;
    const p=document.createElement('section'); p.id='compliancePanel'; p.className='card panel compliance-panel';
    p.innerHTML=`<div class="panel-head"><div><p class="eyebrow">AICTE compliance center</p><h3>Discrepancies, deadlines & workflow</h3><p>Surface missing records, duplicate FDRs, maturity risks and pending lifecycle actions.</p></div><div class="compliance-toolbar"><input id="compSearch" placeholder="Search FDR / bank"><select id="compFilter"><option value="ALL">All cases</option><option value="DISCREPANCY">Discrepancies</option><option value="DUPLICATE">Duplicate FDRs</option><option value="DEADLINE">Deadline risks</option><option value="MISSING">Missing documents</option><option value="ACTION">Pending actions</option></select><button id="compRefresh" class="comp-action primary">Refresh</button><button id="compExport" class="comp-action">Export CSV</button></div></div><div id="compStats" class="compliance-grid"></div><div id="compAlerts"></div><div style="margin-top:18px"><div class="table-wrap"><table class="compliance-table"><thead><tr><th>FDR</th><th>Institution</th><th>Bank</th><th>Risk</th><th>Issues</th><th>Lifecycle status</th><th>Action</th></tr></thead><tbody id="compRows"></tbody></table></div></div>`;
    $('stats').insertAdjacentElement('afterend',p);
    document.body.insertAdjacentHTML('beforeend',`<div id="compModal" class="comp-modal hidden"><div class="comp-card"><p class="eyebrow">Compliance workflow</p><h3 id="compTitle">Record action</h3><p id="compSummary"></p><label>Observation / reference<textarea id="compNote" rows="4" maxlength="600"></textarea></label><div class="comp-actions"><button id="compCancel" class="comp-action">Cancel</button><button id="compSave" class="comp-action primary">Save</button></div></div></div>`);
    $('compSearch').addEventListener('input',render); $('compFilter').addEventListener('change',render); $('compRefresh').addEventListener('click',load); $('compExport').addEventListener('click',exportCsv); $('compCancel').addEventListener('click',closeModal); $('compSave').addEventListener('click',saveAction);
  }
  function openAction(f, action){ selected={f,action}; const labels={RENEWAL:'Renewal follow-up',REPLACEMENT:'Replacement follow-up',RELEASE:'Release / refund request',OBSERVE:'Scrutiny observation'}; $('compTitle').textContent=labels[action]||'Record action'; $('compSummary').textContent=`${f.fdr_number} • ${f.bank_name} • ₹${Number(f.amount).toLocaleString('en-IN')}`; $('compNote').value=''; $('compNote').placeholder=action==='RELEASE'?'Reason and authorization reference':'Observation, bank reference or follow-up note'; $('compModal').classList.remove('hidden'); }
  function closeModal(){selected=null; $('compModal').classList.add('hidden');}
  function saveAction(){ if(!selected)return; const all=cases(); const id=selected.f.id; all[id]=all[id]||{}; all[id][selected.action.toLowerCase()]={status:'OPEN',note:$('compNote').value.trim(),at:new Date().toISOString()}; saveCases(all); closeModal(); render(); }
  function lifecycleStatus(f){const c=cases()[f.id]||{}; const vals=[]; if(c.renewal)vals.push('Renewal'); if(c.replacement)vals.push('Replacement'); if(c.release)vals.push('Release/refund'); if(c.observe)vals.push('Observation'); return vals.length?vals.join(', '):'No action';}
  function matches(f,filter,dup){const d=daysTo(f.expiry_date), isDup=dup.has(f.id), iss=issues(f); if(filter==='DISCREPANCY')return iss.length>0; if(filter==='DUPLICATE')return isDup; if(filter==='DEADLINE')return d!==null&&d<=90; if(filter==='MISSING')return !f.document_url; if(filter==='ACTION')return lifecycleStatus(f)!=='No action'; return true;}
  function render(){const rows=$('compRows'); if(!rows)return; const q=($('compSearch').value||'').trim().toLowerCase(), filter=$('compFilter').value, dup=duplicateSet(records); const visible=records.filter(f=>(!q||`${f.fdr_number} ${f.bank_name} ${f.institution_name||''}`.toLowerCase().includes(q))&&matches(f,filter,dup)); rows.innerHTML=visible.length?visible.map(f=>{const [label,cls]=risk(f), iss=issues(f), allIssues=iss.concat(dup.has(f.id)?['Duplicate FDR number']:[]); return `<tr><td><strong>${esc(f.fdr_number)}</strong></td><td>${esc(f.institution_name||'—')}</td><td>${esc(f.bank_name)}</td><td><span class="comp-badge ${cls}">${label}</span><br><small>${daysTo(f.expiry_date)===null?'Unknown':`${Math.max(daysTo(f.expiry_date),0)} day(s)`}</small></td><td>${allIssues.length?allIssues.map(x=>`<span class="comp-badge warning" style="margin:2px">${esc(x)}</span>`).join(' '):'<span class="comp-badge success">Clear</span>'}</td><td>${esc(lifecycleStatus(f))}</td><td><div class="compliance-toolbar"><button class="comp-action" data-act="OBSERVE" data-id="${f.id}">Review</button><button class="comp-action" data-act="RENEWAL" data-id="${f.id}">Renewal</button><button class="comp-action" data-act="REPLACEMENT" data-id="${f.id}">Replace</button><button class="comp-action danger" data-act="RELEASE" data-id="${f.id}">Release/refund</button></div></td></tr>`}).join(''):'<tr><td colspan="7"><div class="comp-empty">No records match this compliance view.</div></td></tr>'; rows.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>{const f=records.find(x=>x.id===b.dataset.id);if(f)openAction(f,b.dataset.act)})); const notice=records.filter(f=>{const d=daysTo(f.expiry_date);return d!==null&&d>=0&&d<=90}).length, urgent=records.filter(f=>{const d=daysTo(f.expiry_date);return d!==null&&d>=0&&d<=30}).length, critical=records.filter(f=>{const d=daysTo(f.expiry_date);return d!==null&&d>=0&&d<=7}).length, expired=records.filter(f=>{const d=daysTo(f.expiry_date);return d!==null&&d<0}).length, missing=records.filter(f=>!f.document_url).length, discrepancy=records.filter(f=>issues(f).length>0||dup.has(f.id)).length; $('compStats').innerHTML=[['Active',records.filter(f=>f.status!=='EXPIRED').length],['Renewal ≤90d',notice],['Urgent ≤30d',urgent],['Critical ≤7d',critical],['Expired',expired],['Missing docs',missing],['Discrepancies',discrepancy],['Verified',records.filter(f=>f.status==='VERIFIED').length]].map(([l,v])=>`<div class="compliance-stat"><span>${l}</span><strong>${v}</strong></div>`).join(''); const alerts=[]; records.forEach(f=>{const d=daysTo(f.expiry_date); if(d!==null&&d<=30&&d>=0)alerts.push(['danger',`Deadline alert • ${f.fdr_number}`,`Expires in ${d} day(s). Renewal/replacement should be initiated.`]); if(!f.document_url)alerts.push(['warning',`Missing document • ${f.fdr_number}`,'Attach the prescribed supporting certificate.']); if(dup.has(f.id))alerts.push(['warning',`Duplicate FDR • ${f.fdr_number}`,'The same instrument number exists in more than one record.']);}); $('compAlerts').innerHTML=alerts.length?alerts.slice(0,8).map(a=>`<div class="comp-alert"><div><strong>${esc(a[1])}</strong><small>${esc(a[2])}</small></div><span class="comp-badge ${a[0]}">${a[0]==='danger'?'ACTION REQUIRED':'ATTENTION'}</span></div>`).join(''):'<div class="comp-empty">No active compliance alerts.</div>';}
  async function load(){if(!token())return; try{const r=await fetch('/api/fdr',{headers:{Authorization:`Bearer ${token()}`}}); if(!r.ok)return; const data=await r.json(); records=data.fdrs||[]; panel(); render();}catch(e){console.warn('Compliance center unavailable',e)}}
  function exportCsv(){const header=['FDR','Institution','Bank','Amount','Expiry','Status','Issues','Lifecycle'];const dup=duplicateSet(records);const lines=[header.join(',')];records.forEach(f=>{const vals=[f.fdr_number,f.institution_name,f.bank_name,f.amount,f.expiry_date,f.status,issues(f).concat(dup.has(f.id)?['Duplicate FDR']:[]).join('; '),lifecycleStatus(f)];lines.push(vals.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));});const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='securefdr-compliance-report.csv';a.click();URL.revokeObjectURL(url);}
  function start(){style();load();setInterval(load,15000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
