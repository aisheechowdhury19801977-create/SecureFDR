const state = { token: localStorage.getItem('securefdr_token'), user: null };
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
  if (officer) {
    loadOfficerQueue();
    loadAudit();
  }
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

async function loadFdrs() {
  const data = await api('/api/fdr');
  const rows = $('fdrRows');
  rows.innerHTML = '';
  const counts = countsFor(data.fdrs);

  for (const fdr of data.fdrs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
      <td>${escapeHtml(fdr.bank_name)}</td>
      <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
      <td>${escapeHtml(fdr.expiry_date)}</td>
      <td>${statusPill(fdr.status)}</td>
      <td>${state.user.role === 'INSTITUTION' ? '—' : 'Verification queue'}</td>`;
    rows.appendChild(tr);
  }

  $('stats').innerHTML = [
    ['Total FDRs', counts.total], ['Verified', counts.verified], ['Pending review', counts.review], ['Expired', counts.expired]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

async function loadOfficerQueue() {
  try {
    const data = await api('/api/fdr');
    const rows = $('officerRows');
    rows.innerHTML = '';

    for (const fdr of data.fdrs) {
      const actions = fdr.status === 'VERIFIED' || fdr.status === 'REJECTED'
        ? '<span class="message">Final</span>'
        : `<div class="decision-actions">
            <button class="action-btn" data-id="${fdr.id}" data-status="UNDER_REVIEW">Review</button>
            <button class="action-btn success" data-id="${fdr.id}" data-status="VERIFIED">Verify</button>
            <button class="action-btn danger" data-id="${fdr.id}" data-status="REJECTED">Reject</button>
          </div>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
        <td>${escapeHtml(fdr.institution_name || 'Institution')}</td>
        <td>${escapeHtml(fdr.bank_name)}</td>
        <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
        <td>${escapeHtml(fdr.expiry_date)}</td>
        <td>${statusPill(fdr.status)}</td>
        <td>${actions}</td>`;
      rows.appendChild(tr);
    }

    rows.querySelectorAll('[data-status]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await api(`/api/fdr/${button.dataset.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: button.dataset.status })
          });
          await loadOfficerQueue();
          await loadFdrs();
          await loadAudit();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
        }
      });
    });
  } catch (error) {
    $('officerRows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadAudit() {
  if (!['OFFICER', 'ADMIN'].includes(state.user.role)) return;
  try {
    const data = await api('/api/audit');
    const rows = $('auditRows');
    rows.innerHTML = '';
    for (const log of data.logs) {
      const details = log.details ? JSON.stringify(log.details) : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${new Date(log.created_at).toLocaleString('en-IN')}</td>
        <td>${escapeHtml(log.actor_name || 'System')}</td>
        <td>${escapeHtml(log.actor_role || '—')}</td>
        <td>${escapeHtml(log.action)}</td>
        <td>${escapeHtml(log.entity_type)}</td>
        <td>${escapeHtml(details)}</td>`;
      rows.appendChild(tr);
    }
  } catch (error) {
    $('auditRows').innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  $('loginForm').classList.toggle('hidden', tab.dataset.tab !== 'login');
  $('registerForm').classList.toggle('hidden', tab.dataset.tab !== 'register');
  setMessage('authMessage', '');
}));

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }) });
    state.token = data.accessToken;
    state.user = data.user;
    localStorage.setItem('securefdr_token', state.token);
    showApp();
  } catch (error) { setMessage('authMessage', error.message); }
});

$('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/auth/register', { method: 'POST', body: JSON.stringify({
      name: $('registerName').value,
      email: $('registerEmail').value,
      password: $('registerPassword').value
    }) });
    setMessage('authMessage', 'Account created. You can now log in.', true);
    document.querySelector('[data-tab="login"]').click();
  } catch (error) { setMessage('authMessage', error.message); }
});

$('fdrForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/fdr', { method: 'POST', body: JSON.stringify({
      fdrNumber: $('fdrNumber').value,
      bankName: $('bankName').value,
      amount: Number($('amount').value),
      issueDate: $('issueDate').value,
      expiryDate: $('expiryDate').value,
      documentName: $('documentName').value
    }) });
    event.target.reset();
    setMessage('fdrMessage', 'FDR submitted successfully.', true);
    await loadFdrs();
  } catch (error) { setMessage('fdrMessage', error.message); }
});

$('refreshBtn').addEventListener('click', loadFdrs);
$('refreshOfficerBtn').addEventListener('click', async () => { await loadOfficerQueue(); await loadFdrs(); });
$('refreshAuditBtn').addEventListener('click', loadAudit);
$('logoutBtn').addEventListener('click', () => {
  state.token = null; state.user = null;
  localStorage.removeItem('securefdr_token');
  showAuth();
});

loadMe();
