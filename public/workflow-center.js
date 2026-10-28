(() => {
  const token = () => localStorage.getItem('securefdr_token');
  const userRole = () => document.querySelector('#userBadge')?.textContent || '';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  function addStyles(){
    if(document.getElementById('workflowCenterStyles'))return;
    const s=document.createElement('style');s.id='workflowCenterStyles';s.textContent=`
      .workflow-center{margin-top:16px}.workflow-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.workflow-card{border:1px solid #dfe7f1;border-radius:14px;padding:14px;background:#fff}.workflow-card span{display:block;color:#64748b;font-size:12px}.workflow-card strong{display:block;font-size:24px;color:#102a52;margin-top:4px}.workflow-list{margin-top:14px;display:grid;gap:8px}.workflow-item{border:1px solid #e5ebf3;border-radius:10px;padding:11px 12px;background:#fbfcfe;display:flex;justify-content:space-between;gap:12px;align-items:center}.workflow-item small{display:block;color:#68788f;margin-top:3px}.workflow-actions{display:flex;gap:7px;flex-wrap:wrap}.workflow-btn{border:1px solid #cbd7e6;background:#fff;border-radius:7px;padding:7px 9px;font-weight:600;cursor:pointer}.workflow-btn.primary{background:#174681;color:#fff;border-color:#174681}.workflow-btn.danger{color:#b42318}.workflow-empty{padding:12px;background:#f5f8fc;border-radius:10px;color:#52657d}@media(max-width:850px){.workflow-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  async function api(path,options={}){
    const response=await fetch(path,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token()}`,'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Request failed');return data;
  }

  function mount(){
    if(document.getElementById('workflowCenter')||!document.getElementById('stats'))return;
    const section=document.createElement('section');section.id='workflowCenter';section.className='card panel workflow-center';
    section.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Regulatory workflow</p><h3>Lifecycle requests & discrepancy queue</h3><p>Keep release/refund decisions and discrepancy resolution inside the same auditable workflow.</p></div><button id="workflowRefresh" class="workflow-btn primary">Refresh</button></div><div id="workflowStats" class="workflow-grid"></div><div id="workflowList" class="workflow-list"></div>`;
    document.getElementById('stats').insertAdjacentElement('afterend',section);
    document.getElementById('workflowRefresh').addEventListener('click',load);
  }

  function badge(status){const cls=['APPROVED','COMPLETED','RESOLVED'].includes(status)?'success':['REJECTED','DISMISSED'].includes(status)?'danger':'warning';return `<span class="comp-badge ${cls}">${esc(status)}</span>`;}

  async function load(){
    if(!token())return;mount();
    try{
      const [requestsData,casesData]=await Promise.all([api('/api/lifecycle-requests'),api('/api/discrepancies').catch(()=>({cases:[]}))]);
      const requests=requestsData.requests||[];const cases=casesData.cases||[];
      const pending=requests.filter(r=>['SUBMITTED','UNDER_REVIEW'].includes(r.status));const openCases=cases.filter(c=>['OPEN','UNDER_REVIEW'].includes(c.status));
      document.getElementById('workflowStats').innerHTML=[['Release/refund requests',pending.length],['Open discrepancies',openCases.length],['Completed lifecycle decisions',requests.filter(r=>['APPROVED','REJECTED','COMPLETED'].includes(r.status)).length]].map(([l,v])=>`<div class="workflow-card"><span>${l}</span><strong>${v}</strong></div>`).join('');
      const role=userRole();
      let html='';
      requests.slice(0,8).forEach(r=>{html+=`<div class="workflow-item"><div><strong>${esc(r.request_type)} • ${esc(r.fdr_number)}</strong><small>${esc(r.institution_name||'Institution')} • ₹${Number(r.requested_amount).toLocaleString('en-IN')} • ${esc(r.reason)}</small><small>${badge(r.status)}</small></div><div class="workflow-actions">${['OFFICER','ADMIN'].some(x=>role.includes(x))&&['SUBMITTED','UNDER_REVIEW'].includes(r.status)?`<button class="workflow-btn" data-request="${r.id}" data-status="UNDER_REVIEW">Review</button><button class="workflow-btn primary" data-request="${r.id}" data-status="APPROVED">Approve</button><button class="workflow-btn danger" data-request="${r.id}" data-status="REJECTED">Reject</button>`:''}</div></div>`});
      cases.slice(0,8).forEach(c=>{html+=`<div class="workflow-item"><div><strong>Discrepancy • ${esc(c.case_type)} • ${esc(c.fdr_number)}</strong><small>${esc(c.institution_name||'Institution')} • ${esc(c.description)}</small><small>${badge(c.status)}</small></div><div class="workflow-actions">${['OFFICER','ADMIN'].some(x=>role.includes(x))&&['OPEN','UNDER_REVIEW'].includes(c.status)?`<button class="workflow-btn" data-case="${c.id}" data-status="UNDER_REVIEW">Review</button><button class="workflow-btn primary" data-case="${c.id}" data-status="RESOLVED">Resolve</button><button class="workflow-btn danger" data-case="${c.id}" data-status="DISMISSED">Dismiss</button>`:''}</div></div>`});
      document.getElementById('workflowList').innerHTML=html||'<div class="workflow-empty">No lifecycle requests or discrepancy cases require attention.</div>';
      document.querySelectorAll('[data-request]').forEach(b=>b.addEventListener('click',()=>requestAction(b.dataset.request,b.dataset.status)));
      document.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>caseAction(b.dataset.case,b.dataset.status)));
    }catch(e){document.getElementById('workflowList').innerHTML=`<div class="workflow-empty">Workflow center unavailable: ${esc(e.message)}</div>`;}
  }

  async function requestAction(id,status){const note=status==='REJECTED'?prompt('Enter rejection reason:'):prompt('Officer note (optional):');if(status==='REJECTED'&&!String(note||'').trim())return;try{await api(`/api/lifecycle-requests/${id}/status`,{method:'PATCH',body:JSON.stringify({status,note:note||''})});load();}catch(e){alert(e.message);}}
  async function caseAction(id,status){const note=prompt(status==='RESOLVED'?'Resolution note:':'Officer note (optional):');try{await api(`/api/discrepancies/${id}`,{method:'PATCH',body:JSON.stringify({status,note:note||''})});load();}catch(e){alert(e.message);}}

  function start(){addStyles();load();setInterval(load,20000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
