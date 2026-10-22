(() => {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  async function loadDocumentActions() {
    const token = localStorage.getItem('securefdr_token');
    const panel = $('recordsPanel');
    if (!token || !panel) return;

    try {
      const response = await fetch('/api/fdr', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      const table = panel.querySelector('table');
      const head = table?.querySelector('thead tr');
      const rows = table?.querySelectorAll('tbody tr');
      if (!head || !rows) return;

      if (!head.querySelector('[data-document-header]')) {
        const th = document.createElement('th');
        th.textContent = 'Certificate';
        th.dataset.documentHeader = 'true';
        head.appendChild(th);
      }

      const byNumber = new Map(data.fdrs.map(fdr => [fdr.fdr_number, fdr]));
      rows.forEach(row => {
        const number = row.cells[0]?.textContent.trim();
        const fdr = byNumber.get(number);
        if (!fdr || !fdr.document_url) return;

        let cell = row.querySelector('[data-document-cell]');
        if (!cell) {
          cell = document.createElement('td');
          cell.dataset.documentCell = 'true';
          row.appendChild(cell);
        }
        if (cell.dataset.ready === 'true') return;
        cell.dataset.ready = 'true';

        const fileName = fdr.document_name || 'FDR_certificate';
        const actions = document.createElement('div');
        actions.className = 'document-actions';

        const view = document.createElement('a');
        view.className = 'action-btn';
        view.href = fdr.document_url;
        view.target = '_blank';
        view.rel = 'noopener';
        view.textContent = 'View';

        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'action-btn success';
        download.textContent = 'Download';
        download.addEventListener('click', async () => {
          download.disabled = true;
          const oldText = download.textContent;
          download.textContent = 'Preparing…';
          try {
            const blob = await fetch(fdr.document_url).then(r => r.blob());
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          } catch (error) {
            alert('Unable to download the certificate.');
          } finally {
            download.disabled = false;
            download.textContent = oldText;
          }
        });

        actions.append(view, download);
        cell.appendChild(actions);
      });
    } catch (error) {
      console.warn('Certificate actions unavailable:', error);
    }
  }

  const start = () => {
    loadDocumentActions();
    setInterval(loadDocumentActions, 2000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
