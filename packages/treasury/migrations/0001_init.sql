CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  discord_id TEXT UNIQUE
);

CREATE TABLE batches (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  pdf_key TEXT,
  submitted_at TEXT,
  reimbursed_at TEXT
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members (id),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  vendor TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('Competitions', 'Events', 'Gear', 'Merchandise', 'Trips', 'Website')
  ),
  discipline TEXT CHECK (discipline IN ('Flatwater', 'Polo', 'Whitewater')),
  receipt_key TEXT,
  receipt_sha256 TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'submitted',
      'changes_requested',
      'approved',
      'rejected',
      'signed_off',
      'submitted_to_sus',
      'reimbursed'
    )
  ),
  batch_id INTEGER REFERENCES batches (id),
  source TEXT NOT NULL CHECK (source IN ('import', 'discord')),
  import_key TEXT UNIQUE,
  discord_thread_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX expenses_status ON expenses (status);
CREATE INDEX expenses_receipt_sha256 ON expenses (receipt_sha256);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses (id),
  member_id INTEGER NOT NULL REFERENCES members (id),
  decision TEXT NOT NULL CHECK (
    decision IN ('approve', 'request_changes', 'reject', 'sign_off')
  ),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (decision IN ('approve', 'sign_off') OR note IS NOT NULL)
);

CREATE INDEX reviews_expense_id ON reviews (expense_id);
