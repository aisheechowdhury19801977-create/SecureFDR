(() => {
  const MAX_FILE_BYTES = 600 * 1024;
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read the selected document.'));
      reader.readAsDataURL(file);
    });
  }

  function createUploadControl(fdr, cell, refresh) {
    if (cell.querySelector('[data-upload-document]')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'document-actions';

    const label = document.createElement('label');
    label.className = 'action-btn';
    label.textContent = 'Upload certificate';
    label.style.cursor = 'pointer';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
    input.hidden = true;
    input.dataset.uploadDocument = 'true';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!ALLOWED_TYPES.includes(file.type)) {
        input.value = '';
        alert('Please select a PDF, JPG or PNG file.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        input.value = '';
        alert('The document must be 600 KB or smaller for this prototype.');
        return;
      }

      label.textContent = 'Uploading…';
      label.style.pointerEvents = 'none';
      try {
        const documentUrl = await readAsDataUrl(file);
        const token = localStorage.getItem('securefdr_token');
        const response = await fetch(`/api/fdr/${encodeURIComponent(fdr.id)}/document`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ documentName: file.name, documentUrl })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to attach certificate');
        await refresh();
      } catch (error) {
        alert(error.message || 'Unable to attach certificate.');
        label.textContent = 'Upload certificate';
        label.style.pointerEvents = '';
      }
    });

    label.appendChild(input);
    wrapper.appendChild(label);
    cell.appendChild(wrapper);
  }

  function enhanceReviewDocument() {
    const box = document.getElementById('reviewDocument');
    if (!box) return;

    const link = box.querySelector('a.document-link');
    if (!link || link.dataset.actionsEnhanced === 'true') return;

    link.dataset.actionsEnhanced = 'true';
    const url = link.getAttribute('href');
    const fileName = link.textContent.replace(/^📄\s*Open\s*/i, '').trim() || 'FDR_document';

    const actions = document.createElement('div');
    actions.className = 'document-actions';

    const view = document.createElement('a');
    view.className = 'action-btn';
    view.href = url;
    view.target = '_blank';
    view.rel = 'noopener';
    view.textContent = 'View certificate';

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'action-btn success';
    download.textContent = 'Download certificate';
    download.addEventListener('click', async () => {
      download.disabled = true;
      const oldText = download.textContent;
      download.textContent = 'Preparing…';
      try {
        const blob = await fetch(url).then(response => {
          if (!response.ok) throw new Error('Download failed');
          return response.blob();
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch {
        alert('Unable to download the certificate.');
      } finally {
        download.disabled = false;
        download.textContent = oldText;
      }
    });

    link.replaceWith(actions);
    actions.append(view, download);
  }

  async function enhanceRecordTable() {
    const token = localStorage.getItem('securefdr_token');
    const panel = document.getElementById('recordsPanel');
    if (!token || !panel) return;

    try {
      const response = await fetch('/api/fdr', { headers: { Authorization: `Bearer ${token}` } });
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
        if (!fdr) return;

        let cell = row.querySelector('[data-document-cell]');
        if (!cell) {
          cell = document.createElement('td');
          cell.dataset.documentCell = 'true';
          row.appendChild(cell);
        }

        if (fdr.document_url) {
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
              const blob = await fetch(fdr.document_url).then(r => {
                if (!r.ok) throw new Error('Download failed');
                return r.blob();
              });
              const objectUrl = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = objectUrl;
              anchor.download = fileName;
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
              setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            } catch {
              alert('Unable to download the certificate.');
            } finally {
              download.disabled = false;
              download.textContent = oldText;
            }
          });

          actions.append(view, download);
          cell.appendChild(actions);
        } else {
          cell.innerHTML = '';
          createUploadControl(fdr, cell, enhanceRecordTable);
        }
      });
    } catch (error) {
      console.warn('Certificate actions unavailable:', error);
    }
  }

  function start() {
    const reviewBox = document.getElementById('reviewDocument');
    if (reviewBox) {
      const observer = new MutationObserver(enhanceReviewDocument);
      observer.observe(reviewBox, { childList: true, subtree: true });
      enhanceReviewDocument();
    }
    enhanceRecordTable();
    setInterval(enhanceRecordTable, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
