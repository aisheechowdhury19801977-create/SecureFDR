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
    tr.innerHTML = `<td><strong>${escapeHtml(fdr.fdr_number)}</strong></td>
      <td>${escapeHtml(fdr.bank_name)}</td>
      <td>₹${Number(fdr.amount).toLocaleString('en-IN')}</td>
      <td>${fdr.expiry_date}</td>
      <td><span class="pill ${fdr.status.toLowerCase()}">${fdr.status.replaceAll('_',' ')}</span></td>
      <td>—</td>`;
    rows.appendChild(tr);
  }

  $('stats').innerHTML = [
    ['Total FDRs', counts.total], ['Verified', counts.verified], ['Pending review', counts.review], ['Expired', counts.expired]
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
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
    loadFdrs();
  } catch (error) { setMessage('fdrMessage', error.message); }
});

$('refreshBtn').addEventListener('click', loadFdrs);
$('logoutBtn').addEventListener('click', () => {
  state.token = null; state.user = null;
  localStorage.removeItem('securefdr_token');
  showAuth();
});

loadMe();
