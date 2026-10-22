(() => {
  function enhanceDocumentActions() {
    const box = document.getElementById('reviewDocument');
    if (!box) return;

    const link = box.querySelector('a.document-link');
    if (!link || link.dataset.actionsEnhanced === 'true') return;

    link.dataset.actionsEnhanced = 'true';
    link.classList.add('document-link-main');
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

    const download = document.createElement('a');
    download.className = 'action-btn success';
    download.href = url;
    download.download = fileName;
    download.textContent = 'Download certificate';

    link.replaceWith(actions);
    actions.append(view, download);
  }

  const start = () => {
    const box = document.getElementById('reviewDocument');
    if (!box) return;
    const observer = new MutationObserver(enhanceDocumentActions);
    observer.observe(box, { childList: true, subtree: true });
    enhanceDocumentActions();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
