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

  function installUploadField() {
    const form = document.getElementById('fdrForm');
    const documentName = document.getElementById('documentName');
    if (!form || !documentName || documentName.dataset.uploadReady) return;

    documentName.dataset.uploadReady = 'true';
    const wrapper = document.createElement('label');
    wrapper.innerHTML = 'Upload FDR certificate <input id="documentFile" type="file" accept=".pdf,.jpg,.jpeg,.png"><small>PDF, JPG or PNG • maximum 600 KB</small>';
    documentName.parentElement.insertAdjacentElement('afterend', wrapper);

    const fileInput = wrapper.querySelector('#documentFile');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!ALLOWED_TYPES.includes(file.type)) {
        fileInput.value = '';
        alert('Please select a PDF, JPG or PNG file.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        fileInput.value = '';
        alert('The document must be 600 KB or smaller for this prototype.');
        return;
      }
      documentName.value = file.name;
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();

    if (url.endsWith('/api/fdr') && method === 'POST' && typeof init.body === 'string') {
      const fileInput = document.getElementById('documentFile');
      const file = fileInput?.files?.[0];
      if (file) {
        if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Please select a PDF, JPG or PNG file.');
        if (file.size > MAX_FILE_BYTES) throw new Error('The document must be 600 KB or smaller for this prototype.');

        const payload = JSON.parse(init.body);
        payload.documentName = file.name;
        payload.documentUrl = await readAsDataUrl(file);
        init = { ...init, body: JSON.stringify(payload) };
      }
    }

    return originalFetch(input, init);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installUploadField);
  } else {
    installUploadField();
  }
})();
