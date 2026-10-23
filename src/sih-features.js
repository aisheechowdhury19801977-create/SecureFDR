const jwt = require('jsonwebtoken');

function sihRouter(pool) {
  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lifecycle_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
        institution_id UUID NOT NULL REFERENCES users(id),
        request_type TEXT NOT NULL CHECK (request_type IN ('RENEWAL','REPLACEMENT','RELEASE','REFUND')),
        amount NUMERIC(14,2),
        reason TEXT,
        reference_no TEXT,
        requested_date DATE,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','COMPLETED')),
        officer_note TEXT,
        decided_by UUID REFERENCES users(id),
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS discrepancy_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
        institution_id UUID NOT NULL REFERENCES users(id),
        issue_type TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED')),
        resolution_note TEXT,
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS lifecycle_fdr_idx ON lifecycle_requests(fdr_id);
      CREATE INDEX IF NOT EXISTS lifecycle_status_idx ON lifecycle_requests(status);
      CREATE INDEX IF NOT EXISTS discrepancy_fdr_idx ON discrepancy_cases(fdr_id);
      CREATE INDEX IF NOT EXISTS discrepancy_status_idx ON discrepancy_cases(status);
    `);
  }

  function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required' });
    try {
      req.sihUser = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function role(...roles) {
    return (req, res, next) => roles.includes(req.sihUser.role)
      ? next()
      : res.status(403).json({ error: 'Insufficient permissions' });
  }

  const router = require('express').Router();

  router.get('/summary', auth, async (req, res) => {
    try {
      await ensureTables();
      const params = [];
      const where = req.sihUser.role === 'INSTITUTION' ? 'WHERE f.institution_id = $1' : '';
      if (where) params.push(req.sihUser.sub);
      const [records, requests, cases] = await Promise.all([
        pool.query(`SELECT f.id, f.fdr_number, f.bank_name, f.amount, f.issue_date, f.expiry_date, f.status, f.document_url,
                           u.name AS institution_name
                    FROM fdr_records f JOIN users u ON u.id=f.institution_id ${where} ORDER BY f.expiry_date ASC`, params),
        pool.query(`SELECT r.*, f.fdr_number, f.bank_name, u.name AS institution_name
                    FROM lifecycle_requests r JOIN fdr_records f ON f.id=r.fdr_id JOIN users u ON u.id=r.institution_id
                    ${where ? 'WHERE r.institution_id = $1' : ''} ORDER BY r.created_at DESC LIMIT 100`, params),
        pool.query(`SELECT d.*, f.fdr_number, f.bank_name, u.name AS institution_name
                    FROM discrepancy_cases d JOIN fdr_records f ON f.id=d.fdr_id JOIN users u ON u.id=d.institution_id
                    ${where ? 'WHERE d.institution_id = $1' : ''} ORDER BY d.created_at DESC LIMIT 100`, params)
      ]);
      const fdrs = records.rows;
      const today = new Date(); today.setHours(0,0,0,0);
      const days = value => Math.ceil((new Date(`${String(value).slice(0,10)}T00:00:00`) - today) / 86400000);
      const duplicates = new Set(fdrs.filter((f, _, a) => a.filter(x => String(x.fdr_number).toLowerCase() === String(f.fdr_number).toLowerCase()).length > 1).map(f => f.id));
      const deadline = fdrs.filter(f => days(f.expiry_date) <= 90 && days(f.expiry_date) >= 0).length;
      const urgent = fdrs.filter(f => days(f.expiry_date) <= 30 && days(f.expiry_date) >= 0).length;
      const critical = fdrs.filter(f => days(f.expiry_date) <= 7 && days(f.expiry_date) >= 0).length;
      const missing = fdrs.filter(f => !f.document_url).length;
      const openCases = cases.rows.filter(c => c.status === 'OPEN' || c.status === 'UNDER_REVIEW').length;
      res.json({
        stats: {
          active: fdrs.filter(f => f.status !== 'EXPIRED').length,
          verified: fdrs.filter(f => f.status === 'VERIFIED').length,
          pending: fdrs.filter(f => ['SUBMITTED','UNDER_REVIEW'].includes(f.status)).length,
          expired: fdrs.filter(f => f.status === 'EXPIRED' || days(f.expiry_date) < 0).length,
          renewal90: deadline, urgent30: urgent, critical7: critical, missingDocuments: missing,
          discrepancies: duplicates.size + openCases
        },
        records: fdrs,
        lifecycleRequests: requests.rows,
        discrepancyCases: cases.rows
      });
    } catch (error) {
      console.error('SIH summary error:', error);
      res.status(500).json({ error: 'Unable to load SIH compliance summary' });
    }
  });

  router.post('/lifecycle', auth, async (req, res) => {
    const { fdrId, requestType, amount, reason, referenceNo, requestedDate } = req.body;
    const allowed = ['RENEWAL','REPLACEMENT','RELEASE','REFUND'];
    if (!fdrId || !allowed.includes(requestType)) return res.status(400).json({ error: 'FDR and valid lifecycle request type are required' });
    try {
      await ensureTables();
      const fdrResult = await pool.query('SELECT id, institution_id, amount, status FROM fdr_records WHERE id=$1', [fdrId]);
      const fdr = fdrResult.rows[0];
      if (!fdr) return res.status(404).json({ error: 'FDR not found' });
      if (req.sihUser.role === 'INSTITUTION' && fdr.institution_id !== req.sihUser.sub) return res.status(403).json({ error: 'Insufficient permissions' });
      if (['RELEASE','REFUND'].includes(requestType) && (!(Number(amount) > 0) || Number(amount) > Number(fdr.amount))) {
        return res.status(400).json({ error: 'Requested amount must be positive and cannot exceed the FDR amount' });
      }
      if (['RELEASE','REFUND'].includes(requestType) && !String(reason || '').trim()) return res.status(400).json({ error: 'Reason is required for release/refund requests' });
      const result = await pool.query(`INSERT INTO lifecycle_requests
        (fdr_id,institution_id,request_type,amount,reason,reference_no,requested_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [fdrId, fdr.institution_id, requestType, Number(amount) > 0 ? amount : null, String(reason || '').trim() || null, String(referenceNo || '').trim() || null, requestedDate || null]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,'LIFECYCLE_REQUEST','FDR',$2,$3)`,
        [req.sihUser.sub, fdrId, JSON.stringify({ requestType, amount, referenceNo })]);
      res.status(201).json({ request: result.rows[0] });
    } catch (error) {
      console.error('Lifecycle request error:', error);
      res.status(500).json({ error: 'Unable to create lifecycle request' });
    }
  });

  router.patch('/lifecycle/:id', auth, role('OFFICER','ADMIN'), async (req, res) => {
    const { status, officerNote } = req.body;
    const allowed = ['UNDER_REVIEW','APPROVED','REJECTED','COMPLETED'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid lifecycle status' });
    try {
      await ensureTables();
      const result = await pool.query(`UPDATE lifecycle_requests SET status=$1, officer_note=$2, decided_by=$3, decided_at=NOW()
        WHERE id=$4 RETURNING *`, [status, String(officerNote || '').trim() || null, req.sihUser.sub, req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Lifecycle request not found' });
      await pool.query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,'LIFECYCLE_STATUS','FDR',$2,$3)`,
        [req.sihUser.sub, result.rows[0].fdr_id, JSON.stringify({ requestId:req.params.id, status, officerNote })]);
      res.json({ request: result.rows[0] });
    } catch (error) {
      console.error('Lifecycle status error:', error);
      res.status(500).json({ error: 'Unable to update lifecycle request' });
    }
  });

  router.post('/discrepancies', auth, role('OFFICER','ADMIN'), async (req, res) => {
    const { fdrId, issueType, description } = req.body;
    if (!fdrId || !issueType || !String(description || '').trim()) return res.status(400).json({ error: 'FDR, issue type and description are required' });
    try {
      await ensureTables();
      const fdr = await pool.query('SELECT institution_id FROM fdr_records WHERE id=$1', [fdrId]);
      if (!fdr.rows[0]) return res.status(404).json({ error: 'FDR not found' });
      const result = await pool.query(`INSERT INTO discrepancy_cases(fdr_id,institution_id,issue_type,description)
        VALUES($1,$2,$3,$4) RETURNING *`, [fdrId, fdr.rows[0].institution_id, String(issueType).slice(0,100), String(description).trim().slice(0,2000)]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,'DISCREPANCY_CREATED','FDR',$2,$3)`,
        [req.sihUser.sub, fdrId, JSON.stringify({ issueType })]);
      res.status(201).json({ discrepancy: result.rows[0] });
    } catch (error) {
      console.error('Discrepancy create error:', error);
      res.status(500).json({ error: 'Unable to create discrepancy case' });
    }
  });

  router.patch('/discrepancies/:id', auth, role('OFFICER','ADMIN'), async (req, res) => {
    const { status, resolutionNote } = req.body;
    if (!['UNDER_REVIEW','RESOLVED','DISMISSED'].includes(status)) return res.status(400).json({ error: 'Invalid discrepancy status' });
    try {
      await ensureTables();
      const result = await pool.query(`UPDATE discrepancy_cases SET status=$1,resolution_note=$2,resolved_by=$3,resolved_at=NOW()
        WHERE id=$4 RETURNING *`, [status, String(resolutionNote || '').trim() || null, req.sihUser.sub, req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Discrepancy case not found' });
      await pool.query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,'DISCREPANCY_STATUS','FDR',$2,$3)`,
        [req.sihUser.sub, result.rows[0].fdr_id, JSON.stringify({ caseId:req.params.id, status })]);
      res.json({ discrepancy: result.rows[0] });
    } catch (error) {
      console.error('Discrepancy status error:', error);
      res.status(500).json({ error: 'Unable to update discrepancy case' });
    }
  });

  router.get('/report', auth, async (req, res) => {
    try {
      await ensureTables();
      const params = [];
      let where = '';
      if (req.sihUser.role === 'INSTITUTION') { params.push(req.sihUser.sub); where = 'WHERE f.institution_id=$1'; }
      const result = await pool.query(`SELECT f.fdr_number,f.bank_name,f.amount,f.issue_date,f.expiry_date,f.status,
        u.name AS institution_name, COUNT(DISTINCT d.id) AS discrepancy_count, COUNT(DISTINCT r.id) AS lifecycle_request_count
        FROM fdr_records f JOIN users u ON u.id=f.institution_id
        LEFT JOIN discrepancy_cases d ON d.fdr_id=f.id LEFT JOIN lifecycle_requests r ON r.fdr_id=f.id
        ${where} GROUP BY f.id,u.name ORDER BY f.expiry_date ASC`, params);
      res.json({ report: result.rows, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.error('SIH report error:', error);
      res.status(500).json({ error: 'Unable to generate report' });
    }
  });

  return router;
}

module.exports = sihRouter;
