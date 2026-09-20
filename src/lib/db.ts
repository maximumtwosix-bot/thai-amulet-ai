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

  -- STEP 93 (PIT-1) — Personal Income Tax filing foundation, per the approved TAX audit
  -- (Personal Taxpayer Profile & Tax Year Foundation). Named "PIT-1" rather than reusing "TAX-1" —
  -- that label already belongs to the earlier cancelled-order tax-export-warning STEP (commit
  -- 17a1b6b, see PROJECT_STATUS.md) and reusing it here would collide with that existing history.
  --
  -- Two wholly new, standalone tables. NO column/FK is added to transactions, orders, customers,
  -- products, or any existing table by this migration — additive only, per the audit's explicit
  -- constraint. Neither table is read or written by any existing STEP 22/37/TAX-1..3 code path
  -- (taxSummary.ts / profitSummary.ts / the tax export) — this STEP does not change any of their
  -- behavior or output.
  --
  -- taxpayer_profiles represents the shop owner as an individual Revenue-Department taxpayer —
  -- deliberately separate from "customers" (which holds the shop's own buyers, an unrelated concept)
  -- and from the env-var-based admin login identity in src/lib/auth.ts (which authenticates *access
  -- to this app*, not *who the taxpayer is*). Per the user-confirmed profile this STEP was scoped
  -- against: taxpayer_type is fixed to 'INDIVIDUAL' only for now (TS-layer validated, see
  -- src/lib/taxpayerProfile.ts) — not a SQL CHECK, matching this file's 100% consistent convention
  -- for every other enum-like TEXT column (transaction_type, classification, status, ...).
  --
  -- taxpayer_id is the individual's Revenue-Department taxpayer identification number (same 13-digit
  -- numeric national ID standard used for Thai individual taxpayers — a stable civil-registration
  -- format, not a tax-rate/threshold/deadline figure, so validating its shape does not require the
  -- "do not guess current tax law" verification this audit otherwise insists on). Sensitive in the
  -- same way bank_accounts.account_number is (STEP B.1) — stored as the real plain value here, with
  -- masking left to the API layer (src/app/api/tax/taxpayer-profile/route.ts), exactly matching that
  -- table's existing precedent.
  --
  -- vat_registered / wht_applicable are INTEGER 0/1 booleans, NOT NULL with NO DEFAULT — same
  -- reasoning as bank_accounts.classification's "no silent default": these are the user's own
  -- confirmed business facts, never something this schema should default/assume on their behalf.
  --
  -- filing_form is nullable free TEXT, deliberately NOT constrained to any enum (e.g. NOT
  -- ('90'|'91'|'94')) — the audit's explicit instruction is that the applicable Revenue Department
  -- filing form must remain unconfirmed/nullable until verified against current official guidance;
  -- hardcoding a fixed set of allowed values here would itself be exactly the kind of legal
  -- assumption this STEP is forbidden from making. Left NULL until a future STEP records a
  -- verified value.
  --
  -- is_active follows bank_accounts.is_active's exact convention (NOT NULL DEFAULT 1 — a brand-new
  -- profile genuinely always starts active, no human judgment hidden by this particular default).
  CREATE TABLE IF NOT EXISTS taxpayer_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    taxpayer_id TEXT NOT NULL,
    taxpayer_type TEXT NOT NULL,
    vat_registered INTEGER NOT NULL,
    wht_applicable INTEGER NOT NULL,
    filing_form TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_taxpayer_profiles_is_active
    ON taxpayer_profiles(is_active);

  -- STEP 93 (PIT-1) — tax_years: one taxpayer's tax-year lifecycle record. References
  -- taxpayer_profiles by id only, same FK-without-ON-DELETE-CASCADE convention as every other table
  -- in this schema (a taxpayer_profiles row with tax_years attached simply cannot be deleted while
  -- they exist, once foreign_keys enforcement — confirmed live per the STEP B.7 audit — applies).
  --
  -- status is TEXT NOT NULL DEFAULT 'OPEN' — matches bank_statements.status's "safe default"
  -- reasoning (STEP C.2): a brand-new tax year genuinely always starts OPEN, no human judgment is
  -- hidden by this default. Allowed values, TS-layer enforced only (src/lib/taxYears.ts), never a SQL
  -- CHECK, matching every other enum-like column here: 'OPEN' | 'FINALIZED' | 'LOCKED'. Valid forward
  -- transitions are OPEN -> FINALIZED and FINALIZED -> LOCKED only; LOCKED is terminal. This STEP
  -- implements no tax calculation, so nothing besides the status value itself is protected by
  -- "locked" yet — a future STEP that adds calculated figures must gate their mutability on this
  -- status.
  --
  -- Uniqueness: (taxpayer_profile_id, tax_year) as a COMPOSITE unique index, same pattern as
  -- bank_accounts' (bank_name, account_number) and bank_statements' (bank_account_id,
  -- source_file_hash) — the same tax year can exist once per taxpayer, but nothing here assumes only
  -- one taxpayer_profiles row will ever exist.
  CREATE TABLE IF NOT EXISTS tax_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taxpayer_profile_id INTEGER NOT NULL,
    tax_year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taxpayer_profile_id) REFERENCES taxpayer_profiles(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_years_taxpayer_year
    ON tax_years(taxpayer_profile_id, tax_year);

  CREATE INDEX IF NOT EXISTS idx_tax_years_taxpayer_profile_id
    ON tax_years(taxpayer_profile_id);

  CREATE INDEX IF NOT EXISTS idx_tax_years_status
    ON tax_years(status);

  -- STEP 94 — Personal Income Tax / WHT Foundation, additive on top of STEP 93's taxpayer_profiles/
  -- tax_years. Scoped strictly to Type A withholding only — tax WITHHELD FROM this taxpayer's own
  -- income (e.g. a platform or B2B customer withholding at source before paying the shop). Type B
  -- (this taxpayer withholding tax from payments made to others, e.g. a service provider) is a
  -- DIFFERENT workflow with its own counterparty semantics and its own separate filing obligation —
  -- explicitly out of scope for this table and not represented by any column here (per the STEP
  -- audit's explicit instruction not to conflate the two).
  --
  -- NO WHT rate, income-category classification, filing-form reference, or computed credit/net
  -- figure is stored anywhere in this table — this STEP records only the raw facts of a real WHT
  -- certificate/event, never a calculated or assumed legal figure.
  --
  -- taxpayer_profile_id is DELIBERATELY DENORMALIZED from tax_years.taxpayer_profile_id (copied
  -- once at insert time from the referenced tax_years row, never independently supplied by the
  -- caller, never updated after) — same rationale as bank_statement_transactions.bank_account_id
  -- (STEP C.2): SQLite cannot express a unique constraint across a join, and duplicate-certificate
  -- detection below needs one directly against this table.
  --
  -- tax_year_id is NOT NULL — every WHT record must belong to a tax year, both so it is findable for
  -- filing prep and so its mutability can be gated on that year's lifecycle (see below). transaction_id
  -- is NULLABLE — a real WHT certificate does not always map 1:1 onto one existing "transactions" row
  -- (e.g. a platform's single consolidated monthly certificate covering many sales), so requiring one
  -- would reject genuine data. No ON DELETE clause on any FK — same 100%-consistent convention as
  -- every other table in this schema.
  --
  -- Evidence: when transaction_id IS set, evidence (the certificate photo/PDF) is uploaded through
  -- the EXISTING transaction_attachments mechanism (STEP 21) against that same transaction id — zero
  -- schema/API change to transaction_attachments, zero new file-storage system. When transaction_id
  -- is NULL, there is currently no evidence-attachment path for that record — a known, documented
  -- limitation of this foundation STEP, not solved here.
  --
  -- payer_name is NOT NULL (who withheld — e.g. a platform or customer name); payer_tax_id is
  -- nullable free TEXT with no format assumption (the payer may be a foreign entity, an individual,
  -- or a company — unlike taxpayer_profiles.taxpayer_id, which the user confirmed is specifically a
  -- Thai individual's 13-digit ID, the payer's identifier shape is not a known, confirmed fact).
  --
  -- certificate_number / certificate_date are both nullable — a record may legitimately be entered
  -- before the physical certificate is in hand. certificate_number is the identity used for the
  -- duplicate-prevention index below once it exists.
  --
  -- gross_amount / withheld_amount are REAL baht — matching transactions.amount's existing
  -- convention (this table describes the same real-world baht figures a "transactions" row would),
  -- not bank_statement_transactions' satang convention, which was adopted there for a specific,
  -- documented reconciliation-precision reason that does not apply here. TS-layer validation (see
  -- src/lib/whtRecords.ts) enforces withheld_amount > 0 and <= gross_amount — a basic arithmetic
  -- sanity guard (withholding cannot exceed its own base), NOT a WHT-rate legal assertion.
  --
  -- Mutability: this table intentionally has NO status/immutability column of its own. Instead,
  -- src/lib/whtRecords.ts blocks both creating a new WHT record against, and updating any existing
  -- WHT record under, a tax_years row whose status is not 'OPEN' — reusing STEP 93's own tax-year
  -- lifecycle exactly as that STEP's schema comment anticipated ("a future STEP that adds calculated
  -- figures must gate their mutability on this status"), rather than inventing a second status enum
  -- here. No DELETE function is provided at all (same precedent as taxpayer_profiles/tax_years) — a
  -- WHT record is real financial evidence; mistakes are corrected via update while still OPEN, never
  -- removed.
  CREATE TABLE IF NOT EXISTS wht_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taxpayer_profile_id INTEGER NOT NULL,
    tax_year_id INTEGER NOT NULL,
    transaction_id INTEGER,
    payer_name TEXT NOT NULL,
    payer_tax_id TEXT,
    certificate_number TEXT,
    certificate_date TEXT,
    gross_amount REAL NOT NULL,
    withheld_amount REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taxpayer_profile_id) REFERENCES taxpayer_profiles(id),
    FOREIGN KEY (tax_year_id) REFERENCES tax_years(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wht_records_taxpayer_profile_id
    ON wht_records(taxpayer_profile_id);

  CREATE INDEX IF NOT EXISTS idx_wht_records_tax_year_id
    ON wht_records(tax_year_id);

  CREATE INDEX IF NOT EXISTS idx_wht_records_transaction_id
    ON wht_records(transaction_id);

  -- Duplicate-certificate prevention: the same certificate number cannot be recorded twice for the
  -- same taxpayer. Partial unique index (same pattern as bank_statement_transactions' bank-provided-
  -- id index, STEP C.2) — only applies once certificate_number is actually populated, since a record
  -- may legitimately be entered before the physical certificate arrives.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wht_records_taxpayer_certificate
    ON wht_records(taxpayer_profile_id, certificate_number)
    WHERE certificate_number IS NOT NULL;

  -- STEP 96 — Tax-Year Data Immutability / Transaction Audit Trail. Two new, wholly separate,
  -- additive tables — per the STEP 95 audit's finding that a FINALIZED/LOCKED tax_years row
  -- currently protects nothing except wht_records (STEP 94), while "transactions" and
  -- "transaction_attachments" (the actual source of any filing figure) remain freely editable/
  -- deletable with zero audit trail. NO column is added to "transactions",
  -- "transaction_attachments", "orders", "order_items", "customers", or "products" by this
  -- migration — the STEP 95 follow-up audit deliberately chose a mapping-layer design over adding a
  -- tax_year_id column directly onto "transactions", specifically so every existing query against
  -- that table (including the AI assistant's tools and taxSummary.ts/profitSummary.ts) is
  -- byte-for-byte unaffected. Orders/order_items are explicitly OUT of scope for this STEP's lock —
  -- they have no delete path at all (confirmed via audit) and were not named in the STEP 95 gap list.
  --
  -- tax_year_transaction_links is the traceability layer: at most one row per transaction_id
  -- (UNIQUE), pointing at the tax_years row that transaction is currently assigned to. Starts
  -- completely empty for every existing transaction — NOT a backfill, an honest "not yet classified"
  -- state, exactly matching this schema's existing convention for additive nullable relationships
  -- (see bank_statements.column_mapping, STEP C.6: "existing rows... get NULL, never backfilled/
  -- guessed"). A transaction with no row here is completely unaffected by any tax-year lock, exactly
  -- as it behaves today — this STEP changes nothing about existing data until a future write
  -- explicitly opts a transaction into a tax year via src/lib/taxYearTransactionLinks.ts.
  --
  -- Mutating this table itself is gated the same way wht_records is (src/lib/taxYearTransactionLinks.ts):
  -- creating, replacing, or removing a link requires the TARGET/CURRENT tax year to be OPEN — this
  -- is what prevents "unlink the transaction from its locked year to bypass the lock" as an escape
  -- hatch.
  CREATE TABLE IF NOT EXISTS tax_year_transaction_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    tax_year_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (tax_year_id) REFERENCES tax_years(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_year_transaction_links_transaction_id
    ON tax_year_transaction_links(transaction_id);

  CREATE INDEX IF NOT EXISTS idx_tax_year_transaction_links_tax_year_id
    ON tax_year_transaction_links(tax_year_id);

  -- tax_audit_log — append-only audit trail for every mutation of tax-relevant data (transactions,
  -- transaction_attachments, wht_records, taxpayer_profiles, tax_years, and this linking table
  -- itself). Same "no UPDATE/DELETE function will ever be provided" convention as
  -- bank_reconciliation_audit (STEP D.3) / inventory_movements (STEP 36) / ai_cost_ledger (STEP 21) —
  -- enforced purely by never writing one in src/lib/taxAuditLog.ts, since this schema's established
  -- convention is TS-layer discipline, not SQL-level restrictions, for this kind of guarantee.
  --
  -- entity_type / entity_id together identify the mutated row (polymorphic reference — entity_type
  -- varies which table entity_id points into, e.g. 'transaction' | 'transaction_attachment' |
  -- 'wht_record' | 'taxpayer_profile' | 'tax_year' | 'tax_year_transaction_link' — enforced in the TS
  -- layer, src/lib/taxAuditLog.ts). No single FK is possible here for exactly that reason, same as
  -- any polymorphic audit-log design.
  --
  -- actor is a fixed literal constant (see src/lib/taxAuditLog.ts) — this codebase's session token
  -- (src/lib/auth.ts createSessionToken()) encodes only {exp}, no username/user id at all, for a
  -- single shared admin credential. This is NOT a per-user audit trail and must never be represented
  -- as one — same documented limitation already established for bank_reconciliation_matches'
  -- confirmed_by/unmatched_by columns.
  --
  -- before_data / after_data are JSON TEXT snapshots of the affected row at the moment of mutation
  -- (before_data NULL for CREATE, after_data NULL for DELETE) — this is a per-mutation audit record,
  -- explicitly NOT a Filing Package snapshot (that remains a future STEP's job, per instructions).
  --
  -- prev_hash / row_hash implement a hash chain (SHA-256, Node's built-in crypto — zero new
  -- dependency): row_hash = sha256(prev_hash + this row's own content), prev_hash = the immediately
  -- preceding row's row_hash (a fixed genesis constant for the very first row ever, see
  -- src/lib/taxAuditLog.ts). This makes any row altered outside the application (e.g. direct SQL)
  -- detectable by recomputing the chain and finding a mismatch — a stronger guarantee than "no
  -- update function exists" alone, chosen per the STEP 95 audit's "audit trail + hash" design option.
  CREATE TABLE IF NOT EXISTS tax_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    before_data TEXT,
    after_data TEXT,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tax_audit_log_entity
    ON tax_audit_log(entity_type, entity_id);

  CREATE INDEX IF NOT EXISTS idx_tax_audit_log_occurred_at
    ON tax_audit_log(occurred_at);

  -- STEP 100 — Tax Document Recovery Foundation. Three new, wholly additive tables. NO column is
  -- added to "transactions", "transaction_attachments", "orders", "order_items", "customers", or
  -- "products" by this migration, and reconciliation ("bank_reconciliation_matches"/"_audit",
  -- "bank_statements"/"bank_statement_transactions") is untouched — none of it was needed for this
  -- STEP's approved scope. This closes the STEP 99 audit's Blocker 1 (no standalone document store)
  -- and Blocker 2 (no month/period entity or gap-state vocabulary); Blocker 3 (persisted human-review
  -- state) is closed by tax_documents.review_status below. No tax calculation, WHT-applicability
  -- decision, gross/net determination, or VAT-registration conclusion is made anywhere here — this
  -- STEP only stores evidence and human-set classification/status, exactly per its approved scope.
  --
  -- tax_periods — a month within a tax year, additive on top of STEP 93's tax_years. Not
  -- auto-created for every month (no backfill) — a period row is created on demand, only when the
  -- owner actually starts organizing evidence for that month. status is a lifecycle distinct from
  -- tax_years' own OPEN/FINALIZED/LOCKED (STEP 93) — this is a working-evidence status, not a legal
  -- filing lock — per the STEP 97.2/99 audit's own proposed vocabulary
  -- (OPEN/PROCESSING/NEEDS_REVIEW/VERIFIED/CLOSED). TS-layer validated only (src/lib/taxPeriods.ts),
  -- never a SQL CHECK, matching this schema's 100% consistent convention. CLOSED is terminal (no
  -- further status change once reached) — same "terminal state" precedent as tax_years.LOCKED.
  CREATE TABLE IF NOT EXISTS tax_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_year_id INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_year_id) REFERENCES tax_years(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_periods_year_month
    ON tax_periods(tax_year_id, period_month);

  CREATE INDEX IF NOT EXISTS idx_tax_periods_tax_year_id
    ON tax_periods(tax_year_id);

  -- tax_documents — the standalone evidence store the STEP 99 audit found necessary: unlike
  -- transaction_attachments (STEP 21, transaction_id NOT NULL), a document here can exist before any
  -- transaction or period is known, and is linked to either later, once a human (or a future,
  -- separately-approved extraction step) determines the match. Both FKs are nullable by design.
  --
  -- taxpayer_profile_id is NOT NULL and independent of tax_period_id specifically because
  -- tax_period_id can be NULL — without a direct taxpayer reference, an unclassified document would
  -- have no owner at all. Same denormalization reasoning already used for wht_records.taxpayer_profile_id
  -- (STEP 94/96): needed here so the (taxpayer_profile_id, file_hash) unique index below can exist
  -- without requiring a join through a nullable relation.
  --
  -- original_filename is stored and NEVER used to derive the on-disk file_name (which remains a
  -- generated, server-side UUID-based name, same convention as transaction_attachments) — this fixes
  -- the STEP 99 Audit B.2 finding that transaction_attachments discards the user's original filename.
  --
  -- file_hash is SHA-256 hex of the raw uploaded file, same convention as bank_statements.source_file_hash
  -- (STEP C.1/C.2). Uniqueness is (taxpayer_profile_id, file_hash), a COMPOSITE index — same pattern
  -- as bank_accounts'/bank_statements'/wht_records' own composite uniqueness precedents — so the
  -- exact same file cannot be recorded twice for the same taxpayer. This catches an exact re-upload;
  -- it does NOT catch a logically-identical document re-exported with different bytes (a known,
  -- documented limitation carried forward from the STEP 99 audit's own finding on this exact point,
  -- not solved here).
  --
  -- document_type is nullable free TEXT (TS-layer enum once populated, src/lib/taxDocuments.ts) — a
  -- document may exist unclassified; classification is a foundation, not a mandatory gate, per the
  -- STEP 99 audit's Section E finding.
  --
  -- source is nullable free TEXT (TS-layer enum) — where this document came from (e.g. tiktok,
  -- facebook, bank, manual) — descriptive only, never used to infer tax treatment.
  --
  -- document_date / statement_period_from / statement_period_to are all nullable and independent of
  -- each other and of tax_period_id — per the STEP 99 Section H finding that a document's own issue
  -- date, the period it covers, and the tax period a human assigns it to must never be collapsed into
  -- one field. statement_period_from/_to mirrors bank_statements' own existing two-column convention
  -- (STEP C.2) rather than inventing a new shape for the same kind of fact.
  --
  -- review_status is NOT NULL DEFAULT 'UPLOADED' — every new document starts there, matching this
  -- schema's "safe, non-judgmental default" convention (e.g. bank_statements.status DEFAULT
  -- 'UPLOADED', STEP C.2, chosen for the exact same reason: a brand-new row's status is a genuine,
  -- non-assumption-laden fact). Allowed values, TS-layer enforced only (src/lib/taxDocuments.ts):
  -- 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED' | 'DUPLICATE'
  -- | 'FAILED'. CONFIRMED is the one terminal value (no further change once reached) — this is the
  -- concrete mechanism behind the STEP 99 audit's own rule "AI may propose, AI may never confirm on
  -- the owner's behalf": nothing in this STEP ever sets review_status to CONFIRMED except an explicit
  -- API call representing a human decision (no AI/OCR/extraction code exists anywhere in this STEP at
  -- all, per its approved scope).
  --
  -- No ON DELETE clause on any FK — same 100%-consistent convention as every other table in this
  -- schema. No hard-delete function exists in src/lib/taxDocuments.ts (matching taxpayer_profiles/
  -- tax_years/wht_records' own no-delete precedent) — evidence, once recorded, is not removed by this
  -- STEP's own API surface.
  CREATE TABLE IF NOT EXISTS tax_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taxpayer_profile_id INTEGER NOT NULL,
    tax_period_id INTEGER,
    transaction_id INTEGER,
    document_type TEXT,
    source TEXT,
    original_filename TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    document_date TEXT,
    statement_period_from TEXT,
    statement_period_to TEXT,
    review_status TEXT NOT NULL DEFAULT 'UPLOADED',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taxpayer_profile_id) REFERENCES taxpayer_profiles(id),
    FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_documents_taxpayer_hash
    ON tax_documents(taxpayer_profile_id, file_hash);

  CREATE INDEX IF NOT EXISTS idx_tax_documents_tax_period_id
    ON tax_documents(tax_period_id);

  CREATE INDEX IF NOT EXISTS idx_tax_documents_transaction_id
    ON tax_documents(transaction_id);

  CREATE INDEX IF NOT EXISTS idx_tax_documents_review_status
    ON tax_documents(review_status);

  -- tax_period_evidence_status — the gap-state vocabulary from the STEP 97.2/99 audits
  -- (FOUND/MISSING/EXPECTED_BUT_MISSING/NOT_APPLICABLE/UNKNOWN/NEEDS_REVIEW), stored as its own
  -- concept, deliberately separate from tax_documents itself: a tax_documents row represents an
  -- actual uploaded file (which is inherently "found," for itself); this table represents a human
  -- judgment about a (period, document category) combination — including the judgment that
  -- something is MISSING, i.e. explicitly absent, which by definition has no corresponding
  -- tax_documents row to attach a status to.
  --
  -- status defaults to 'UNKNOWN', never 'FOUND' or 'MISSING' — per the STEP 99 audit's own finding
  -- that only a human can set REQUIRED/EXPECTED/FOUND/MISSING judgments; the system's only honest
  -- default, absent any such judgment, is "we haven't assessed this yet." This is a deliberate
  -- departure from this schema's usual "safe default" convention (e.g. bank_statements.status
  -- DEFAULT 'UPLOADED') — there, a fresh row's default is a plain fact; here, any default other than
  -- UNKNOWN would itself be an unverified claim, which this STEP's instructions explicitly forbid.
  --
  -- Uniqueness: (tax_period_id, document_type) — at most one status judgment per period per
  -- document-type category.
  CREATE TABLE IF NOT EXISTS tax_period_evidence_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_period_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNKNOWN',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_period_evidence_status_period_type
    ON tax_period_evidence_status(tax_period_id, document_type);

  -- STEP 102 — Multi-row Document Row/Event architecture, per the STEP 101 audit's Section S
  -- finding (tax_documents has no way to represent multiple rows/events within one uploaded file —
  -- e.g. a TikTok/Facebook settlement report or a bank statement PDF/CSV listing many line items).
  -- One wholly new, additive table. NO column/FK is added to tax_documents, tax_periods,
  -- tax_period_evidence_status, transactions, transaction_attachments, bank_statements, or
  -- bank_statement_transactions by this migration, and none of those tables' existing behavior
  -- changes. No fact-extraction, OCR, AI, tax-calculation, WHT/VAT treatment, or reconciliation
  -- logic exists anywhere in this table or its DAL (src/lib/taxDocumentRows.ts) — this STEP stores
  -- only the raw, human-entered facts of "row N of document D says X", exactly per its approved
  -- scope.
  --
  -- "Batch" is NOT a separate table here — the STEP 102 scope's "batch/row/event" describes the SET
  -- of tax_document_rows sharing one tax_document_id (a document IS the batch/container for its own
  -- rows); a row always belongs to exactly one tax_documents row. Grouping several SEPARATE
  -- tax_documents rows into one logical batch (e.g. "this statement was split into 3 files") is
  -- explicitly out of scope for STEP 102 (see the STEP 101 audit's Section Q finding on this exact
  -- point) and is not built here.
  --
  -- tax_document_id is NOT NULL — a row/event cannot exist without its parent document (unlike
  -- tax_documents.tax_period_id/transaction_id, which are nullable because a document can exist
  -- before classification; a row, by contrast, is always entered FROM a specific document). No ON
  -- DELETE clause — same 100%-consistent convention as every other table in this schema.
  --
  -- row_index is the deterministic ordinal position of this row within its document (0-based,
  -- caller-supplied — matching this schema's "no silent default/no auto-assigned identity"
  -- convention for every other caller-must-supply-explicitly column, e.g. transactions.transaction_date,
  -- bank_accounts.classification). NOT auto-computed via COUNT(*)/MAX()+1 at insert time — that
  -- would be non-deterministic under concurrent inserts and would not reproduce the same numbering
  -- if a document is ever re-entered. Uniqueness is (tax_document_id, row_index), the concrete
  -- duplicate/idempotency mechanism STEP 102 requires: re-submitting "row 4 of document 91" a
  -- second time is rejected, matching bank_statement_transactions' own composite-uniqueness
  -- precedent (STEP C.2) rather than inventing a new pattern.
  --
  -- source_reference is nullable free TEXT — an order number/reference string the row itself
  -- carries (e.g. a TikTok order ID appearing in a settlement line) — deliberately NOT part of any
  -- uniqueness constraint: STEP 102's own test requirement ("same reference with different valid
  -- events" must be ALLOWED) means two legitimate rows can share one reference (e.g. two settlement
  -- lines for the same order — a fee line and a payout line). Descriptive only, matching
  -- tax_documents.source's own "descriptive only, never used to infer tax treatment" precedent — no
  -- issuer/counterparty entity is created or implied here (STEP 101 Section V, explicitly out of
  -- scope for STEP 102).
  --
  -- event_date is nullable — the date the row itself describes, independent of
  -- tax_documents.document_date (the document's own issue date) — same "never collapse distinct
  -- date concepts" precedent as tax_documents.document_date vs statement_period_from/_to (STEP 100).
  --
  -- amount_satang is a NULLABLE INTEGER in satang (1 THB = 100 satang) — same minor-unit, no-float
  -- convention as bank_statement_transactions.amount (STEP C.1 Decision 1), for the same reason:
  -- better-sqlite3/SQLite has no arbitrary-precision DECIMAL, and JS floating point must never be
  -- the financial source of truth. Nullable (unlike bank_statement_transactions.amount, which is
  -- always a real transaction) because a "row/event" here is a broader concept than a money line —
  -- a future non-monetary event row is not forced to fabricate a zero amount. When populated, sign
  -- is meaningful (positive/negative/zero all legitimate — e.g. zero for a free/waived line) — no
  -- CHECK constraint restricting sign or forbidding zero, since none of those is a tax-treatment
  -- assumption this STEP is allowed to make; TS-layer validation (src/lib/taxDocumentRows.ts) only
  -- rejects non-finite/non-integer input.
  --
  -- raw_row_text is nullable — the literal row content as transcribed/pasted, same "immutable
  -- original source text" precedent as bank_statement_transactions.raw_row_text (STEP C.2).
  --
  -- description is nullable free TEXT — a human-readable label for the row, independent of
  -- raw_row_text (the verbatim source).
  --
  -- transaction_id is the ONLY ever-mutable identity-adjacent field on this table, and even it is
  -- reference/link-only per STEP 102's explicit instruction: nothing in src/lib/taxDocumentRows.ts
  -- ever creates a transactions row — linking requires an already-existing transaction id
  -- (assertTransactionExists(), same convention as tax_documents.transaction_id/
  -- wht_records.transaction_id). Nullable — most rows will never be linked.
  --
  -- note is nullable, mutable free TEXT for human annotation — distinct from the immutable evidence
  -- fields above (row_index/source_reference/event_date/amount_satang/raw_row_text/description),
  -- none of which has an UPDATE path in src/lib/taxDocumentRows.ts at all — "immutable source-row
  -- evidence" per STEP 102's own requirement is enforced by simply never writing an UPDATE
  -- statement that touches them, same "TS-layer discipline over SQL-level restriction" convention
  -- as every other immutability guarantee in this schema (e.g. tax_documents' CONFIRMED terminal
  -- state).
  --
  -- CLOSED-period guard: creating or mutating a row is rejected if its parent tax_documents row's
  -- tax_period_id points at a tax_periods row whose status is CLOSED (src/lib/taxDocumentRows.ts's
  -- assertDocumentPeriodMutable()) — the STEP 101 audit's Section P finding (tax_documents/
  -- tax_period_evidence_status have no such guard) is deliberately NOT retrofixed onto those two
  -- existing tables by this migration (STEP 102's own instruction: fix only what this new scope
  -- needs) — this remains a documented, open gap on tax_documents/tax_period_evidence_status.
  --
  -- No ON DELETE clause on either FK — same convention as every table in this schema. No DELETE
  -- function exists in src/lib/taxDocumentRows.ts at all (same no-hard-delete precedent as
  -- taxpayer_profiles/tax_years/wht_records/tax_documents) — evidence, once recorded, is not
  -- removed.
  CREATE TABLE IF NOT EXISTS tax_document_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_document_id INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    source_reference TEXT,
    event_date TEXT,
    description TEXT,
    amount_satang INTEGER,
    raw_row_text TEXT,
    transaction_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_document_id) REFERENCES tax_documents(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_document_rows_document_row_index
    ON tax_document_rows(tax_document_id, row_index);

  CREATE INDEX IF NOT EXISTS idx_tax_document_rows_tax_document_id
    ON tax_document_rows(tax_document_id);

  CREATE INDEX IF NOT EXISTS idx_tax_document_rows_transaction_id
    ON tax_document_rows(transaction_id);

  -- STEP 104 — Fact Extraction Storage (Phase 2), per the STEP 103 audit's design and the STEP 104
  -- decision gates (see PROJECT_STATUS.md's STEP 104 entry for the full rationale). Two wholly new,
  -- additive tables. NO column/FK is added to tax_documents, tax_document_rows, tax_periods,
  -- tax_period_evidence_status, transactions, transaction_attachments, bank_statements,
  -- bank_statement_transactions, wht_records, or taxpayer_profiles by this migration, and none of
  -- those tables' existing behavior changes. No OCR/AI/deterministic-parser CODE exists anywhere in
  -- this STEP — extraction_method is a value a caller declares, not something this STEP performs.
  -- No tax calculation, WHT/VAT treatment decision, or transaction/WHT-record auto-creation happens
  -- anywhere in this table or its DAL (src/lib/extractionRuns.ts, src/lib/extractedFacts.ts).
  --
  -- DECISION GATE A (bank-statement routing) — bank_statements/bank_statement_transactions remain
  -- the sole authoritative bank-source pipeline. Nothing here creates a bank-statement-shaped row,
  -- and no FK from either new table points at bank_statements/bank_statement_transactions — a fact
  -- MAY reference bank evidence only via its own generic source_field_label/value_text fields (a
  -- human-entered pointer), never a structural join. No existing bank schema is touched.
  --
  -- DECISION GATE B (fact key vocabulary) — extracted_facts.fact_key is free TEXT, validated ONLY
  -- for shape (src/lib/extractedFacts.ts: lowercase alnum/underscore segments joined by '.',
  -- bounded length) — deliberately NOT a closed TS-layer enum like tax_documents.document_type. A
  -- brand-new platform field never requires a schema migration or a code change to accept — only
  -- the extractor/human choosing a sensible key string. fact_key is deliberately independent of
  -- document_type (tax_documents), extraction_method, and any accounting category — it names WHAT
  -- the value represents (e.g. "settlement.gross_amount"), never how it was obtained or what it
  -- means for tax/accounting purposes.
  --
  -- DECISION GATE C (extraction run from the start) — extraction_runs exists in this very
  -- migration, not deferred. Every extracted_facts row belongs to exactly one extraction_runs row
  -- (including MANUAL human entry, modeled as its own run with extraction_method = 'MANUAL' —
  -- chosen so every fact has uniform, non-special-cased provenance). A rerun is simply a NEW
  -- extraction_runs row; old runs and their facts are never deleted/overwritten.
  --
  -- extraction_runs — one execution attempt (parser run / OCR pass / AI call / manual-entry
  -- session) against one tax_documents row.
  --
  -- tax_document_id is NOT NULL — a run always targets one document (mirrors
  -- tax_document_rows.tax_document_id's own NOT NULL reasoning, STEP 102). No ON DELETE clause —
  -- same 100%-consistent convention as every table in this schema.
  --
  -- extraction_method is TS-layer validated against a small, closed, ARCHITECTURAL vocabulary
  -- ('MANUAL' | 'DETERMINISTIC_PARSER' | 'OCR' | 'AI') — NOT the same kind of enum as fact_key: this
  -- describes HOW a value was obtained (a fixed, small, unlikely-to-grow set), never WHAT the value
  -- represents.
  --
  -- extractor_provider / extractor_version / model_identifier are nullable free TEXT — descriptive
  -- identity of the specific tool/model that ran — model_identifier is expected NULL for
  -- MANUAL/DETERMINISTIC_PARSER runs (no model involved) and populated for OCR/AI.
  --
  -- status is NOT NULL DEFAULT 'RUNNING' — a brand-new run genuinely always starts running (safe
  -- default, same convention as bank_statements.status DEFAULT 'UPLOADED'). Allowed values,
  -- TS-layer enforced only (src/lib/extractionRuns.ts): 'RUNNING' | 'COMPLETED' | 'FAILED' |
  -- 'CANCELLED'. RUNNING is the only non-terminal value — once COMPLETED/FAILED/CANCELLED, no
  -- further status change is accepted. A fact may only be created under a run whose status is still
  -- 'RUNNING' (src/lib/extractedFacts.ts) — this is what makes "current/active result" meaningful
  -- without a separate is_active flag: an active run is simply one still RUNNING.
  --
  -- error_code / error_message are nullable, human-safe SHORT text only — never raw extracted
  -- content, never a stack trace, never a copy of the source document (Decision Gate D) — the DAL
  -- never accepts more than a bounded-length string here.
  --
  -- No ON DELETE clause on the FK — same convention as every table here. No DELETE function exists
  -- in src/lib/extractionRuns.ts — a run, once created, is never removed.
  CREATE TABLE IF NOT EXISTS extraction_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_document_id INTEGER NOT NULL,
    extraction_method TEXT NOT NULL,
    extractor_provider TEXT,
    extractor_version TEXT,
    model_identifier TEXT,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_document_id) REFERENCES tax_documents(id)
  );

  CREATE INDEX IF NOT EXISTS idx_extraction_runs_tax_document_id
    ON extraction_runs(tax_document_id);

  CREATE INDEX IF NOT EXISTS idx_extraction_runs_status
    ON extraction_runs(status);

  -- extracted_facts — one typed, provenanced value claim. See src/lib/extractedFacts.ts for full
  -- validation/mutation logic. This table never copies a whole document/row into itself (Phase 4's
  -- explicit instruction) — it references tax_document_id/tax_document_row_id and stores only a
  -- short source_field_label pointer, never the full raw_row_text (already on tax_document_rows,
  -- STEP 102) or the file itself (tax_documents, STEP 100).
  --
  -- tax_document_id is NOT NULL (every fact traces to a document; denormalized alongside
  -- tax_document_row_id for the same reason wht_records.taxpayer_profile_id is denormalized from
  -- tax_year_id, STEP 94/96 — needed so a document-level fact, see below, has an owner without
  -- requiring a join through a nullable row). Always derived from the fact's own extraction_run_id
  -- at insert time (src/lib/extractedFacts.ts), never independently supplied by the caller — so a
  -- fact can never end up pointing at a document/run combination that doesn't actually match.
  --
  -- tax_document_row_id is NULLABLE — most facts come from one specific row (STEP 102), but a
  -- document can also carry a fact that is not row-specific (e.g. a report-level total printed once
  -- in a document's header/footer, not on any one line). No ON DELETE clause — same convention.
  --
  -- extraction_run_id is NOT NULL — every fact, including a manually-entered one, belongs to
  -- exactly one run (Decision Gate C) — this is the single, uniform provenance anchor for
  -- extraction_method/extractor_provider/extractor_version/model_identifier context, avoiding a
  -- nullable-run special case.
  --
  -- fact_key: see Decision Gate B above (this table's own top comment). Format-validated only,
  -- never a closed list.
  --
  -- occurrence_index NOT NULL DEFAULT 0 — disambiguates legitimately repeated facts sharing the
  -- same (run, row, fact_key) — e.g. two separate "adjustment" line facts within one row. Combined
  -- with the uniqueness index below, this is the STEP 104 Phase 5 idempotency mechanism:
  -- re-submitting "occurrence 0 of key X for row Y in run Z" a second time is rejected, but two
  -- DIFFERENT occurrences (0 and 1) of the same key are both retained — never a value-only
  -- uniqueness rule that would silently drop a second, legitimately-different fact sharing a key.
  --
  -- value_type discriminates which value_* column is populated: 'MONEY' | 'DATE' | 'DATETIME' |
  -- 'STRING' | 'BOOLEAN' | 'IDENTIFIER' | 'ENUM'. No structured/JSON value_type exists in this
  -- STEP — deliberately omitted (Phase 2's own warning against "JSON เป็นที่ทิ้งข้อมูลทุกชนิดโดยไม่มี
  -- validation/schema boundary"); a future STEP may add one only once a concrete, validated shape is
  -- needed.
  --
  -- value_money_satang is INTEGER (satang, 1 THB = 100 satang) — same no-float convention as
  -- tax_document_rows.amount_satang/bank_statement_transactions.amount. Sign is meaningful
  -- (positive/negative/zero all legitimate) — no CHECK constraint, TS-layer only rejects
  -- non-finite/non-integer input.
  --
  -- value_date is TEXT ISO YYYY-MM-DD. value_datetime is TEXT in this schema's existing naive-UTC
  -- "YYYY-MM-DD HH:MM:SS" shape (same as tax_audit_log.occurred_at/CURRENT_TIMESTAMP convention) —
  -- resolving the STEP 103 audit's flagged timezone ambiguity by matching the established
  -- convention rather than inventing a new one.
  --
  -- value_text holds STRING/IDENTIFIER/ENUM values alike (the value_type column is what
  -- distinguishes their meaning — no separate column per type, since all three are unconstrained
  -- TEXT at storage time).
  --
  -- value_boolean is INTEGER 0/1, nullable — a dedicated column (not a "true"/"false" string in
  -- value_text) chosen to resolve the STEP 103 audit's own open question, avoiding string-parsing
  -- bugs.
  --
  -- currency is nullable TEXT, populated only when value_type = 'MONEY' — supports a document
  -- genuinely mixing currencies (e.g. THB settlement + USD ad-spend line) without forcing one
  -- currency assumption per document.
  --
  -- source_field_label is nullable — a short pointer to where in the source this came from (e.g. a
  -- column header). Deliberately the ONLY provenance-location field — minimalism per STEP 103
  -- Section C's own "ห้ามเดา field ที่ไม่จำเป็น" instruction; a future STEP can add a more precise
  -- locator type only once a concrete parser needs one.
  --
  -- confidence is nullable REAL — conventionally NULL for MANUAL/DETERMINISTIC_PARSER (no
  -- probabilistic process exists for either) and populated only for OCR/AI, though this is a
  -- documentation-level convention, not a hard DB/TS constraint tying the two together (only the
  -- numeric 0-1 range is enforced when supplied). Never a tax-approval signal — enforced entirely
  -- by TS-layer discipline (no code path anywhere promotes review_status based on this value).
  --
  -- review_status is NOT NULL DEFAULT 'EXTRACTED'. Allowed values, TS-layer enforced only
  -- (src/lib/extractedFacts.ts): 'EXTRACTED' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED'. CONFIRMED
  -- and REJECTED are both terminal (no further review_status change once either is reached). Chosen
  -- over the candidate 5-value vocabulary (adding 'CORRECTED') because correction is represented
  -- structurally via superseded_by_fact_id instead (see below) — conflating "corrected" into
  -- review_status would create ambiguity about whether a CORRECTED-but-still-CONFIRMED fact is
  -- still trustworthy; keeping them as two orthogonal signals avoids that. CONFIRMED here means
  -- ONLY "a human has reviewed and accepted this value as an accurate transcription of the source"
  -- — it never means taxable income, deductible expense, WHT-applicable, or VAT-registered; no code
  -- anywhere derives any of those conclusions from this column.
  --
  -- superseded_by_fact_id is a nullable self-referencing FK — the ONLY correction mechanism
  -- (src/lib/extractedFacts.ts's correctFact()): a correction NEVER rewrites an existing fact's
  -- value fields (even a CONFIRMED one) — it creates a brand-new extracted_facts row with the
  -- corrected value and sets the OLD fact's superseded_by_fact_id to point at it. This is the one
  -- narrow, always-audited mutation permitted on an otherwise-terminal (CONFIRMED/REJECTED) fact —
  -- a forward pointer, never a value change — so "confirmed fact ไม่สามารถถูกแก้แบบเงียบ ๆ" holds:
  -- the original CONFIRMED claim is never altered, only annotated as superseded.
  --
  -- note is nullable, mutable free TEXT for human annotation — settable independently of
  -- review_status/correction (src/lib/extractedFacts.ts's updateFactNote()), same "note is metadata,
  -- not evidence" precedent as tax_document_rows.note (STEP 102).
  --
  -- No ON DELETE clause on any FK — same convention as every table in this schema. No DELETE
  -- function exists in src/lib/extractedFacts.ts — a fact, once recorded, is never removed;
  -- correction always adds, never removes.
  --
  -- CLOSED-period guard (Decision Gate E): src/lib/extractedFacts.ts and src/lib/extractionRuns.ts
  -- each define their OWN assertDocumentPeriodMutable() (same tiny, duplicated-per-file helper
  -- pattern this codebase already uses for isUniqueConstraintError() etc.) that walks
  -- tax_document_id -> tax_documents.tax_period_id -> tax_periods.status and rejects the mutation
  -- if CLOSED — the exact same pattern STEP 102 already established for tax_document_rows. This
  -- required ZERO changes to tax_documents.ts or taxPeriodEvidenceStatus.ts — those two tables'
  -- documented STEP 101 gap (no CLOSED guard of their own) remains open and out of scope for STEP
  -- 104, exactly as anticipated.
  --
  -- Uniqueness: idx_extracted_facts_run_row_key_occurrence is a composite UNIQUE index over
  -- (extraction_run_id, tax_document_row_id, fact_key, occurrence_index). SQLite treats each NULL
  -- as distinct in a unique index, so this index does NOT by itself catch a duplicate among
  -- document-level facts (tax_document_row_id IS NULL) — that narrower case is additionally guarded
  -- by an explicit application-level check inside createExtractedFact()'s own db.transaction()
  -- (src/lib/extractedFacts.ts) before insert, since this is a single-process, synchronous
  -- (better-sqlite3) connection with no concurrent-writer race to protect against beyond what the
  -- transaction already serializes.
  CREATE TABLE IF NOT EXISTS extracted_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_document_id INTEGER NOT NULL,
    tax_document_row_id INTEGER,
    extraction_run_id INTEGER NOT NULL,
    fact_key TEXT NOT NULL,
    occurrence_index INTEGER NOT NULL DEFAULT 0,
    value_type TEXT NOT NULL,
    value_money_satang INTEGER,
    value_date TEXT,
    value_datetime TEXT,
    value_text TEXT,
    value_boolean INTEGER,
    currency TEXT,
    source_field_label TEXT,
    confidence REAL,
    review_status TEXT NOT NULL DEFAULT 'EXTRACTED',
    superseded_by_fact_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_document_id) REFERENCES tax_documents(id),
    FOREIGN KEY (tax_document_row_id) REFERENCES tax_document_rows(id),
    FOREIGN KEY (extraction_run_id) REFERENCES extraction_runs(id),
    FOREIGN KEY (superseded_by_fact_id) REFERENCES extracted_facts(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_extracted_facts_run_row_key_occurrence
    ON extracted_facts(extraction_run_id, tax_document_row_id, fact_key, occurrence_index);

  CREATE INDEX IF NOT EXISTS idx_extracted_facts_tax_document_id
    ON extracted_facts(tax_document_id);

  CREATE INDEX IF NOT EXISTS idx_extracted_facts_tax_document_row_id
    ON extracted_facts(tax_document_row_id);

  CREATE INDEX IF NOT EXISTS idx_extracted_facts_extraction_run_id
    ON extracted_facts(extraction_run_id);

  CREATE INDEX IF NOT EXISTS idx_extracted_facts_review_status
    ON extracted_facts(review_status);

  -- STEP 106 — Parties Master Data (per the STEP 105 audit's design). Two new, wholly additive
  -- tables. NO column/FK is added to taxpayer_profiles, tax_documents, tax_document_rows,
  -- extraction_runs, extracted_facts, transactions, transaction_attachments, bank_accounts,
  -- bank_statements, bank_statement_transactions, wht_records, or customers by this migration, and
  -- none of those tables' existing behavior changes. No document-party linking, no party-role
  -- table, no merge/auto-match logic, no OCR/AI/parser, no Fact extraction, no tax/WHT/VAT
  -- calculation, and no transaction creation exists anywhere in this table or its DAL
  -- (src/lib/parties.ts, src/lib/partyIdentifiers.ts) — this STEP stores only master identity/
  -- context data, exactly per its approved scope.
  --
  -- parties — a standalone identity/context record for a natural person, company, organization,
  -- platform, bank, or other external entity referenced by tax evidence. Deliberately NOT scoped by
  -- taxpayer_profile_id (STEP 106 Phase 5 decision): this app's own customers/bank_accounts/products
  -- tables are already unscoped the same way, and this auth model (src/lib/auth.ts, a single shared
  -- session with no per-user/tenant identity at all) provides no real isolation boundary to attach
  -- such a column to — adding one here alone would fabricate an isolation guarantee that doesn't
  -- exist anywhere else in this schema. Any future taxpayer-scoping check belongs at the
  -- document-party-link layer (via tax_documents.taxpayer_profile_id, already NOT NULL there), a
  -- later STEP, not here.
  --
  -- party_type is TEXT NOT NULL DEFAULT 'UNKNOWN' — a brand-new party's classification is
  -- genuinely, honestly unknown until a human judges it (e.g. is a newly-observed name a person or
  -- a company?) — same "the only honest default absent judgment" precedent as
  -- tax_period_evidence_status.status DEFAULT 'UNKNOWN' (STEP 100), a deliberate departure from
  -- this schema's other "safe default = a genuine known fact" convention (e.g. bank_statements.status
  -- DEFAULT 'UPLOADED'). Allowed values, TS-layer enforced only (src/lib/parties.ts): 'INDIVIDUAL' |
  -- 'JURISTIC_PERSON' | 'GOVERNMENT' | 'PLATFORM' | 'BANK' | 'UNKNOWN'. Freely updatable (no
  -- terminal state) — this is a classification label only, never itself a tax/legal conclusion
  -- (same "document type carries no tax-treatment meaning" precedent as
  -- src/lib/taxDocumentTypes.ts) — correcting a classification mistake (e.g. UNKNOWN ->
  -- JURISTIC_PERSON once confirmed) is a normal master-data edit, not an evidence correction, so it
  -- does not need the supersession mechanism STEP 104 built for extracted_facts.
  --
  -- display_name is TEXT NOT NULL — the only mandatory identity field (mirrors
  -- wht_records.payer_name's own required-ness). Deliberately NOT unique — per STEP 106 Phase 3's
  -- explicit instruction: names collide (two different real people/companies can share a display
  -- name), the same real entity can appear under different Thai/English names or abbreviations
  -- across different documents, and a display name can legitimately be edited later — none of which
  -- a UNIQUE constraint could correctly express. Identity is never inferred from this field alone
  -- (STEP 106 Phase 4: no name-similarity auto-merge).
  --
  -- legal_name / country / note are nullable free TEXT — legal_name is the registered/formal name
  -- when it differs from the display label; country is unconstrained (no ISO-code format assumed,
  -- since the source document may express it any way); note is mutable human annotation, same
  -- "metadata, not evidence" precedent as tax_document_rows.note/extracted_facts.note.
  --
  -- No ON DELETE clause — same 100%-consistent convention as every table in this schema. No DELETE
  -- function exists in src/lib/parties.ts (STEP 106 Phase 6: delete would risk destroying historical
  -- identity references; a future archive/supersession design is recommended instead, not built
  -- here) — a party, once recorded, is never removed.
  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_type TEXT NOT NULL DEFAULT 'UNKNOWN',
    display_name TEXT NOT NULL,
    legal_name TEXT,
    country TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_parties_party_type
    ON parties(party_type);

  -- Non-unique — supports search/lookup only, never identity matching (STEP 106 Phase 4).
  CREATE INDEX IF NOT EXISTS idx_parties_display_name
    ON parties(display_name);

  -- party_identifiers — one immutable observation of an identifier value for a party (STEP 106
  -- Phase 2). Modeled as a child table, not columns on parties, because a party can legitimately
  -- accumulate multiple identifier observations over time (from different documents, in different
  -- formats) that must each be preserved independently — never overwritten on conflict — matching
  -- this schema's established "child table for a growing collection of immutable observations"
  -- pattern (tax_document_rows, extracted_facts, bank_statement_transactions), not a single mutable
  -- column that would force an overwrite.
  --
  -- party_id is NOT NULL — an identifier cannot exist without its owning party. No ON DELETE clause
  -- — same convention as every table here.
  --
  -- identifier_type is TEXT NOT NULL, NO DEFAULT — the caller must always explicitly state what
  -- kind of identifier is being recorded, even if that is deliberately 'UNKNOWN' (same "no silent
  -- default for an explicit classification decision" precedent as bank_accounts.classification,
  -- STEP B.1) — this is a different judgment than parties.party_type's own safe UNKNOWN default,
  -- since here the caller has already chosen to record a specific piece of evidence, not merely
  -- describe an as-yet-unassessed party. Allowed values, TS-layer enforced only
  -- (src/lib/partyIdentifiers.ts): 'THAI_INDIVIDUAL_TAX_ID' | 'THAI_JURISTIC_TAX_ID' |
  -- 'FOREIGN_TAX_ID' | 'COMPANY_REGISTRATION_NUMBER' | 'BANK_IDENTIFIER' | 'EXTERNAL_PLATFORM_ID' |
  -- 'UNKNOWN'.
  --
  -- identifier_value_raw is TEXT NOT NULL — exactly as observed/entered, character for character.
  -- NEVER modified after insert (no UPDATE path touches it in src/lib/partyIdentifiers.ts) — this is
  -- the "source value" half of STEP 106 Phase 2's "SOURCE VALUE ≠ NORMALIZED CANDIDATE" requirement.
  -- No format is assumed or enforced here regardless of identifier_type — including for
  -- 'THAI_INDIVIDUAL_TAX_ID'/'THAI_JURISTIC_TAX_ID': this deliberately extends wht_records.payer_tax_id's
  -- own already-established "no format assumption" policy (STEP 94, re-confirmed as this project's
  -- policy by the STEP 106 audit) rather than reusing taxpayer_profiles.taxpayer_id's stricter
  -- ^\d{13}$ regex, which does not apply here — format validation is not legal verification, and a
  -- differently-shaped value may be a genuine data-entry variant (dashes, spaces) that a human
  -- should review, not something this layer silently rejects or reformats.
  --
  -- identifier_value_normalized is a NULLABLE derived candidate — computed ONCE at insert time
  -- (src/lib/partyIdentifiers.ts), stored separately, NEVER used to overwrite identifier_value_raw.
  -- Only computed (digits-only extraction) for identifier_type IN
  -- ('THAI_INDIVIDUAL_TAX_ID','THAI_JURISTIC_TAX_ID') — every other type leaves this NULL, since no
  -- safe, non-assumption-laden normalization rule is known for foreign tax IDs, company
  -- registration numbers, bank identifiers, or platform IDs. The resulting digit count is NEVER
  -- validated against 13 — this is a convenience candidate for future matching/search, not a
  -- format gate.
  --
  -- country is nullable free TEXT, unconstrained — same reasoning as parties.country.
  --
  -- source_description is nullable free TEXT — a human-readable note on where this identifier was
  -- observed (e.g. "จากใบเสร็จที่อัปโหลดด้วยมือ"). Deliberately NOT a foreign key to tax_documents or
  -- any other table — STEP 106 explicitly forbids document-party linking; this field is descriptive
  -- context only, never a structural relationship.
  --
  -- is_primary is INTEGER NOT NULL DEFAULT 0 — the one mutable field besides note
  -- (src/lib/partyIdentifiers.ts's setPrimaryPartyIdentifier()) — lets a human mark which of
  -- possibly several observed identifiers is currently considered the best/current one, without
  -- deleting or overwriting the others. The partial unique index below enforces at most one primary
  -- per party.
  --
  -- Uniqueness: (party_id, identifier_type, identifier_value_raw) prevents a literal duplicate row
  -- for the SAME party's own identifier list (a data-entry-mistake guard, scoped to one already-
  -- chosen party_id) — this is NOT identity matching/merging (STEP 106 Phase 4 forbids that): the
  -- same identifier value recorded against TWO DIFFERENT parties is explicitly NOT blocked by this
  -- index, since rejecting that would itself be an unauthorized auto-merge/matching decision.
  -- idx_party_identifiers_primary_per_party is a partial unique index (same technique as
  -- bank_reconciliation_matches' own active-pair index, STEP D.3) ensuring at most one row per
  -- party has is_primary = 1.
  --
  -- No ON DELETE clause on the FK — same convention as every table here. No DELETE function exists
  -- in src/lib/partyIdentifiers.ts — an identifier observation, once recorded, is never removed.
  CREATE TABLE IF NOT EXISTS party_identifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    identifier_type TEXT NOT NULL,
    identifier_value_raw TEXT NOT NULL,
    identifier_value_normalized TEXT,
    country TEXT,
    source_description TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id)
  );

  CREATE INDEX IF NOT EXISTS idx_party_identifiers_party_id
    ON party_identifiers(party_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_party_identifiers_party_type_value
    ON party_identifiers(party_id, identifier_type, identifier_value_raw);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_party_identifiers_primary_per_party
    ON party_identifiers(party_id)
    WHERE is_primary = 1;

  -- STEP 108 — Document-Party Linking (per the STEP 107 audit's design). One new, wholly additive
  -- table — a pure mapping layer. NO column/FK is added to tax_documents, tax_document_rows,
  -- extraction_runs, extracted_facts, tax_periods, tax_years, parties, party_identifiers,
  -- transactions, transaction_attachments, wht_records, or customers by this migration, and none of
  -- those tables' existing behavior changes. No document-party linking existed before this STEP. No
  -- OCR/AI/auto-match/merge, no tax/WHT/VAT calculation, and no transaction creation happens
  -- anywhere in this table or its DAL (src/lib/taxDocumentParties.ts).
  --
  -- tax_document_id is NOT NULL — a link cannot exist without its document. No ON DELETE clause —
  -- same 100%-consistent convention as every table in this schema. Combined with this connection's
  -- foreign_keys pragma being ON (confirmed live per the STEP B.7 audit precedent), this means
  -- SQLite refuses to delete a tax_documents/parties/tax_document_rows row that still has a
  -- tax_document_parties row pointing at it — the structural backstop against historical evidence
  -- silently disappearing, same mechanism already relied on throughout this schema. No hard-delete
  -- function exists anywhere for tax_documents/tax_document_rows/parties in the first place, so this
  -- is currently a defense-in-depth guarantee, not a live blocker on any existing code path.
  --
  -- tax_document_row_id is NULLABLE — a document-level link (e.g. the ISSUER of a whole settlement
  -- report) has no specific row; a row-level link (e.g. a different buyer per settlement line) sets
  -- this. Same nullable-scope pattern already proven by extracted_facts.tax_document_row_id (STEP
  -- 104). src/lib/taxDocumentParties.ts enforces that a supplied row's OWN tax_document_id matches
  -- this row's tax_document_id (ROW_DOCUMENT_MISMATCH otherwise) — the identical check
  -- createExtractedFact() already performs (STEP 104), not a new mechanism.
  --
  -- party_id is NOT NULL — a link always references an existing parties row (assertPartyExists(),
  -- STEP 106) — never a name-based lookup/auto-match, never creates or mutates a parties row.
  --
  -- role is TEXT NOT NULL, NO DEFAULT — the caller must always explicitly state the relationship
  -- (STEP 107 Section C's canonical vocabulary: 'ISSUER' | 'COUNTERPARTY' | 'PAYER' | 'PAYEE' |
  -- 'SUPPLIER' | 'CUSTOMER' | 'WITHHOLDING_AGENT' | 'OTHER', TS-layer enforced only,
  -- src/lib/taxDocumentParties.ts). Deliberately excludes 'PLATFORM'/'BANK' from this vocabulary —
  -- those already belong to parties.party_type (STEP 106) and describe what kind of entity a party
  -- IS, not what function it performed on this specific document; reusing them here would blur that
  -- distinction. role is an identity/relationship FACT only — no code anywhere derives a
  -- tax-treatment conclusion from its value (same "document type carries no tax-treatment meaning"
  -- precedent as src/lib/taxDocumentTypes.ts).
  --
  -- status is TEXT NOT NULL DEFAULT 'ACTIVE' — a brand-new link genuinely always starts active (safe
  -- default, same convention as bank_statements.status DEFAULT 'UPLOADED'). Allowed values, TS-layer
  -- enforced only: 'ACTIVE' | 'UNLINKED'. This is the ONLY correction mechanism
  -- (src/lib/taxDocumentParties.ts's unlinkDocumentParty()) — "unlinking" is a soft, audited status
  -- change, never a row deletion, so a party-document relationship remains forever visible in this
  -- table and its audit trail even once no longer considered active. A "wrong party linked"
  -- correction is: mark the old row UNLINKED (with a reason in note) and create a NEW, correct link
  -- row — never rewrite tax_document_id/tax_document_row_id/party_id/role in place.
  --
  -- note is nullable, mutable free TEXT for human annotation — same "note is metadata, not
  -- evidence" precedent as tax_document_rows.note/extracted_facts.note.
  --
  -- Every field except status and note is IMMUTABLE by construction — no UPDATE statement anywhere
  -- in src/lib/taxDocumentParties.ts touches tax_document_id/tax_document_row_id/party_id/role. This
  -- is what closes every bypass vector the STEP 108 audit warned about (update/delete/unlink-then-
  -- relink-differently/changing any FK or role) structurally, not merely via a runtime check.
  --
  -- CLOSED-period guard: src/lib/taxDocumentParties.ts defines its OWN assertDocumentPeriodMutable()
  -- (same tiny, duplicated-per-file helper pattern already used three times — tax_document_rows,
  -- extraction_runs, extracted_facts) that walks tax_document_id -> tax_documents.tax_period_id ->
  -- tax_periods.status and rejects CREATE/note-update/unlink if CLOSED. A document with no period
  -- assigned is never blocked (tax_period_id IS NULL short-circuits the check), exactly matching
  -- existing precedent. tax_years.LOCKED is deliberately NOT separately checked here — that lock
  -- applies only to transactions/wht_records via tax_year_transaction_links, a different mechanism
  -- this table has no reason to duplicate, exactly matching the existing precedent set by
  -- tax_document_rows/extraction_runs/extracted_facts (none of which check tax_years.status either).
  --
  -- Uniqueness: idx_tax_document_parties_row_scope is a composite UNIQUE index over
  -- (tax_document_id, tax_document_row_id, party_id, role) — correctly catches a duplicate ROW-level
  -- link (tax_document_row_id populated) at the DB level. SQLite treats each NULL as distinct in a
  -- unique index, so this index does NOT by itself catch a duplicate among DOCUMENT-level links
  -- (tax_document_row_id IS NULL) — that narrower case is additionally guarded by an explicit
  -- application-level check inside linkPartyToDocument()'s own db.transaction() (same two-layer
  -- pattern already proven by extracted_facts' createExtractedFact(), STEP 104), safe within this
  -- single-process, synchronous (better-sqlite3) connection. The same party may legitimately hold
  -- multiple DIFFERENT roles on one document (role is part of the key) and may legitimately be
  -- linked at both the document level and several row levels at once (differing
  -- tax_document_row_id) — neither is blocked by this index.
  CREATE TABLE IF NOT EXISTS tax_document_parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_document_id INTEGER NOT NULL,
    tax_document_row_id INTEGER,
    party_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_document_id) REFERENCES tax_documents(id),
    FOREIGN KEY (tax_document_row_id) REFERENCES tax_document_rows(id),
    FOREIGN KEY (party_id) REFERENCES parties(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_document_parties_row_scope
    ON tax_document_parties(tax_document_id, tax_document_row_id, party_id, role);

  CREATE INDEX IF NOT EXISTS idx_tax_document_parties_tax_document_id
    ON tax_document_parties(tax_document_id);

  CREATE INDEX IF NOT EXISTS idx_tax_document_parties_party_id
    ON tax_document_parties(party_id);

  CREATE INDEX IF NOT EXISTS idx_tax_document_parties_status
    ON tax_document_parties(status);
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

// STEP 101 — Storefront badge (ยอดนิยม/หายาก/มีใบเซอร์), shown on the public /shop catalogue.
// Nullable, no default — same "no silent default" reasoning as bank_accounts.classification:
// whether a product is "popular"/"rare"/"certified" is a merchandising call only a human makes,
// never something this schema should assume. Existing products simply have no badge until their
// owner sets one via the edit form. Allowed values enforced in the TS layer only (this route file),
// never a SQL CHECK, matching every other enum-like TEXT column in this schema: '⭐ ยอดนิยม' |
// '👑 หายาก' | '📝 มีใบเซอร์'.
if (!columnNames.has("badge")) {
  db.exec("ALTER TABLE products ADD COLUMN badge TEXT");
}

// STEP 105 — per-product "ประวัติพระเกจิ/หลวงพ่อ" shown in the storefront Quick View modal's left
// column (src/app/shop/page.tsx), editable per product from the admin add/edit form
// (src/app/products/page.tsx). Both nullable, no default — most products won't have this filled in,
// and the storefront hides the whole section when both are empty (never shows an awkward empty
// box). monk_image stores a plain URL (like the other per-product fields here), uploaded through its
// own small endpoint (POST /api/products/monk-image) rather than the product_media gallery table —
// it's a single field on the product row itself, not a many-per-product media item, and unlike a
// gallery photo it must be uploadable before the product exists yet (the "เพิ่มสินค้าใหม่" add-form
// case), which product_media's product_id NOT NULL FK cannot support.
if (!columnNames.has("monk_image")) {
  db.exec("ALTER TABLE products ADD COLUMN monk_image TEXT");
}

if (!columnNames.has("monk_history")) {
  db.exec("ALTER TABLE products ADD COLUMN monk_history TEXT");
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

// STEP E.2 — bank_statements.source_file_type (docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §4,
// approved decision). Additive only: records which parser (CSV today; PDF from STEP E.3 onward)
// must be used to re-parse a statement's source file at confirm time — never guessed from
// extension/MIME at read time. TEXT NOT NULL DEFAULT 'CSV', not nullable — every row that exists
// as of this STEP is genuinely a CSV upload (CSV has been this feature's only format until now), so
// the default is a true fact about existing data, not a guess; SQLite backfills this constant
// default onto every existing row at ALTER time, matching the same safe-default convention already
// used elsewhere in this file (e.g. orders.delivery_status, products.low_stock_threshold). Allowed
// values ('CSV' | 'PDF') are enforced in the TS layer only, never a SQL CHECK constraint — same
// convention as every other enum-like TEXT column in this schema (bank_statements.status,
// bank_accounts.classification, etc). This STEP adds only the column: no PDF parser, no API/UI
// wiring, no TS-layer enum type — those are STEP E.3 onward. Reuses bankStatementColumnNames
// fetched above rather than a second PRAGMA table_info query, since both checks run against the
// same schema snapshot within this one module load.
if (!bankStatementColumnNames.has("source_file_type")) {
  db.exec("ALTER TABLE bank_statements ADD COLUMN source_file_type TEXT NOT NULL DEFAULT 'CSV'");
}

// STEP 103 — reviews: site-wide customer testimonials shown in the storefront's Review Modal
// (src/app/shop/page.tsx) and manageable by an admin (src/app/reviews/page.tsx). Deliberately NOT
// tied to a specific product (no product_id FK) — the storefront has only ever had one site-wide
// review list/modal, never a per-product one, so adding that relation now would be speculative.
// image_url is nullable from the start — most reviews have no attached photo, and both
// customer-submitted (POST /api/reviews, unauthenticated — see src/proxy.ts, same public-write
// precedent as /api/shop/checkout) and admin-created reviews share this exact same row shape; there
// is no separate "admin review" type or moderation status. rating is a plain INTEGER (1-5),
// TS-layer validated only (src/lib/reviews.ts), matching this schema's 100% consistent convention
// for every other enum/range-constrained column — never a SQL CHECK.
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
`);

export default db;

