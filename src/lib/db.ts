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

export default db;

