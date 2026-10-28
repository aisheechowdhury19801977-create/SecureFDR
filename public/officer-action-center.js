(() => {
  const token = () => localStorage.getItem('securefdr_token');
  const officer = () => /•\s*(OFFICER|ADMIN)\b/i.test(document.getElementById('userBadge')?.textContent || '');
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  function styles() {
    if (document.getElementById('officerActionStyles')) return;
    const s = document.createElement('style'); s.id='officerActionStyles'; s.textContent=`
      .officer-action-center{margin-bottom:22px}.action-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}.action-metric{border:1px solid #e3eaf3;border-radius:12px;padding:14px;background:#f9fbfe}.action-metric span{display:block;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:.05em}.action-metric strong{display:block;font-size:24px;margin-top:4px;color:#173b75}.priority-list{display:grid;gap:9px;margin-top:15px}.priority-item{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;padding:13px;border:1px solid #e5ebf3;border-radius:12px;background:#fff}.priority-dot{width:10px;height:10px;border-radius:50%;background:#d8a10b}.priority-dot.high{background:#c13b3b}.priority-dot.medium{background:#d18a00}.priority-dot.low{background:#21835a}.priority-item strong{display:block;font-size:13px}.priority-item small{display:block;color:#718096;margin-top:3px;font-size:11px;line-height:1.4}.priority-score{font-size:11px;font-weight:800;color:#536176;background:#f1f5fa;border-radius:999px;padding:5px 8px;white-space:nowrap}.priority-empty{padding:16px;background:#f4faf6;border:1px solid #d9eee1;border-radius:12px;color:#237047}@media(max-width:800px){.action-summary{grid-template-columns:repeat(2,1fr)}.priority-item{grid-template-columns:auto 1fr}.priority-score,.priority-item .ghost{grid-column:2;justify-self:start}}@media(max-width:520px){.action-summary{grid-template-columns:1fr}.priority-item{grid-template-columns:auto 1fr}.priority-score,.priority-item .ghost{grid-column:2;justify-self:start}}
    `; document.head.appendChild(s);
  }
  async function load(){
    if(!token()||!officer()) return;
    const panel=document.getElementById('officerActionCenter'); if(!panel)return;
    panel.classList.remove('hidden');
    try{
      const response=await fetch('/api/fdr',{headers:{Authorization:`Bearer ${token()}`}}); const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to load cases');
      const fdrs=data.fdrs||[], now=Date.now();
      const scored=fdrs.map(f=>{const expiry=new Date(`${String(f.expiry_date).slice(0,10)}T23:59:59`).getTime();const days=Number.isFinite(expiry)?Math.ceil((expiry-now)/86400000):9999;let score=0,reasons=[];if(f.status==='REJECTED'){score+=50;reasons.push('Rejected — follow-up required')}if(['SUBMITTED','UNDER_REVIEW'].includes(f.status)){score+=35;reasons.push('Officer verification pending')}if(days<=7){score+=35;reasons.push(`Matures in ${Math.max(days,0)} days`)}else if(days<=30){score+=25;reasons.push(`Matures in ${days} days`)}else if(days<=90){score+=12;reasons.push(`Renewal window: ${days} days left`)}if(!f.document_url){score+=20;reasons.push('Supporting document missing')}return {...f,score,days,reasons}}).filter(f=>f.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
      const critical=scored.filter(x=>x.score>=60).length, action=scored.filter(x=>x.score>=30).length, healthy=fdrs.filter(x=>x.status==='VERIFIED').length, expired=fdrs.filter(x=>x.status==='EXPIRED').length;
      panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Officer command view</p><h3>Today's action queue</h3><p>Prioritized cases so the officer can act on the highest-risk FDRs first.</p></div><button id="actionRefresh" class="ghost">Refresh priorities</button></div><div class="action-summary"><div class="action-metric"><span>Critical</span><strong>${critical}</strong></div><div class="action-metric"><span>Action required</span><strong>${action}</strong></div><div class="action-metric"><span>Verified</span><strong>${healthy}</strong></div><div class="action-metric"><span>Expired</span><strong>${expired}</strong></div></div><div class="priority-list">${scored.length?scored.map(f=>{const level=f.score>=60?'high':f.score>=30?'medium':'low';return `<div class="priority-item"><span class="priority-dot ${level}"></span><div><strong>${esc(f.fdr_number)} • ${esc(f.institution_name||'Institution')}</strong><small>${esc(f.bank_name)} • ₹${Number(f.amount||0).toLocaleString('en-IN')} • ${esc(f.reasons.join(' • '))}</small></div><span class="priority-score">Priority ${f.score}</span><button class="ghost" data-open-fdr="${esc(f.id)}">Review case</button></div>`}).join(''):'<div class="priority-empty">✓ No urgent officer actions detected in the current dataset.</div>'}</div>`;
      document.getElementById('actionRefresh').addEventListener('click',load);
      panel.querySelectorAll('[data-open-fdr]').forEach(btn=>btn.addEventListener('click',()=>{const fdr=fdrs.find(x=>String(x.id)===String(btn.dataset.openFdr));if(fdr&&typeof window.openReviewModal==='function')window.openReviewModal(fdr)}));
    }catch(error){panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Officer command view</p><h3>Today's action queue</h3><p>Use the verification queue below while priorities are refreshed.</p></div></div>`}
  }
  function start(){styles();setTimeout(load,250);setInterval(load,30000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
