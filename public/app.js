const state = {
  token: localStorage.getItem('securefdr_token'),
  user: null,
  selectedFdr: null,
  decision: null
};

const $ = (id) => document.getElementById(id);

function setMessage(id, text, ok = false) {
  $(id).textContent = text || '';
  $(id).style.color = ok ? '#177245' : '#b23b3b';
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showApp() {
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('userBadge').textContent = `${state.user.name} • ${state.user.role}`;
  $('welcome').textContent = `${state.user.role === 'INSTITUTION' ? 'Welcome' : `${state.user.role} Dashboard`}, ${state.user.name}`;
  const institution = state.user.role === 'INSTITUTION';
  const officer = ['OFFICER', 'ADMIN'].includes(state.user.role);
  $('institutionPanel').classList.toggle('hidden', !institution);
  $('officerPanel').classList.toggle('hidden', !officer);
  $('auditPanel').classList.toggle('hidden', !officer);
  loadFdrs();
  if (officer) { loadOfficerQueue(); loadAudit(); }
}

function showAuth() {
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  $('userBadge').textContent = 'Not signed in';
}

async function loadMe() {
  if (!state.token) return showAuth();
  try {
    const data = await api('/api/me');
    state.user = data.user;
    showApp();
  } catch {
    localStorage.removeItem('securefdr_token');
    state.token = null;
    showAuth();
  }
}

function statusPill(status) {
  return `<span class="pill ${status.toLowerCase()}">${status.replaceAll('_',' ')}</span>`;
}

function countsFor(fdrs) {
  return fdrs.reduce((counts, fdr) => {
    counts.total++;
    if (fdr.status === 'VERIFIED') counts.verified++;
    if (['SUBMITTED', 'UNDER_REVIEW'].includes(fdr.status)) counts.review++;
    if (fdr.status === 'EXPIRED') counts.expired++;
    return counts;
  }, { total: 0, verified: 0, review: 0, expired: 0 });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN');
}

function documentActions(fdr) {
  if (!fdr.document_url) return '<span class="muted-text">No certificate</span>';
  const name = escapeHtml(fdr.document_name || 'FDR_certificate');
  const url = escapeHtml(fdr.document_url);
  return `<div class="document-actions">
    <a class="action-btn" href="${url}" target="_blank" rel="noopener">View</a>
    <a class="action-btn success" href="${url}" download="${name}">Download</a>
  </div>`;
}

function verificationSummary(fdr) {
  if (fdr.status === 'VERIFIED') {
    const by = fdr.verified_by_name || 'Verification Officer';
    return `<div class="verification-cell"><strong>✓ Verified</strong><span>${escapeHtml(by)}</span><small>${escapeHtml(formatDateTime(fdr.verified_at))}</small></div>`;
  }
  if (fdr.status === 'REJECTED') {
    const by = fdr.verified_by_name || 'Verification Officer';
    return `<div class="verification-cell rejected-text"><strong>✕ Rejected</strong><span>${escapeHtml(by)}</span><small>${escapeHtml(fdr.verification_note || 'Reason recorded')}</small></div>`;
  }
  return '<span class="muted-text">Awaiting officer decision</span>';
}

async function loadFdrs() {
  try {
    const data = await api('/api/fdr');
    const rows = $('fdrRows');
    rows.innerHTML = '';
    const counts = countsFor(data.fdrs);
    for (const fdr of data.fdrs) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
        <td>${escapeHtml(fdr.bank_name)}</td>
        <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
        <td>${formatDate(fdr.expiry_date)}</td>
        <td>${statusPill(fdr.status)}</td>
        <td>${verificationSummary(fdr)}</td>
        <td>${documentActions(fdr)}</td>`;
      rows.appendChild(tr);
    }
    const table = rows.closest('table');
    if (table) {
      const header = table.querySelector('thead tr');
      if (header && !header.querySelector('[data-document-header]')) {
        const th = document.createElement('th');
        th.dataset.documentHeader = 'true';
        th.textContent = 'Certificate';
        header.appendChild(th);
      }
    }
    $('stats').innerHTML = [
      ['Total FDRs', counts.total], ['Verified', counts.verified], ['Pending review', counts.review], ['Expired', counts.expired]
    ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  } catch (error) {
    $('fdrRows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadOfficerQueue() {
  try {
    const data = await api('/api/fdr');
    const rows = $('officerRows');
    rows.innerHTML = '';
    for (const fdr of data.fdrs) {
      const final = ['VERIFIED', 'REJECTED'].includes(fdr.status);
      const actions = final
        ? '<span class="message">Final</span>'
        : `<div class="decision-actions">
            <button class="action-btn" data-action="review" data-id="${fdr.id}">Review</button>
            <button class="action-btn success" data-action="verify" data-id="${fdr.id}">Verify</button>
            <button class="action-btn danger" data-action="reject" data-id="${fdr.id}">Reject</button>
          </div>`;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
        <td>${escapeHtml(fdr.institution_name || 'Institution')}</td>
        <td>${escapeHtml(fdr.bank_name)}</td>
        <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
        <td>${formatDate(fdr.expiry_date)}</td>
        <td>${statusPill(fdr.status)}</td>
        <td>${actions}</td>`;
      rows.appendChild(tr);
    }
    rows.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      const fdr = data.fdrs.find(item => item.id === button.dataset.id);
      if (!fdr) return;
      if (button.dataset.action === 'review') return openReviewModal(fdr);
      openDecisionModal(fdr, button.dataset.action === 'verify' ? 'VERIFIED' : 'REJECTED');
    }));
  } catch (error) {
    $('officerRows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

function openReviewModal(fdr) {
  state.selectedFdr = fdr;
  $('reviewFdrNumber').textContent = fdr.fdr_number;
  $('reviewInstitution').textContent = fdr.institution_name || '—';
  $('reviewEmail').textContent = fdr.institution_email || '—';
  $('reviewBank').textContent = fdr.bank_name || '—';
  $('reviewAmount').textContent = `₹${Number(fdr.amount).toLocaleString('en-IN')}`;
  $('reviewIssueDate').textContent = formatDate(fdr.issue_date);
  $('reviewExpiryDate').textContent = formatDate(fdr.expiry_date);
  $('reviewStatus').innerHTML = statusPill(fdr.status);
  $('reviewCreated').textContent = formatDateTime(fdr.created_at);
  $('reviewVerifiedBy').textContent = fdr.verified_by_name || 'Not verified yet';
  $('reviewVerifiedAt').textContent = formatDateTime(fdr.verified_at);
  $('reviewVerificationNote').textContent = fdr.verification_note || 'No verification note recorded.';
  const documentBox = $('reviewDocument');
  if (fdr.document_url) {
    const url = escapeHtml(fdr.document_url);
    const name = escapeHtml(fdr.document_name || 'FDR document');
    documentBox.innerHTML = `<div class="document-actions"><a class="action-btn" href="${url}" target="_blank" rel="noopener">View certificate</a><a class="action-btn success" href="${url}" download="${name}">Download certificate</a></div>`;
  } else {
    documentBox.innerHTML = `<span class="document-missing">📄 ${escapeHtml(fdr.document_name || 'No document attached')}</span><small>Document upload/link can be connected here.</small>`;
  }
  $('reviewModal').classList.remove('hidden');
}

function closeReviewModal() { $('reviewModal').classList.add('hidden'); state.selectedFdr = null; }

function openDecisionModal(fdr, status) {
  state.selectedFdr = fdr;
  state.decision = status;
  $('decisionTitle').textContent = status === 'VERIFIED' ? 'Verify FDR' : 'Reject FDR';
  $('decisionSubtitle').textContent = status === 'VERIFIED' ? 'Confirm that the submitted FDR has been checked and is valid.' : 'Provide a reason so the institution can understand the rejection.';
  $('decisionFdr').textContent = fdr.fdr_number;
  $('decisionNote').value = '';
  $('decisionNote').placeholder = status === 'VERIFIED' ? 'Optional verification note' : 'Required rejection reason';
  $('decisionConfirm').textContent = status === 'VERIFIED' ? 'Confirm verification' : 'Confirm rejection';
  $('decisionConfirm').className = `primary ${status === 'REJECTED' ? 'danger-primary' : ''}`;
  $('decisionMessage').textContent = '';
  $('decisionModal').classList.remove('hidden');
}

function closeDecisionModal() { $('decisionModal').classList.add('hidden'); state.selectedFdr = null; state.decision = null; }

async function updateFdrStatus(status, note = '') {
  if (!state.selectedFdr) return;
  const button = $('decisionConfirm'); button.disabled = true;
  try {
    await api(`/api/fdr/${state.selectedFdr.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) });
    closeDecisionModal(); await loadOfficerQueue(); await loadFdrs(); await loadAudit();
  } catch (error) { $('decisionMessage').textContent = error.message; }
  finally { button.disabled = false; }
}

async function markUnderReview() {
  if (!state.selectedFdr) return;
  try {
    await api(`/api/fdr/${state.selectedFdr.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'UNDER_REVIEW', note: 'Officer opened the FDR for review.' }) });
    closeReviewModal(); await loadOfficerQueue(); await loadFdrs(); await loadAudit();
  } catch (error) { alert(error.message); }
}

async function loadAudit() {
  if (!['OFFICER', 'ADMIN'].includes(state.user.role)) return;
  try {
    const data = await api('/api/audit');
    const rows = $('auditRows'); rows.innerHTML = '';
    for (const log of data.logs) {
      const details = log.details ? JSON.stringify(log.details) : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatDateTime(log.created_at)}</td><td>${escapeHtml(log.actor_name || 'System')}</td><td>${escapeHtml(log.actor_role || '—')}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.entity_type)}</td><td class="audit-details" title="${escapeHtml(details)}">${escapeHtml(details)}</td>`;
      rows.appendChild(tr);
    }
  } catch (error) { $('auditRows').innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`; }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
  $('loginForm').classList.toggle('hidden', tab.dataset.tab !== 'login'); $('registerForm').classList.toggle('hidden', tab.dataset.tab !== 'register'); setMessage('authMessage', '');
}));

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }) }); state.token = data.accessToken; state.user = data.user; localStorage.setItem('securefdr_token', state.token); showApp(); }
  catch (error) { setMessage('authMessage', error.message); }
});

$('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: $('registerName').value, email: $('registerEmail').value, password: $('registerPassword').value }) }); setMessage('authMessage', 'Account created. You can now log in.', true); document.querySelector('[data-tab="login"]').click(); }
  catch (error) { setMessage('authMessage', error.message); }
});

$('fdrForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/fdr', { method: 'POST', body: JSON.stringify({ fdrNumber: $('fdrNumber').value, bankName: $('bankName').value, amount: Number($('amount').value), issueDate: $('issueDate').value, expiryDate: $('expiryDate').value, documentName: $('documentName').value }) }); event.target.reset(); setMessage('fdrMessage', 'FDR submitted successfully.', true); await loadFdrs(); }
  catch (error) { setMessage('fdrMessage', error.message); }
});

$('decisionForm').addEventListener('submit', async (event) => { event.preventDefault(); const note = $('decisionNote').value.trim(); if (state.decision === 'REJECTED' && !note) { $('decisionMessage').textContent = 'Please enter a rejection reason.'; return; } await updateFdrStatus(state.decision, note); });
$('reviewCloseBtn').addEventListener('click', closeReviewModal);
$('reviewMarkBtn').addEventListener('click', markUnderReview);
$('reviewVerifyBtn').addEventListener('click', () => { if (state.selectedFdr) openDecisionModal(state.selectedFdr, 'VERIFIED'); });
$('reviewRejectBtn').addEventListener('click', () => { if (state.selectedFdr) openDecisionModal(state.selectedFdr, 'REJECTED'); });
$('decisionCloseBtn').addEventListener('click', closeDecisionModal);
$('decisionCancelBtn').addEventListener('click', closeDecisionModal);
$('reviewModal').addEventListener('click', (event) => { if (event.target === $('reviewModal')) closeReviewModal(); });
$('decisionModal').addEventListener('click', (event) => { if (event.target === $('decisionModal')) closeDecisionModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeReviewModal(); closeDecisionModal(); } });
$('refreshBtn').addEventListener('click', loadFdrs);
$('refreshOfficerBtn').addEventListener('click', async () => { await loadOfficerQueue(); await loadFdrs(); });
$('refreshAuditBtn').addEventListener('click', loadAudit);
$('logoutBtn').addEventListener('click', () => { state.token = null; state.user = null; localStorage.removeItem('securefdr_token'); showAuth(); });

loadMe();
