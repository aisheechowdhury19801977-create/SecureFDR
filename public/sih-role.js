(() => {
  const syncRole = () => {
    const text = document.getElementById('userBadge')?.textContent || '';
    if (text.includes('INSTITUTION')) window.secureFdrRole = 'INSTITUTION';
    else if (text.includes('OFFICER')) window.secureFdrRole = 'OFFICER';
    else if (text.includes('ADMIN')) window.secureFdrRole = 'ADMIN';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncRole); else syncRole();
  const badge = document.getElementById('userBadge');
  if (badge) new MutationObserver(syncRole).observe(badge, { childList:true, subtree:true, characterData:true });
})();
