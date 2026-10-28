CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('INSTITUTION', 'OFFICER', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fdr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES users(id),
  fdr_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','VERIFIED','REJECTED','EXPIRING','EXPIRED')),
  document_name TEXT,
  document_url TEXT,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  verification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fdr_records
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

CREATE TABLE IF NOT EXISTS fdr_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
  new_fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('RENEWAL','REPLACEMENT')),
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(old_fdr_id, new_fdr_id, relation_type)
);

CREATE TABLE IF NOT EXISTS lifecycle_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('RELEASE','REFUND')),
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  reason TEXT NOT NULL,
  reference_number TEXT,
  preferred_date DATE,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','COMPLETED')),
  officer_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discrepancy_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fdr_id UUID NOT NULL REFERENCES fdr_records(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL CHECK (case_type IN ('DUPLICATE','MISSING_DOCUMENT','DATA_MISMATCH','DATE_INVALID','OTHER')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED')),
  officer_note TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fdr_institution_idx ON fdr_records(institution_id);
CREATE INDEX IF NOT EXISTS fdr_expiry_idx ON fdr_records(expiry_date);
CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS fdr_verified_by_idx ON fdr_records(verified_by);
CREATE INDEX IF NOT EXISTS fdr_relations_old_idx ON fdr_relations(old_fdr_id);
CREATE INDEX IF NOT EXISTS fdr_relations_new_idx ON fdr_relations(new_fdr_id);
CREATE INDEX IF NOT EXISTS lifecycle_fdr_idx ON lifecycle_requests(fdr_id);
CREATE INDEX IF NOT EXISTS lifecycle_status_idx ON lifecycle_requests(status);
CREATE INDEX IF NOT EXISTS discrepancy_fdr_idx ON discrepancy_cases(fdr_id);
CREATE INDEX IF NOT EXISTS discrepancy_status_idx ON discrepancy_cases(status);
