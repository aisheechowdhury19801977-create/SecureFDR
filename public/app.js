const state = { token: localStorage.getItem('securefdr_token'), user: null, verification: null };
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
  $('welcome').textContent = `Welcome, ${state.user.name}`;
  $('institutionPanel').classList.toggle('hidden', state.user.role !== 'INSTITUTION');
  loadFdrs();
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

async function loadFdrs() {
  const data = await api('/api/fdr');
  const rows = $('fdrRows');
  rows.innerHTML = '';
  const counts = { total: data.fdrs.length, verified: 0, review: 0, expired: 0 };

  for (const fdr of data.fdrs) {
    if (fdr.status === 'VERIFIED') counts.verified++;
    if (['SUBMITTED', 'UNDER_REVIEW'].includes(fdr.status)) counts.review++;
    if (fdr.status === 'EXPIRED') counts.expired++;

    const tr = document.createElement('tr');
    const action = state.user.role === 'OFFICER' || state.user.role === 'ADMIN'
      ? `<button class="action-btn" data-id="${fdr.id}">Verify</button>` : '—';
    const verification = fdr.verification_score >= 75 ? `✓ ${fdr.verification_score}%` : `⚠ ${fdr.verification_score}%`;
    tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
      <td>${escapeHtml(fdr.bank_name)}</td>
      <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
      <td>${fdr.expiry_date}</td>
      <td>${verification}</td>
      <td><span class="pill ${fdr.status.toLowerCase()}">${fdr.status.replaceAll('_',' ')}</span></td>
      <td>${action}</td>`;
    rows.appendChild(tr);
  }

  $('stats').innerHTML = [
    ['Total FDRs', counts.total], ['Verified', counts.verified], ['Pending review', counts.review], ['Expired', counts.expired]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');

  document.querySelectorAll('.action-btn').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/api/fdr/${btn.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      loadFdrs();
    } catch (error) { alert(error.message); }
  }));
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
    setMessage('authMessage', 'Institution account created. You can now log in.', true);
    document.querySelector('[data-tab="login"]').click();
  } catch (error) { setMessage('authMessage', error.message); }
});

$('verifyBtn').addEventListener('click', async () => {
  const file = $('documentFile').files[0];
  if (!file) return setMessage('verifyMessage', 'Choose an FDR PDF first.');
  if (file.type !== 'application/pdf') return setMessage('verifyMessage', 'Only PDF documents are accepted.');

  const formData = new FormData();
  formData.append('document', file);
  setMessage('verifyMessage', 'Reading PDF and checking FDR fields...', true);
  try {
    const data = await api('/api/fdr/verify-document', { method: 'POST', body: formData });
    state.verification = data.extraction;
    $('documentName').value = file.name;
    $('fdrNumber').value = data.extraction.fdrNumber || '';
    $('bankName').value = data.extraction.bankName || '';
    $('amount').value = data.extraction.amount || '';
    $('issueDate').value = data.extraction.issueDate || '';
    $('expiryDate').value = data.extraction.expiryDate || '';
    $('verificationPanel').classList.remove('hidden');
    const issues = data.extraction.issues.length ? `<br>Issues: ${data.extraction.issues.map(escapeHtml).join(' • ')}` : '';
    $('verificationSummary').innerHTML = `${escapeHtml(data.message)}<br>Confidence: <strong>${data.extraction.confidence}%</strong>${issues}`;
    setMessage('verifyMessage', 'Document verification completed.', true);
  } catch (error) {
    state.verification = null;
    setMessage('verifyMessage', error.message);
  }
});

$('fdrForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (!$('documentFile').files[0]) throw new Error('Upload and verify the FDR PDF before submitting.');
    await api('/api/fdr', { method: 'POST', body: JSON.stringify({
      fdrNumber: $('fdrNumber').value,
      bankName: $('bankName').value,
      amount: Number($('amount').value),
      issueDate: $('issueDate').value,
      expiryDate: $('expiryDate').value,
      documentName: $('documentName').value,
      documentUrl: null,
      verification: state.verification
    }) });
    event.target.reset();
    $('verificationPanel').classList.add('hidden');
    $('verifyMessage').textContent = '';
    state.verification = null;
    setMessage('fdrMessage', 'FDR submitted successfully for officer review.', true);
    loadFdrs();
  } catch (error) { setMessage('fdrMessage', error.message); }
});

$('refreshBtn').addEventListener('click', loadFdrs);
$('logoutBtn').addEventListener('click', () => {
  state.token = null; state.user = null; state.verification = null;
  localStorage.removeItem('securefdr_token');
  showAuth();
});

loadMe();
