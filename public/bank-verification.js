(() => {
  const DEMO_BANK_GATEWAY = {
    name: 'SecureFDR Authorized Bank Gateway',
    environment: 'DEMO / SANDBOX',
    records: {
      'FDR-2026-0002': { bank: 'Punjab National Bank', amount: 1000000, issueDate: '2026-10-23', expiryDate: '2028-10-23', reference: 'PNB-AUTH-2026-0002', verified: true },
      'FDR-2026-0001': { bank: 'State Bank of India', amount: 1000000, issueDate: '2026-10-23', expiryDate: '2027-10-23', reference: 'SBI-AUTH-2026-0001', verified: true }
    }
  };

  function css() {
    if (document.getElementById('bankVerificationStyles')) return;
    const s = document.createElement('style');
    s.id = 'bankVerificationStyles';
    s.textContent = `
      .bank-gateway-box{margin-top:16px;border:1px solid #d8e3f0;border-radius:14px;background:#f8fbff;padding:16px}
      .bank-gateway-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .bank-gateway-title{font-weight:800;color:#17365d}.bank-gateway-sub{font-size:12px;color:#70829a;margin-top:3px}
      .bank-gateway-badge{font-size:10px;font-weight:800;letter-spacing:.05em;padding:5px 8px;border-radius:999px;background:#fff2cc;color:#8a5a00;white-space:nowrap}
      .bank-gateway-result{margin-top:12px;padding:12px;border-radius:10px;background:#fff;border:1px solid #e1e9f2}
      .bank-gateway-result.success{border-color:#b8e1ca;background:#f3fbf6}.bank-gateway-result.fail{border-color:#efc2c0;background:#fff7f7}
      .bank-gateway-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.bank-gateway-grid div{font-size:12px}.bank-gateway-grid span{display:block;color:#718096}.bank-gateway-grid strong{display:block;color:#17365d;margin-top:2px}
      .bank-verify-btn{margin-top:10px}.bank-verify-note{font-size:12px;color:#5f7188;margin-top:8px}
      @media(max-width:650px){.bank-gateway-grid{grid-template-columns:1fr}.bank-gateway-head{display:block}.bank-gateway-badge{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(s);
  }

  async function getCurrentFdr() {
    const fdrNumber = document.getElementById('reviewFdrNumber')?.textContent?.trim();
    if (!fdrNumber || fdrNumber === '—') throw new Error('Open an FDR review first.');
    const token = localStorage.getItem('securefdr_token');
    const response = await fetch('/api/fdr', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load FDR records.');
    const fdr = (data.fdrs || []).find(x => String(x.fdr_number) === fdrNumber);
    if (!fdr) throw new Error('FDR record not found.');
    return fdr;
  }

  function compare(fdr, bankRecord) {
    const checks = [
      ['FDR number', true],
      ['Issuing bank', String(fdr.bank_name).trim().toLowerCase() === bankRecord.bank.toLowerCase()],
      ['Amount', Number(fdr.amount) === Number(bankRecord.amount)],
      ['Issue date', String(fdr.issue_date).slice(0,10) === bankRecord.issueDate],
      ['Maturity date', String(fdr.expiry_date).slice(0,10) === bankRecord.expiryDate]
    ];
    return checks;
  }

  async function verify() {
    const box = document.getElementById('bankGatewayResult');
    const button = document.getElementById('bankGatewayVerifyBtn');
    button.disabled = true; button.textContent = 'Checking authorized source…';
    box.className = 'bank-gateway-result';
    try {
      const fdr = await getCurrentFdr();
      const bankRecord = DEMO_BANK_GATEWAY.records[String(fdr.fdr_number).trim()];
      if (!bankRecord) {
        box.className = 'bank-gateway-result fail';
        box.innerHTML = '<strong>⚠ No bank response</strong><div class="bank-verify-note">The configured authorized gateway has no matching response for this instrument. Do not mark the FDR bank-verified.</div>';
        return;
      }
      const checks = compare(fdr, bankRecord);
      const passed = bankRecord.verified && checks.every(([, ok]) => ok);
      box.className = `bank-gateway-result ${passed ? 'success' : 'fail'}`;
      box.innerHTML = `<strong>${passed ? '✓ Bank-side confirmation matched' : '✕ Bank-side confirmation failed'}</strong><div class="bank-gateway-grid">${checks.map(([name, ok]) => `<div><span>${name}</span><strong>${ok ? 'PASS' : 'MISMATCH'}</strong></div>`).join('')}<div><span>Bank reference</span><strong>${bankRecord.reference}</strong></div><div><span>Gateway</span><strong>${DEMO_BANK_GATEWAY.name}</strong></div></div><div class="bank-verify-note">${passed ? 'All submitted instrument fields matched the authorized bank response in this demo gateway.' : 'A mismatch was detected. Officer verification should remain pending or be rejected after review.'}</div>`;
      localStorage.setItem(`securefdr_bank_check_${fdr.id}`, JSON.stringify({ passed, reference: bankRecord.reference, checkedAt: new Date().toISOString(), gateway: DEMO_BANK_GATEWAY.name }));
    } catch (error) {
      box.className = 'bank-gateway-result fail';
      box.innerHTML = `<strong>Unable to verify</strong><div class="bank-verify-note">${String(error.message || 'Bank gateway error')}</div>`;
    } finally {
      button.disabled = false; button.textContent = 'Verify with authorized bank';
    }
  }

  function install() {
    css();
    const modal = document.getElementById('reviewModal');
    if (!modal || document.getElementById('bankGatewayBox')) return;
    const noteBox = modal.querySelector('.verification-note-box');
    if (!noteBox) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'bankGatewayBox';
    wrapper.className = 'bank-gateway-box';
    wrapper.innerHTML = `<div class="bank-gateway-head"><div><div class="bank-gateway-title">Authorized bank verification</div><div class="bank-gateway-sub">Independent instrument check before officer decision</div></div><span class="bank-gateway-badge">DEMO / SANDBOX</span></div><button id="bankGatewayVerifyBtn" type="button" class="ghost bank-verify-btn">Verify with authorized bank</button><div id="bankGatewayResult" class="bank-gateway-result"><span class="muted-text">No bank response requested yet.</span></div>`;
    noteBox.after(wrapper);
    document.getElementById('bankGatewayVerifyBtn').addEventListener('click', verify);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
