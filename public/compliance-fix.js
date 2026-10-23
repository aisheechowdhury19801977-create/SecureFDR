(() => {
  const token = () => localStorage.getItem('securefdr_token');
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};

  function duplicateGroups(records) {
    const groups = new Map();
    records.forEach(f => {
      const key = String(f.fdr_number || '').trim().toLowerCase();
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    });
    return [...groups.entries()].filter(([, rows]) => rows.length > 1);
  }

  function issueCount(f) {
    let n = 0;
    if (!f.fdr_number) n++;
    if (!f.bank_name) n++;
    if (!(Number(f.amount) > 0)) n++;
    if (!f.issue_date || !f.expiry_date) n++;
    if (f.issue_date && f.expiry_date && new Date(f.expiry_date) <= new Date(f.issue_date)) n++;
    if (!f.document_url) n++;
    if (f.status === 'VERIFIED' && !f.verified_by) n++;
    return n;
  }

  async function refreshComplianceSummary() {
    if (!token() || !document.getElementById('compliancePanel')) return;
    try {
      const response = await fetch('/api/fdr', { headers: headers() });
      if (!response.ok) return;
      const data = await response.json();
      const records = data.fdrs || [];
      const groups = duplicateGroups(records);
      const duplicateIds = new Set(groups.flatMap(([, rows]) => rows.map(f => String(f.id))));
      const uniqueDataIssues = records.filter(f => issueCount(f) > 0 && !duplicateIds.has(String(f.id))).length;
      const discrepancyCases = uniqueDataIssues + groups.length;

      const stats = document.getElementById('compStats');
      if (stats) {
        [...stats.children].forEach(card => {
          const label = card.querySelector('span')?.textContent?.trim();
          if (label === 'Discrepancies') {
            const value = card.querySelector('strong');
            if (value) value.textContent = String(discrepancyCases);
          }
        });
      }

      const alerts = document.getElementById('compAlerts');
      if (alerts && groups.length) {
        const existing = [...alerts.children].filter(el => !el.dataset.duplicateSummary);
        const summaryNodes = groups.map(([key, rows]) => {
          const box = document.createElement('div');
          box.className = 'comp-alert';
          box.dataset.duplicateSummary = 'true';
          box.innerHTML = `<div><strong>Duplicate FDR number • ${key.toUpperCase()}</strong><small>One discrepancy case affecting ${rows.length} records. Review the duplicate instrument records before accepting the FDR.</small></div><span class="comp-badge warning">ATTENTION</span>`;
          return box;
        });
        alerts.innerHTML = '';
        summaryNodes.forEach(node => alerts.appendChild(node));
        existing.forEach(node => alerts.appendChild(node));
      }
    } catch (error) {
      console.warn('Compliance summary correction unavailable', error);
    }
  }

  function start() {
    refreshComplianceSummary();
    setInterval(refreshComplianceSummary, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
