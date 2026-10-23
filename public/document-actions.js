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

  function authHeaders() {
    const token = localStorage.getItem('securefdr_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function documentUrl(fdr, download = false) {
    return `/api/fdr/${encodeURIComponent(fdr.id)}/document${download ? '?download=1' : ''}`;
  }

  async function openStoredDocument(fdr) {
    const response = await fetch(documentUrl(fdr), { headers: authHeaders() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to open certificate');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function downloadStoredDocument(fdr) {
    const response = await fetch(documentUrl(fdr, true), { headers: authHeaders() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to download certificate');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fdr.document_name || 'FDR_certificate';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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

      const originalText = label.textContent;
      label.textContent = 'Uploading…';
      label.style.pointerEvents = 'none';

      try {
        const documentData = await readAsDataUrl(file);
        const response = await fetch(`/api/fdr/${encodeURIComponent(fdr.id)}/document`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentName: file.name, documentUrl: documentData })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to upload certificate');
        await refresh();
      } catch (error) {
        alert(error.message || 'Unable to upload certificate.');
        label.textContent = originalText;
        label.style.pointerEvents = '';
      }
    });

    label.appendChild(input);
    wrapper.appendChild(label);
    cell.appendChild(wrapper);
  }

  function addDocumentActions(cell, fdr) {
    cell.innerHTML = '';
    const actions = document.createElement('div');
    actions.className = 'document-actions';

    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'action-btn';
    view.textContent = 'View';
    view.addEventListener('click', async () => {
      try { await openStoredDocument(fdr); }
      catch (error) { alert(error.message || 'Unable to open certificate'); }
    });

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'action-btn success';
    download.textContent = 'Download';
    download.addEventListener('click', async () => {
      try { await downloadStoredDocument(fdr); }
      catch (error) { alert(error.message || 'Unable to download certificate'); }
    });

    actions.append(view, download);
    cell.appendChild(actions);
  }

  async function enhanceRecordTable() {
    const token = localStorage.getItem('securefdr_token');
    const panel = document.getElementById('recordsPanel');
    if (!token || !panel) return;

    try {
      const [fdrResponse, meResponse] = await Promise.all([
        fetch('/api/fdr', { headers: authHeaders() }),
        fetch('/api/me', { headers: authHeaders() })
      ]);
      if (!fdrResponse.ok || !meResponse.ok) return;

      const data = await fdrResponse.json();
      const me = await meResponse.json();
      const canUpload = ['INSTITUTION', 'ADMIN'].includes(me.user?.role);

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

      const byId = new Map(data.fdrs.map(fdr => [String(fdr.id), fdr]));
      rows.forEach(row => {
        const id = row.dataset.fdrId;
        const fdr = id ? byId.get(String(id)) : null;
        if (!fdr) return;

        let cell = row.querySelector('[data-document-cell]');
        if (!cell) {
          cell = document.createElement('td');
          cell.dataset.documentCell = 'true';
          row.appendChild(cell);
        }

        if (fdr.document_url) addDocumentActions(cell, fdr);
        else if (canUpload) createUploadControl(fdr, cell, enhanceRecordTable);
        else { cell.textContent = 'No certificate'; cell.className = 'muted-text'; }
      });
    } catch (error) {
      console.warn('Certificate actions unavailable:', error);
    }
  }

  function start() {
    enhanceRecordTable();
    setInterval(enhanceRecordTable, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
