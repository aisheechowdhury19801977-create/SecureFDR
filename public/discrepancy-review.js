(() => {
  let current = null;
  const token = () => localStorage.getItem('securefdr_token');
  const esc = v => String(v ?? '').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  function styles(){
    if(document.getElementById('discrepancyReviewStyles'))return;
    const s=document.createElement('style');s.id='discrepancyReviewStyles';s.textContent=`.drm-modal{position:fixed;inset:0;background:rgba(15,35,60,.48);display:flex;align-items:center;justify-content:center;z-index:1400;padding:20px}.drm-modal.hidden{display:none}.drm-card{width:min(760px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.22)}.drm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.drm-close{border:0;background:#eef2f6;border-radius:50%;width:34px;height:34px;font-size:22px;cursor:pointer}.drm-banner{margin:18px 0;padding:14px;border:1px solid #f0c7c7;background:#fff7f7;border-radius:12px}.drm-banner strong{display:block;font-size:18px;color:#9f2018;margin-bottom:5px}.drm-banner span{color:#63748b;font-size:13px}.drm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.drm-field{border:1px solid #e2e8f0;border-radius:10px;padding:11px}.drm-field span{display:block;font-size:11px;color:#718096;text-transform:uppercase}.drm-field strong{display:block;margin-top:4px;color:#17365d}.drm-section{border-top:1px solid #e8edf3;padding-top:16px;margin-top:16px}.drm-list{margin:0;padding-left:20px}.drm-note{width:100%;box-sizing:border-box;border:1px solid #cbd7e6;border-radius:9px;padding:10px;resize:vertical}.drm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.drm-btn{border:1px solid #cbd7e6;background:#fff;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer}.drm-btn.primary{background:#174681;color:#fff;border-color:#174681}.drm-btn.warning{background:#fff5d9;color:#8a5a00;border-color:#efd58a}.drm-btn.danger{color:#a5201a;border-color:#e3b2b0}.drm-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700;background:#eef2f6;color:#52657d}.drm-status.open{background:#fff5d9;color:#8a5a00}.drm-status.resolved{background:#e8f7ef;color:#087443}.drm-status.correction{background:#eaf2ff;color:#174681}.drm-status.escalated{background:#fdecec;color:#b42318}@media(max-width:650px){.drm-grid{grid-template-columns:1fr}}`;document.head.appendChild(s);
  }

  function ensureModal(){
    if(document.getElementById('drmModal'))return;
    document.body.insertAdjacentHTML('beforeend',`<div id="drmModal" class="drm-modal hidden" role="dialog" aria-modal="true"><div class="drm-card"><div class="drm-head"><div><p class="eyebrow">Discrepancy review</p><h3>Review compliance case</h3></div><button id="drmClose" class="drm-close" aria-label="Close">×</button></div><div id="drmBody"></div><div class="drm-actions"><button id="drmCancel" class="drm-btn">Close</button><button id="drmCorrection" class="drm-btn warning">Request correction</button><button id="drmEscalate" class="drm-btn danger">Escalate</button><button id="drmResolve" class="drm-btn primary">Resolve</button></div></div></div>`);
    document.getElementById('drmClose').onclick=close;document.getElementById('drmCancel').onclick=close;document.getElementById('drmCorrection').onclick=()=>save('UNDER_REVIEW');document.getElementById('drmEscalate').onclick=()=>save('UNDER_REVIEW');document.getElementById('drmResolve').onclick=()=>save('RESOLVED');
  }

  function open(record){
    ensureModal();current=record;const issues=[];
    if(!record.fdr_number)issues.push('Missing FDR number');if(!record.bank_name)issues.push('Missing issuing bank');if(!(Number(record.amount)>0))issues.push('Invalid amount');if(!record.issue_date||!record.expiry_date)issues.push('Missing validity dates');if(record.issue_date&&record.expiry_date&&new Date(record.expiry_date)<=new Date(record.issue_date))issues.push('Expiry date is not after issue date');if(!record.document_url)issues.push('Supporting certificate missing');if(record.status==='VERIFIED'&&!record.verified_by)issues.push('Verified without officer identity');
    const duplicate=Array.isArray(window.__secureFdrComplianceRecords)&&window.__secureFdrComplianceRecords.filter(x=>String(x.fdr_number||'').trim().toLowerCase()===String(record.fdr_number||'').trim().toLowerCase()).length>1;if(duplicate)issues.push('Duplicate FDR number');
    document.getElementById('drmBody').innerHTML=`<div class="drm-banner"><strong>${esc(issues[0]||'Discrepancy requiring scrutiny')}</strong><span>${issues.length} issue(s) identified for this record.</span></div><div class="drm-grid"><div class="drm-field"><span>FDR number</span><strong>${esc(record.fdr_number||'—')}</strong></div><div class="drm-field"><span>Institution</span><strong>${esc(record.institution_name||'—')}</strong></div><div class="drm-field"><span>Issuing bank</span><strong>${esc(record.bank_name||'—')}</strong></div><div class="drm-field"><span>Amount</span><strong>₹${Number(record.amount||0).toLocaleString('en-IN')}</strong></div><div class="drm-field"><span>Issue date</span><strong>${esc(record.issue_date||'—')}</strong></div><div class="drm-field"><span>Expiry date</span><strong>${esc(record.expiry_date||'—')}</strong></div><div class="drm-field"><span>Current status</span><strong>${esc(record.status||'—')}</strong></div></div><div class="drm-section"><h4>Issues identified</h4><ul class="drm-list">${(issues.length?issues:['No automated issue found; officer review requested.']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="drm-section"><h4>Supporting evidence</h4><p>${record.document_url?`<a href="/api/fdr/${encodeURIComponent(record.id)}/document" target="_blank" rel="noopener">View submitted certificate</a>`:'No supporting certificate is attached.'}</p></div><div class="drm-section"><h4>Officer observation</h4><textarea id="drmNote" class="drm-note" rows="4" maxlength="1000" placeholder="Record what was checked, the discrepancy finding, or the correction required."></textarea></div>`;
    document.getElementById('drmModal').classList.remove('hidden');
  }

  function close(){current=null;document.getElementById('drmModal')?.classList.add('hidden');}

  async function save(status){
    if(!current)return;const note=document.getElementById('drmNote')?.value.trim()||'';
    try{
      const listResponse=await fetch('/api/discrepancies',{headers:{Authorization:`Bearer ${token()}`}});const list=await listResponse.json();
      let existing=(list.cases||[]).find(x=>String(x.fdr_id)===String(current.id)&&['OPEN','UNDER_REVIEW'].includes(x.status));
      if(!existing){
        const duplicate=Array.isArray(window.__secureFdrComplianceRecords)&&window.__secureFdrComplianceRecords.filter(x=>String(x.fdr_number||'').trim().toLowerCase()===String(current.fdr_number||'').trim().toLowerCase()).length>1;
        const caseType=!current.document_url?'MISSING_DOCUMENT':duplicate?'DUPLICATE':(current.issue_date&&current.expiry_date&&new Date(current.expiry_date)<=new Date(current.issue_date)?'DATE_INVALID':'OTHER');
        const create=await fetch('/api/discrepancies',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({fdrId:current.id,caseType,description:note||'Automated compliance discrepancy identified during officer scrutiny.'})});
        const created=await create.json();if(!create.ok)throw new Error(created.error||'Unable to create discrepancy case');existing=created.case;
      }
      const response=await fetch(`/api/discrepancies/${existing.id}`,{method:'PATCH',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({status,note})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to update discrepancy');
      close();document.getElementById('compRefresh')?.click();document.getElementById('workflowRefresh')?.click();
    }catch(e){alert(e.message||'Unable to save discrepancy action');}
  }

  function exposeRecords(){
    if(window.__secureFdrFetchWrapped)return;const originalFetch=window.fetch;window.__secureFdrFetchWrapped=true;window.fetch=async(...args)=>{const response=await originalFetch(...args);try{const url=String(args[0]?.url||args[0]||'');if(url.includes('/api/fdr')){const clone=response.clone();clone.json().then(data=>{window.__secureFdrComplianceRecords=data.fdrs||[]}).catch(()=>{})}}catch{}return response};
  }

  function intercept(e){const btn=e.target.closest?.('[data-act="OBSERVE"]');if(!btn)return;const row=btn.closest('tr');if(!row)return;const fdr=row.querySelector('strong')?.textContent?.trim();const record=(window.__secureFdrComplianceRecords||[]).find(x=>String(x.fdr_number)===fdr);if(!record)return;e.preventDefault();e.stopImmediatePropagation();open(record);}
  function start(){styles();ensureModal();exposeRecords();document.addEventListener('click',intercept,true);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
