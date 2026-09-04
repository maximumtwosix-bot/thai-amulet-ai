import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "thai-amulet.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT,
    master TEXT,
    year TEXT,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    district TEXT,
    province TEXT,
    postal_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    channel TEXT,
    payment_method TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    shipping_fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content_type TEXT,
    platform TEXT,
    caption TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    video_url TEXT NOT NULL,
    caption TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    external_post_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- STEP 16: snapshot ต่อครั้งที่ fetch จริงจาก provider (ไม่ใช่แถวเดียวที่ update ทับ) เพื่อให้
  -- aggregate รายวัน/รายเดือนได้ตาม fetched_at — ทุกคอลัมน์ metric เป็น NULL ได้ (ไม่ NOT NULL/ไม่มี
  -- DEFAULT 0) เพราะ "ไม่มีข้อมูล" กับ "ยืนยันว่าเป็น 0 จริง" ต้องแยกกันชัดเจน ไม่ใส่ตัวเลขปลอม
  -- ตาราง social_posts เดิมไม่มีแถวเทียบเท่านี้อยู่แล้ว จึงไม่ใช่ architecture ซ้ำ
  CREATE TABLE IF NOT EXISTS social_post_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    social_post_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    impressions INTEGER,
    views INTEGER,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    saves INTEGER,
    clicks INTEGER,
    engagement_rate REAL,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (social_post_id) REFERENCES social_posts(id)
  );

  -- STEP 18: บันทึกทุกครั้งที่ worker รันจริง (ก่อนหน้านี้ STEP 17 เก็บแค่ใน memory หายเมื่อ
  -- server restart) — status 'running' ถูกตั้งตอนเริ่ม แล้วอัปเดตเป็น 'completed'/'failed' ตอนจบ
  -- เสมอ แถวที่ค้าง 'running' อยู่ (finished_at ยัง NULL) แปลว่า process ตายกลางคัน — ดู
  -- recoverStaleProcessingPosts() ใน socialQueue.ts ที่ทำความสะอาดแถวแบบนี้ตอน worker เริ่มรอบใหม่
  CREATE TABLE IF NOT EXISTS social_worker_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    processed INTEGER,
    published INTEGER,
    failed INTEGER,
    retried INTEGER,
    skipped INTEGER,
    recovered INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- STEP 19: แผนคอนเทนต์ (draft/idea) แยกจาก social_posts โดยเจตนา — content_plans คือ "ร่าง
  -- ความคิด" หลายมุมต่อสินค้า ยังไม่ใช่โพสต์จริง (ไม่มี external_post_id/published_at เหมือน
  -- social_posts) เมื่อผู้ใช้พร้อมโพสต์จริงค่อยส่ง caption/hashtags ของแผนนี้ต่อไปยัง
  -- /api/social/prepare หรือ /api/social/queue (ของเดิมจาก STEP 9/12) — ไม่ผูก FK ตรงไปยัง
  -- social_posts เพราะแผนหนึ่งอาจถูกใช้ซ้ำได้หลายครั้ง/หลาย platform ไม่ใช่ 1:1
  CREATE TABLE IF NOT EXISTS content_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    content_angle TEXT NOT NULL,
    objective TEXT,
    target_audience TEXT,
    hook TEXT,
    caption TEXT NOT NULL,
    cta TEXT,
    hashtags TEXT NOT NULL DEFAULT '[]',
    image_prompt TEXT,
    video_prompt TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    scheduled_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- STEP 20: ชั้นวางแผน "เมื่อไหร่/แพลตฟอร์มไหน" แยกจาก content_plans ("เนื้อหาอะไร", STEP 19)
  -- และ social_posts ("คิวโพสต์จริง", STEP 10/12) โดยเจตนา — ตรวจสอบแล้วว่าไม่สามารถรวมกับตาราง
  -- เดิมได้โดยไม่ทำลาย design เดิม: content_plans ถูกออกแบบให้ 1 แผนใช้ซ้ำได้หลาย slot/platform
  -- (ไม่ใช่ 1:1) ถ้าใส่ scheduled_at/platform ลงไปตรงๆ จะบังคับให้เป็น 1:1 ทันที ส่วน social_posts
  -- มีขึ้นเฉพาะตอนที่ "คิวจริง" แล้วเท่านั้น ไม่มีที่เก็บ slot ที่ยังไม่มีเนื้อหาเลย (AI วางแผนล่วงหน้า
  -- 7 วันต้องมี slot ว่างที่ระบุแค่ วันที่/เวลา/สินค้า/แพลตฟอร์มได้ก่อนมีเนื้อหาจริง) —
  -- content_calendar จึงเป็นตารางใหม่ที่อ้างอิงทั้งสองตารางแบบ nullable (content_plan_id ยังไม่มีก็ได้,
  -- social_post_id จะมีก็ต่อเมื่อถูก schedule เข้าคิวจริงแล้วเท่านั้น)
  --
  -- status ที่เก็บในคอลัมน์นี้ "ไม่เคย" ถูกเขียนเป็น 'published'/'failed' โดยตรงจาก calendar logic
  -- เอง — ค่าเหล่านี้เขียนได้ทางเดียวคือผ่าน syncCalendarStatusFromSocialPost() ที่อ่านสถานะจริงจาก
  -- social_posts แล้ว copy มาเท่านั้น (ดู src/lib/contentCalendar.ts) กันไม่ให้ระบบรายงาน published
  -- ปลอมเด็ดขาด
  CREATE TABLE IF NOT EXISTS content_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_plan_id INTEGER,
    product_id INTEGER NOT NULL,
    platform TEXT,
    content_type TEXT NOT NULL,
    content_angle TEXT,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    social_post_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_plan_id) REFERENCES content_plans(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (social_post_id) REFERENCES social_posts(id)
  );

  CREATE TABLE IF NOT EXISTS ai_video_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    external_job_id TEXT,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    error_message TEXT,
    product_media_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (product_media_id) REFERENCES product_media(id)
  );

  -- STEP 21: บันทึกทุกครั้งที่มีการเรียก AI generation จริง (text/image/video/voice) ไม่ว่าจะ
  -- สำเร็จหรือล้มเหลว — เป็นตาราง accounting/observability เท่านั้น ไม่ใช่กลไกจำกัดจำนวนการสร้าง
  -- (ห้ามใช้ตารางนี้เพื่อ enforce quota/limit ใดๆ) รูปแบบ two-phase เดียวกับ social_worker_runs
  -- (STEP 18): แถวถูกสร้างตอนเริ่ม generation ด้วย status='processing' แล้วอัปเดตเป็น
  -- 'succeeded'/'failed' ตอนจบเสมอ (ดู src/lib/costLedger.ts: recordAiGeneration() /
  -- finalizeAiGenerationCost()) แถวที่ค้าง 'processing' (completed_at ยัง NULL) แปลว่า
  -- request ตายกลางคันหรือกำลังทำงานอยู่จริง
  --
  -- product_id / content_plan_id / media_id / ai_video_job_id เป็น NULL ได้ทั้งหมดโดยเจตนา —
  -- ไม่ใช่ทุก generation จะมี relation ครบ (เช่น voice generation จาก Voice Studio โดยตรงไม่มี
  -- product/content plan ผูกอยู่) การ trace กลับไปยัง entity เหล่านี้ทำได้ "เมื่อข้อมูลมีอยู่จริง" เท่านั้น
  -- ห้าม backfill ค่าเดาเข้าไปแทน NULL
  --
  -- estimated_cost = คำนวณจาก usage จริง (token/ภาพ/วินาที) คูณราคาที่ตั้งค่าไว้ผ่าน environment
  -- (src/lib/costConfig.ts) — เป็นค่าประมาณการเท่านั้น ไม่ใช่ยอดเงินจริง
  -- actual_cost = ต้องมาจาก billing/usage API จริงของ provider เท่านั้น ทั้ง OpenAI และ Replicate
  -- ในสถาปัตยกรรมปัจจุบันไม่มี endpoint คืนค่าใช้จ่ายจริงต่อ request มาให้ ดังนั้น actual_cost จะเป็น
  -- NULL เสมอจนกว่าจะมีการเชื่อมต่อ billing API จริงในอนาคต ห้ามใส่ estimated_cost ลงในคอลัมน์นี้เด็ดขาด
  CREATE TABLE IF NOT EXISTS ai_cost_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    content_plan_id INTEGER,
    media_id INTEGER,
    ai_video_job_id INTEGER,
    provider TEXT NOT NULL,
    model TEXT,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    input_units REAL,
    output_units REAL,
    duration_seconds REAL,
    estimated_cost REAL,
    actual_cost REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (content_plan_id) REFERENCES content_plans(id),
    FOREIGN KEY (media_id) REFERENCES product_media(id),
    FOREIGN KEY (ai_video_job_id) REFERENCES ai_video_jobs(id)
  );


  -- STEP 36: Inventory movement audit trail
  -- Immutable record of every stock movement.
  -- quantity_change: positive = stock in, negative = stock out.
  -- products.stock remains the current stock value.
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id
    ON inventory_movements(product_id);

  CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
    ON inventory_movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_product_id ON ai_cost_ledger(product_id);
  CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_content_plan_id ON ai_cost_ledger(content_plan_id);
  CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_ai_video_job_id ON ai_cost_ledger(ai_video_job_id);
  CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_created_at ON ai_cost_ledger(created_at);

  -- STEP 19: Income & Expense ledger — schema foundation only (no CRUD API/UI yet, see STEP 20).
  -- Append-only financial record, same shape as inventory_movements (STEP 36) / ai_cost_ledger
  -- (STEP 21): one immutable row per transaction, never updated in place except via updated_at on
  -- manual correction. transaction_type/category/sales_channel are free TEXT here (not SQL CHECK
  -- constraints) because every other enum-like column in this codebase (movement_type, status,
  -- provider, operation) is validated in the TS layer, not the DB layer — see src/lib/transactions.ts
  -- for the fixed constant lists (STEP 20 will enforce them on write). amount uses REAL to match
  -- every existing money column (products.price/cost, orders.subtotal/total, ai_cost_ledger.*_cost).
  -- transaction_date is a business date (can be backdated for an old receipt) and is intentionally
  -- separate from created_at (system timestamp of when the row was entered) — no DEFAULT, callers
  -- must always supply it explicitly so a backdated entry can never be silently stamped with "today".
  -- product_id/order_id are nullable by design (not every transaction relates to a specific
  -- product/order, e.g. fuel or ads spend) — FKs declared for documentation/joins only, matching this
  -- codebase's existing convention of not enabling SQLite's FK enforcement pragma, so there is no
  -- cascading delete behavior anywhere here that could ever remove a financial record.
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    sales_channel TEXT,
    product_id INTEGER,
    order_id INTEGER,
    payment_method TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
  CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);
  CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_product_id ON transactions(product_id);

  -- STEP 21: evidence attachments for a transaction (receipt / transfer slip photo) — upload +
  -- display only, no OCR/AI extraction of any kind. Mirrors product_media's shape (file_name +
  -- a /generated/... URL, one row per file) rather than inventing a new pattern. No ON DELETE
  -- CASCADE (same convention as every other table here) — deleteTransaction() in
  -- src/lib/transactions.ts explicitly deletes a transaction's attachment rows (and best-effort
  -- unlinks their files) before deleting the transaction itself, so no orphaned rows/files are left
  -- behind by the app's own delete path; a transaction_id that no longer resolves to a live
  -- transaction (e.g. from manual DB surgery) is otherwise harmless since nothing else joins to
  -- this table.
  CREATE TABLE IF NOT EXISTS transaction_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transaction_attachments_transaction_id
    ON transaction_attachments(transaction_id);

  -- STEP 49: order fulfillment tracking (carrier / tracking number / delivery status) — a distinct
  -- concept from orders.status (approved 2026-09-01), kept as a separate table to avoid conflating
  -- the two: delivery proof photos are evidence *of a physical delivery event*, not transaction
  -- evidence (transaction_attachments, STEP 21). Mirrors transaction_attachments's exact shape.
  -- No ON DELETE CASCADE — same convention as every other table here.
  CREATE TABLE IF NOT EXISTS order_delivery_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_order_delivery_proofs_order_id
    ON order_delivery_proofs(order_id);

  -- STEP B.1 — BankAccount data model (per STEP B audit, approved). Standalone entity: NO FK to
  -- transactions/orders/customers in this round. The STEP B audit found transactions.payment_method
  -- already doing double duty — validated 'transfer'/'cod' on order-linked rows, but in practice also
  -- used (via the Finance AI-extract flow) as free-text bank/channel name, never validated. Rather
  -- than repurpose that column, BankAccount is introduced as a wholly new, independent table;
  -- transactions.payment_method is untouched by this migration and keeps its exact current meaning.
  -- Wiring a real relationship between transactions and bank_accounts is explicitly deferred to a
  -- future STEP (once STEP C/D's BankStatement/Reconciliation shape is known) — adding that FK now,
  -- before the shape is known, is exactly the premature-relation risk the STEP B audit flagged. No
  -- CRUD/API/UI reads or writes this table yet — that starts at STEP B.2.
  --
  -- classification (BUSINESS/PERSONAL/MIXED) is NOT NULL with NO DEFAULT — same convention as
  -- transactions.transaction_date ("no DEFAULT, callers must always supply it explicitly"): the STEP
  -- B audit requires this can never be silently assumed BUSINESS or PERSONAL, so every caller (STEP
  -- B.2's create function) must pass it explicitly. Allowed values, enforced in the TS layer once
  -- STEP B.2 exists (matching this codebase's existing convention for every other enum-like TEXT
  -- column above — transaction_type/category/sales_channel all use TS-layer validation, never a SQL
  -- CHECK constraint): 'BUSINESS' | 'PERSONAL' | 'MIXED'.
  --
  -- account_type is nullable free TEXT — not every account's type is known/relevant at entry time.
  -- Allowed values, once STEP B.2 adds TS-layer validation: 'SAVINGS' | 'CURRENT' | 'OTHER' — no
  -- richer taxonomy, since nothing in the B-K roadmap needs one.
  --
  -- account_number is stored as plain TEXT — the real value, never a masked "****1234" placeholder.
  -- Masking is a display-only concern for a future API layer (STEP B.3): the DB must hold the real
  -- number so duplicate-detection here and any future BankStatement reconciliation (STEP C/D, which
  -- must match real statement numbers against real account numbers) work correctly. This table will
  -- only become reachable once STEP B.4 adds it to src/proxy.ts's session-cookie gate (not part of
  -- this STEP) — same access-control model as every other Finance table.
  --
  -- Uniqueness is (bank_name, account_number) as a COMPOSITE index, not account_number alone: account
  -- numbers are assigned independently per bank, so the same digit string can legitimately belong to
  -- two different banks — a bare UNIQUE on account_number would incorrectly reject that. The
  -- composite index is NOT scoped to is_active — a deactivated account's number still reserves the
  -- slot, so re-adding "the same account" as a second row is rejected; the correct action is
  -- reactivating the existing (deactivated) row, which also keeps any future BankStatement/
  -- Reconciliation relation (STEP C/D) pointed at one single, stable row per real-world account.
  --
  -- is_active (default 1) is the soft-deactivate flag the STEP B audit calls for. Hard DELETE is
  -- intentionally NOT restricted by this table alone right now — there is no transaction/statement/
  -- reconciliation relation yet for a DELETE to need to check against. STEP B.2's CRUD layer must
  -- enforce "block hard delete once linked data exists" the moment such a relation is added (STEP
  -- C/D) — deferred, not forgotten; documented here so it is not missed later.
  --
  -- id remains a plain internal INTEGER surrogate key, same as every other table — account_number is
  -- never used as an identifier/slug/URL parameter anywhere.
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_type TEXT,
    currency TEXT NOT NULL DEFAULT 'THB',
    classification TEXT NOT NULL,
    purpose TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_bank_account_number
    ON bank_accounts(bank_name, account_number);

  CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_active
    ON bank_accounts(is_active);

  -- STEP C.2 — BankStatement + BankStatementTransaction (per STEP C.0/C.1/C.2 audits, approved).
  -- BankStatement anchors one uploaded/imported statement file to exactly one bank_accounts row.
  -- NO relation to transactions (Finance) is created here or anywhere in this migration — STEP C.1
  -- explicitly deferred reconciliation/matching to STEP D; wiring that relation now would be exactly
  -- the premature-relation risk STEP B's audit already flagged once for bank_accounts itself.
  --
  -- Everything describing "what was uploaded" (bank_account_id, source_file_name/hash/url) is meant
  -- to be treated as immutable by every caller from the moment a row exists — this table has no
  -- UPDATE path for those columns in src/lib/bankStatements.ts (STEP C.2), only for status/summary
  -- fields, which is the one part of a statement genuinely expected to change over its lifecycle.
  --
  -- status (STEP C.0 §18 / C.2 §4): TEXT, NOT NULL, DEFAULT 'UPLOADED' — unlike bank_accounts.
  -- classification, a default is safe and correct here because every new statement genuinely starts
  -- life as 'UPLOADED' with no human judgment call being hidden (matches orders.status/
  -- delivery_status's own DEFAULT 'pending' convention, not transactions.transaction_date's
  -- no-default convention). Allowed values, enforced in the TS layer once STEP C.2's library exists
  -- (same convention as every other enum-like TEXT column in this file — never a SQL CHECK):
  -- 'UPLOADED' | 'VALIDATING' | 'PREVIEW_READY' | 'IMPORTING' | 'IMPORTED' | 'FAILED' | 'CANCELLED'.
  --
  -- statement_period_from/_to are nullable — the period is derived from the file's own content or
  -- user-confirmed at preview time (STEP C.0 §9), never guessed at upload before the file is even
  -- parsed.
  --
  -- source_file_hash is SHA-256 (hex) of the raw uploaded file — the file-level idempotency key per
  -- STEP C.1 Decision 5. Uniqueness is (bank_account_id, source_file_hash), a COMPOSITE index, not a
  -- bare unique on the hash alone — same reasoning as bank_accounts' own (bank_name, account_number)
  -- composite from STEP B.1: the same byte-identical file is only meaningfully "the same statement"
  -- for the same account.
  --
  -- source_file_url will point under a NEW protected prefix, /generated/bank-statements/... (STEP
  -- C.2 adds this prefix to src/proxy.ts's isProtectedGeneratedFile()/matcher, mirroring STEP A.5's
  -- exact pattern for transaction-attachments/ai-slip-previews) — never a publicly-fetchable path.
  --
  -- No ON DELETE clause on the bank_account_id FK — matches this file's 100% consistent existing
  -- convention (no table anywhere in this schema uses ON DELETE CASCADE). Combined with this
  -- connection's foreign_keys pragma being ON (confirmed live in the STEP B.7 audit), this means
  -- SQLite will refuse to delete a bank_accounts row that still has a bank_statements row pointing
  -- at it (SQLITE_CONSTRAINT_FOREIGNKEY) — the same structural mechanism that already protects
  -- products today (see src/app/api/products/route.ts's existing catch for that exact error code).
  -- STEP C.2's bankAccounts.ts also adds an app-layer pre-check ahead of this for a friendly error
  -- message; the FK here is the backstop that can never be bypassed by a future code path that
  -- forgets to call it.
  CREATE TABLE IF NOT EXISTS bank_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    source_file_name TEXT NOT NULL,
    source_file_hash TEXT NOT NULL,
    source_file_url TEXT NOT NULL,
    statement_period_from TEXT,
    statement_period_to TEXT,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    row_count_total INTEGER,
    row_count_valid INTEGER,
    row_count_invalid INTEGER,
    row_count_duplicate INTEGER,
    error_summary TEXT,
    imported_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statements_account_file_hash
    ON bank_statements(bank_account_id, source_file_hash);

  CREATE INDEX IF NOT EXISTS idx_bank_statements_bank_account_id
    ON bank_statements(bank_account_id);

  CREATE INDEX IF NOT EXISTS idx_bank_statements_status
    ON bank_statements(status);

  -- STEP C.2 — BankStatementTransaction is immutable source evidence from the bank (STEP C.1
  -- Decision 4) — src/lib/bankStatements.ts provides no UPDATE function for this table at all, only
  -- INSERT (one row at a time; STEP C.3's atomic batch-import orchestration is explicitly out of
  -- scope here) and SELECT. STEP D must never rewrite amount/date/description on an existing row —
  -- any Finance-transaction mapping belongs in a future, separate reconciliation/mapping table that
  -- references rows here by id, never mutates them.
  --
  -- bank_account_id is DELIBERATELY DENORMALIZED from the parent bank_statements row (copied once at
  -- insert time, never updated) — SQLite cannot express a unique constraint across a join, so this
  -- column exists purely so the two transaction-level dedup indexes below can be declared directly
  -- against this table instead of requiring a subquery through bank_statement_id.
  --
  -- Money fields (debit/credit/amount/balance) are INTEGER, in satang (1 THB = 100 satang) — per
  -- STEP C.1 Decision 1: this project has no Prisma/Postgres and SQLite has no true fixed-point
  -- DECIMAL/NUMERIC storage (column affinity is not arbitrary-precision; better-sqlite3 marshals
  -- every number through an IEEE-754 double regardless of declared affinity) — INTEGER minor-units is
  -- the only way to make "never use JS floating point as the financial source of truth" true without
  -- adding a dependency. This is a deliberate, evidence-based departure from every OTHER money column
  -- in this schema (products.price/cost, orders.total, transactions.amount are all REAL) — safe here
  -- specifically because this is a brand-new table with no legacy data to reconcile against that
  -- convention. amount = credit − debit, computed via integer arithmetic in the TS layer at insert
  -- time (src/lib/bankStatements.ts) — positive = inflow/credit, negative = outflow/debit. STEP D
  -- will need to convert transactions.amount (REAL, baht) when comparing against this table's amount
  -- (INTEGER, satang) — documented here so that unit mismatch is never a surprise later.
  --
  -- description is nullable — a real bank statement row can legitimately have sparse/empty
  -- description text; forcing NOT NULL + non-empty would mean rejecting genuine source data, which
  -- STEP C.1's source-of-truth principle forbids.
  --
  -- duplicate_fingerprint is NOT NULL — the composite identity STEP C.1 Decision 5/STEP C.0 §7
  -- describe (bank_account_id + date + amount + direction + description + an occurrence-index
  -- component distinguishing legitimately repeated same-day/same-amount transactions within one
  -- import) — computed by src/lib/bankStatements.ts's caller (STEP C.3), never derived here.
  --
  -- Uniqueness: bank-provided bank_transaction_id is the PREFERRED identity when present (STEP C.1's
  -- BANK_PROVIDED_IDENTIFIER, stronger than any guessed fingerprint) — enforced via a partial unique
  -- index that only applies when the column is non-null, since most rows won't have one. The
  -- fingerprint-based index is the fallback for rows with no bank-provided id. Neither index alone is
  -- a full duplicate-prevention guarantee against a genuinely distinct transaction that happens to
  -- collide across two separate statement uploads — STEP C.0/C.1 already require that case to surface
  -- as a human-reviewable candidate, never a silent block or a silent import; the app-layer decision
  -- of how a user re-confirms "this is genuinely different" (and how that changes the fingerprint
  -- input so a second insert can succeed) is explicitly STEP C.3's job, not built here.
  --
  -- No ON DELETE clause on either FK — same reasoning as bank_statements.bank_account_id above: this
  -- makes deleting a bank_statements row that still has transaction rows fail closed
  -- (SQLITE_CONSTRAINT_FOREIGNKEY) rather than silently cascading away source evidence, matching STEP
  -- C.2's explicit instruction that BankStatement must not cascade-delete its transactions.
  CREATE TABLE IF NOT EXISTS bank_statement_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_statement_id INTEGER NOT NULL,
    bank_account_id INTEGER NOT NULL,
    bank_transaction_id TEXT,
    transaction_date TEXT NOT NULL,
    value_date TEXT,
    description TEXT,
    debit INTEGER,
    credit INTEGER,
    amount INTEGER NOT NULL,
    balance INTEGER,
    raw_row_index INTEGER,
    raw_row_text TEXT,
    duplicate_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_transactions_bank_txn_id
    ON bank_statement_transactions(bank_account_id, bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_transactions_fingerprint
    ON bank_statement_transactions(bank_account_id, duplicate_fingerprint);

  CREATE INDEX IF NOT EXISTS idx_bank_statement_transactions_statement_id
    ON bank_statement_transactions(bank_statement_id);

  -- STEP D.3 — Reconciliation schema, per the approved design in
  -- docs/RECONCILIATION_DATA_MODEL.md (STEP D.2). Two new, wholly separate tables — NO column/FK is
  -- added to bank_statement_transactions, transactions, bank_statements, or bank_accounts by this
  -- migration (Design Principle 4 of that document). Both tables are additive
  -- (CREATE TABLE IF NOT EXISTS) and start empty; no backfill, no ALTER of any existing table.
  --
  -- bank_reconciliation_matches is a many-to-many mapping layer between bank_statement_transactions
  -- (immutable bank source evidence, STEP C.2) and transactions (the business/accounting record,
  -- STEP 20) — it references both by id only and never rewrites either side. Per
  -- docs/RECONCILIATION_DATA_MODEL.md §2:
  --
  -- bank_statement_transaction_id / transaction_id — immutable once a row exists; a wrong link is
  --   fixed by unmatching this row and creating a new one, never by repointing these columns. No
  --   ON DELETE clause on either FK — matches this schema's 100% consistent convention (no table
  --   anywhere here uses ON DELETE CASCADE).
  -- allocated_amount — INTEGER satang (same minor-unit convention as
  --   bank_statement_transactions.amount, STEP C.1 Decision 1 — no FLOAT, no Decimal dependency
  --   available). Signed, same sign convention as the referenced bank row. Sum-bounded invariants
  --   (never exceeding either source row's own amount) and the zero-allocation prohibition are
  --   enforced at the TS layer when a future STEP adds write functions — never a SQL CHECK, matching
  --   this file's 100% consistent convention of validating enum-like/business-rule columns in code,
  --   not the database.
  -- match_strategy — TEXT, NOT NULL, no default (must always be supplied explicitly, same convention
  --   as bank_accounts.classification's "no silent default" reasoning). Allowed values, enforced in
  --   the TS layer (src/lib/reconciliation.ts, this STEP): 'BANK_TRANSACTION_ID' |
  --   'EXACT_DATE_AMOUNT_ACCOUNT' | 'CONSTRAINED_FINGERPRINT' | 'MANUAL'. Purely descriptive of how a
  --   pairing was originally identified — never itself a confirmation signal (see status below).
  -- status — TEXT, NOT NULL, DEFAULT 'SUGGESTED' (a brand-new row genuinely always starts as a
  --   proposal, same reasoning as bank_statements.status's own safe default). Allowed values, TS-layer
  --   enforced: 'SUGGESTED' | 'MATCHED' | 'CONFIRMED' | 'EXCLUDED' | 'UNMATCHED' | 'NEEDS_REVIEW'. The
  --   CONFIRMED transition is never automatic — it requires an explicit human action in every future
  --   caller, regardless of match_strategy.
  -- note — nullable TEXT, required only at the TS layer (not here) when status becomes EXCLUDED or
  --   NEEDS_REVIEW.
  -- confirmed_at/confirmed_by, unmatched_at/unmatched_by — nullable, set-once fields populated only on
  --   their respective transitions. No multi-user identity model exists in this app (single shared
  --   admin session, src/lib/auth.ts) — *_by columns hold a fixed literal, not a real per-user
  --   identity; documented limitation, not a fake user model (docs/RECONCILIATION_DATA_MODEL.md §6).
  --
  -- Uniqueness: idx_bank_reconciliation_matches_active_pair is a PARTIAL unique index — the same
  -- (bank_statement_transaction_id, transaction_id) pair can have at most one row whose status is
  -- currently "active" (SUGGESTED/MATCHED/CONFIRMED/NEEDS_REVIEW), but historical terminal rows
  -- (UNMATCHED/EXCLUDED) for that same pair may coexist, since re-linking the same pair after an
  -- unmatch/un-exclude always creates a NEW row rather than reusing the old one (§10 of the design
  -- doc) — this is the concrete duplicate-mapping/concurrent-double-submit prevention mechanism.
  CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_statement_transaction_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    allocated_amount INTEGER NOT NULL,
    match_strategy TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUGGESTED',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT,
    confirmed_by TEXT,
    unmatched_at TEXT,
    unmatched_by TEXT,
    FOREIGN KEY (bank_statement_transaction_id) REFERENCES bank_statement_transactions(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_bank_txn_id
    ON bank_reconciliation_matches(bank_statement_transaction_id);

  CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_transaction_id
    ON bank_reconciliation_matches(transaction_id);

  CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_status
    ON bank_reconciliation_matches(status);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_active_pair
    ON bank_reconciliation_matches(bank_statement_transaction_id, transaction_id)
    WHERE status IN ('SUGGESTED', 'MATCHED', 'CONFIRMED', 'NEEDS_REVIEW');

  -- STEP D.3 — bank_reconciliation_audit, per docs/RECONCILIATION_DATA_MODEL.md §6. Append-only audit
  -- trail for every human decision (and system-detected NEEDS_REVIEW flag) made against a
  -- bank_reconciliation_matches row — no UPDATE/DELETE function will ever be provided for this table,
  -- same convention as this schema's other immutable audit trails (inventory_movements, STEP 36;
  -- ai_cost_ledger, STEP 21). Deliberately does NOT log SUGGESTED row creation (a system-generated
  -- candidate is not a decision) — only MATCHED/CONFIRMED/UNMATCHED/EXCLUDED/NEEDS_REVIEW_FLAGGED/
  -- RESOLVED actions are recorded. Does NOT denormalize bank_statement_transaction_id/transaction_id
  -- onto this table (unlike bank_statement_transactions.bank_account_id, STEP C.2, which was
  -- denormalized specifically because SQLite cannot express a unique index across a join) — nothing
  -- here needs an index across that join, since match_id's own two FKs are immutable, so
  -- audit -> match -> (bank row, financial row) always resolves correctly via a plain join.
  CREATE TABLE IF NOT EXISTS bank_reconciliation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    performed_by TEXT NOT NULL,
    performed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES bank_reconciliation_matches(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_audit_match_id
    ON bank_reconciliation_audit(match_id);

  CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_audit_performed_at
    ON bank_reconciliation_audit(performed_at);
`);

// STEP 15 — เก็บ duration/size ของวิดีโอที่ดาวน์โหลดสำเร็จจริง (ยืนยันด้วย ffprobe) ไว้แสดงใน UI
// โดยไม่ต้องคำนวณซ้ำทุกครั้งที่โหลดหน้า — แถวเก่า (ยังไม่มี job สำเร็จจริงเลยในระบบนี้) จะเป็น NULL
const aiVideoJobColumns = db
  .prepare("PRAGMA table_info(ai_video_jobs)")
  .all() as Array<{ name: string }>;

const aiVideoJobColumnNames = new Set(aiVideoJobColumns.map((column) => column.name));

if (!aiVideoJobColumnNames.has("duration")) {
  db.exec("ALTER TABLE ai_video_jobs ADD COLUMN duration REAL");
}

if (!aiVideoJobColumnNames.has("file_size")) {
  db.exec("ALTER TABLE ai_video_jobs ADD COLUMN file_size INTEGER");
}

const columns = db
  .prepare("PRAGMA table_info(products)")
  .all() as Array<{ name: string }>;

const columnNames = new Set(columns.map((column) => column.name));

if (!columnNames.has("model")) {
  db.exec("ALTER TABLE products ADD COLUMN model TEXT");
}

if (!columnNames.has("master")) {
  db.exec("ALTER TABLE products ADD COLUMN master TEXT");
}

if (!columnNames.has("year")) {
  db.exec("ALTER TABLE products ADD COLUMN year TEXT");
}

// STEP 23 — Low-stock indicator threshold, per product. DEFAULT 0 so every existing product gets a
// safe, backward-compatible value on migration: with threshold 0, "stock <= low_stock_threshold" is
// only ever true at stock 0 (already-existing "out of stock" behavior) — no pre-existing product
// suddenly starts showing a low-stock warning until its owner explicitly sets a real threshold.
if (!columnNames.has("low_stock_threshold")) {
  db.exec(
    "ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 0"
  );
}

// STEP 12 — ขยาย social_posts ให้รองรับ Queue/Scheduling/Retry โดยไม่ทำลายข้อมูลเดิม
// (แถวเก่าจาก STEP 10 ที่ไม่มีคอลัมน์เหล่านี้จะได้ค่า default ที่ปลอดภัย ไม่ null พัง logic)
const socialPostColumns = db
  .prepare("PRAGMA table_info(social_posts)")
  .all() as Array<{ name: string }>;

const socialPostColumnNames = new Set(
  socialPostColumns.map((column) => column.name)
);

if (!socialPostColumnNames.has("hashtags")) {
  db.exec("ALTER TABLE social_posts ADD COLUMN hashtags TEXT NOT NULL DEFAULT '[]'");
}

if (!socialPostColumnNames.has("scheduled_at")) {
  db.exec("ALTER TABLE social_posts ADD COLUMN scheduled_at TEXT");
}

if (!socialPostColumnNames.has("retry_count")) {
  db.exec("ALTER TABLE social_posts ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
}

if (!socialPostColumnNames.has("updated_at")) {
  db.exec(
    "ALTER TABLE social_posts ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
  );
}

// STEP 13 — แยกแยะรูปสินค้าที่อัปโหลดจริง ("product") กับรูปที่สร้างด้วย AI ("ai") ในตารางเดียวกัน
// แถวเก่าทั้งหมด (ก่อน STEP 13) เป็นรูปอัปโหลดจริงล้วนๆ จึง default เป็น 'product' ให้อัตโนมัติ
// ปลอดภัย ไม่ทำให้ข้อมูลเดิมดูเหมือนเป็นรูป AI
const productMediaColumns = db
  .prepare("PRAGMA table_info(product_media)")
  .all() as Array<{ name: string }>;

const productMediaColumnNames = new Set(
  productMediaColumns.map((column) => column.name)
);

if (!productMediaColumnNames.has("source")) {
  db.exec(
    "ALTER TABLE product_media ADD COLUMN source TEXT NOT NULL DEFAULT 'product'"
  );
}

// STEP 14 — product_media เดิมเก็บได้แค่รูปภาพ (ไม่มีคอลัมน์ type เลย, mapRow() hardcode "image"
// เสมอ) ต้องมี type จริงเพื่อให้วิดีโอที่สร้างด้วย AI แทรกเข้าตารางเดียวกันได้ และไหลผ่าน
// pipeline เดิม (prepareProductMedia → createTimeline → render) โดยไม่ต้องสร้างตารางใหม่ซ้ำซ้อน
// แถวเก่าทั้งหมดเป็นรูปภาพล้วนๆ จึง default เป็น 'image' ให้อัตโนมัติ ปลอดภัย
if (!productMediaColumnNames.has("type")) {
  db.exec("ALTER TABLE product_media ADD COLUMN type TEXT NOT NULL DEFAULT 'image'");
}

// STEP 26 — เพิ่ม product_id ให้ตาราง content (เดิมไม่มีคอลัมน์นี้เลย ทำให้ content ที่บันทึกจาก
// Content Studio ไม่มีทางสืบย้อนกลับไปยัง product ต้นทางได้) เป็น nullable เพราะแถวเก่าก่อน STEP 26
// ไม่มีข้อมูลนี้จริง ห้ามเดาใส่ย้อนหลัง
const contentColumns = db
  .prepare("PRAGMA table_info(content)")
  .all() as Array<{ name: string }>;

const contentColumnNames = new Set(contentColumns.map((column) => column.name));

if (!contentColumnNames.has("product_id")) {
  db.exec("ALTER TABLE content ADD COLUMN product_id INTEGER REFERENCES products(id)");
}

// STEP 49 — order fulfillment tracking. Fully independent of orders.status (approved 2026-09-01):
// no existing row's status/transition behavior is affected. carrier/tracking_number are nullable
// (every existing order, including historical order id 1, gets NULL — not backfilled/guessed).
// delivery_status defaults to 'pending' for every existing order, matching orders.status's own
// DEFAULT 'pending' convention, but is a separate column with its own separate enum
// (src/lib/orderDelivery.ts) — never read or written by updateOrderStatus()/createOrder().
const orderColumns = db
  .prepare("PRAGMA table_info(orders)")
  .all() as Array<{ name: string }>;

const orderColumnNames = new Set(orderColumns.map((column) => column.name));

if (!orderColumnNames.has("carrier")) {
  db.exec("ALTER TABLE orders ADD COLUMN carrier TEXT");
}

if (!orderColumnNames.has("tracking_number")) {
  db.exec("ALTER TABLE orders ADD COLUMN tracking_number TEXT");
}

if (!orderColumnNames.has("delivery_status")) {
  db.exec("ALTER TABLE orders ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'");
}

// STEP C.6 — persists the column mapping (including dateFormat, which is already a field *within*
// BankStatementColumnMapping — src/lib/bankStatementCsv.ts — not a second, duplicate representation)
// that produced a statement's preview, so a PREVIEW_READY statement can be re-parsed on demand by a
// future GET /api/bank-statements/[id] (deterministic: same stored file + same persisted mapping ->
// same rows, every time — the CSV engine is pure), and so POST .../confirm no longer needs the
// client to resubmit the mapping at all (closing the STEP C.4 PREVIEW_MISMATCH-by-resubmitted-mapping
// gap that STEP C.6's audit flagged). Nullable — existing rows created before this column existed
// (none exist in production as of this STEP, verified live) get NULL, never backfilled/guessed;
// every future INSERT (src/lib/bankStatements.ts createBankStatement()) always supplies it, since
// the calling route already validates the mapping's shape before creating the statement row at all.
// Stored as JSON TEXT — this project has no JSON column type (SQLite has none natively) and no
// schema-validation dependency, matching this table's own existing status/enum columns, which are
// also plain TEXT validated in the TS layer, never a native/typed column.
const bankStatementColumns = db
  .prepare("PRAGMA table_info(bank_statements)")
  .all() as Array<{ name: string }>;

const bankStatementColumnNames = new Set(bankStatementColumns.map((column) => column.name));

if (!bankStatementColumnNames.has("column_mapping")) {
  db.exec("ALTER TABLE bank_statements ADD COLUMN column_mapping TEXT");
}

export default db;

