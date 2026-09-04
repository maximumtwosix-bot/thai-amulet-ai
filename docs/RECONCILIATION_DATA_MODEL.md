# Reconciliation Data Model — STEP D.2

เอกสารนี้บันทึก **design decision เท่านั้น** สำหรับ Reconciliation ระหว่าง `BankStatementTransaction`
กับ `Transaction` (Financial Transaction) ต่อจาก STEP D.1 (audit) **ยังไม่มีการแก้ schema, migration,
API, UI, proxy, dependency, `.env`, หรือสร้าง test data ใดๆ ประกอบเอกสารนี้** (ดู Verification ท้าย
เอกสาร) STEP นี้ตรวจ codebase จริงซ้ำก่อนเขียน DDL (STEP D.1's reads + a fresh confirmation this STEP
— see Verification) เพื่อให้ทุก type/convention ที่อ้างถึงตรงกับของจริงในระบบ ไม่ใช่การเดา

---

## 1. DESIGN PRINCIPLES

ยืนยันหลักการที่ใช้ตัดสินใจทุกจุดในเอกสารนี้:

1. **`BankStatementTransaction` คือ immutable bank source evidence** — `src/lib/bankStatements.ts`
   มี `createBankStatementTransaction()` และฟังก์ชันอ่านเท่านั้น **ไม่มี UPDATE function ใดๆ สำหรับ
   ตารางนี้เลย** (ยืนยันซ้ำจากการอ่านไฟล์จริงใน STEP D.1 และซ้ำอีกครั้งใน STEP นี้) — Reconciliation
   ต้องไม่เพิ่ม UPDATE path ให้ตารางนี้
2. **`Transaction` คือ business/accounting record** ที่มี lifecycle ของตัวเอง (`src/lib/transactions.ts`)
   — ไม่ใช่ "บันทึกเงินที่ไหลผ่านบัญชีธนาคาร" โดยตรง Reconciliation ต้องไม่ auto-mutate
   `amount`/`transaction_date`/`category`/ฟิลด์ใดๆ ของแถวนี้เพื่อให้ "ตรงกับ" bank statement
3. **Reconciliation คือ mapping layer แยกต่างหาก** — อ้างอิงทั้งสองฝั่งด้วย `id` เท่านั้น ไม่ merge/rewrite
   source rows ฝั่งใดฝั่งหนึ่ง
4. **ห้ามเพิ่ม FK/column เข้า `transactions` หรือ `bank_statement_transactions` หากไม่จำเป็น** — ทุก
   ตารางใหม่ในเอกสารนี้เป็นตารางแยกทั้งหมด (§2, §6) ไม่มี `ALTER TABLE transactions ...` หรือ
   `ALTER TABLE bank_statement_transactions ...` ใดๆ ถูกเสนอ
5. **ห้ามแก้จำนวนเงินต้นฉบับ** ของทั้งสองตาราง — mapping table เก็บ `allocated_amount` ของตัวเอง
   ไม่เคยเขียนทับ `bank_statement_transactions.amount`/`debit`/`credit` หรือ `transactions.amount`
6. **ห้าม merge source rows** — 1 bank row กับ 1 financial row (หรือหลายคู่) ยังคงเป็นแถวแยกกันเสมอ
   การ "จับคู่" คือการเพิ่มแถว mapping ใหม่ ไม่ใช่การรวมสองแถวเป็นหนึ่ง
7. **ห้าม silently discard unmatched rows** — แถวที่ไม่มี mapping ("UNMATCHED") ต้องยังคงมองเห็นได้เสมอ
   ในทุก query/UI ในอนาคต ไม่ใช่ถูกกรองทิ้งเงียบๆ
8. **ทุก confirm/unmatch ต้องตรวจสอบ server-side** — ห้ามเชื่อ client-computed state (ตรงกับ pattern ที่
   `src/app/api/bank-statements/[id]/confirm/route.ts` ใช้อยู่แล้ว — re-read/re-validate จาก DB เสมอ)
9. **ทุก mutation ต้อง atomic** — ใช้ `db.transaction()` (better-sqlite3, มีอยู่แล้วในโปรเจกต์)
10. **ต้องรองรับ concurrent/double-click safety** — ใช้ pattern `WHERE status = '...'`-guarded `UPDATE`
    เป็นคำสั่งแรกใน `db.transaction()` เดียวกับที่ `confirm/route.ts` ใช้อยู่แล้ว (§9)

---

## 2. PROPOSED TABLE: `bank_reconciliation_matches`

ยังไม่ implement — เป็นข้อเสนอ DDL เท่านั้น ชนิดข้อมูล/convention อ้างอิงจาก `src/lib/db.ts` จริง
(ยืนยันซ้ำใน STEP นี้): `INTEGER PRIMARY KEY AUTOINCREMENT` สำหรับ PK, `INTEGER` สำหรับ FK, ไม่มี
`ON DELETE` clause ใดๆ ในทุก FK ของทั้งไฟล์ (convention 100% consistent), enum-like TEXT columns
validate ที่ TS layer เท่านั้น (ไม่มี SQL `CHECK` ที่ใดในไฟล์นี้เลย), timestamp เป็น
`TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

```sql
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
```

### Column-by-column

| Column | Type | Null | Default | FK | ON DELETE | Unique/Index | Purpose | Mutable? |
|---|---|---|---|---|---|---|---|---|
| `id` | `INTEGER` | NOT NULL | autoincrement | — | — | PK | Surrogate key, same convention as every other table | Immutable |
| `bank_statement_transaction_id` | `INTEGER` | NOT NULL | none | → `bank_statement_transactions(id)` | none (matches this schema's 100% consistent no-cascade convention) | see §12 composite | Which bank-side source row this mapping links | **Immutable** — never repointed; a wrong link is fixed by unmatching this row and creating a new one, never by editing this column |
| `transaction_id` | `INTEGER` | NOT NULL | none | → `transactions(id)` | none | see §12 composite | Which financial-side record this mapping links | **Immutable**, same reasoning |
| `allocated_amount` | `INTEGER` | NOT NULL | none | — | — | none (see §12 — not indexed, no query filters by value) | Portion (in satang, signed) of the bank transaction attributed to this financial transaction — see §3 for invariants | Mutable while `status` ∈ {SUGGESTED, MATCHED}; **immutable once `status = CONFIRMED`** |
| `match_strategy` | `TEXT` | NOT NULL | none | — | — | none (see §4 — not indexed; no query at this scale filters primarily by strategy) | Records **how the pairing was originally identified** — a descriptive/audit fact, never a confirmation signal (see §4) | **Immutable** — describes the row's origin, not its current state |
| `status` | `TEXT` | NOT NULL | `'SUGGESTED'` | — | — | part of composite (§12) | Current lifecycle state (§5) | Mutable via defined transitions only, TS-layer validated (never SQL CHECK — matches `bank_statements.status` convention exactly) |
| `note` | `TEXT` | nullable | none | — | — | none | Free-text reason — **required at the TS layer** (not DB layer, same convention as everywhere else in this schema) when `status` transitions to `EXCLUDED` or `NEEDS_REVIEW`; optional otherwise | Mutable |
| `created_at` | `TEXT` | NOT NULL | `CURRENT_TIMESTAMP` | — | — | see §12 | Row creation time | Immutable |
| `updated_at` | `TEXT` | NOT NULL | `CURRENT_TIMESTAMP` | — | — | none | Bumped on every write | Mutable (system-managed) |
| `confirmed_at` | `TEXT` | nullable | none | — | — | none | Set exactly once, only on the transition **into** `CONFIRMED` | Set-once — never cleared or reused, even after a later unmatch (§10) |
| `confirmed_by` | `TEXT` | nullable | none | — | — | none | Who confirmed — see §6 limitation | Set-once, alongside `confirmed_at` |
| `unmatched_at` | `TEXT` | nullable | none | — | — | none | Set exactly once, only on the transition `CONFIRMED → UNMATCHED` | Set-once |
| `unmatched_by` | `TEXT` | nullable | none | — | — | none | Who unmatched — see §6 limitation | Set-once, alongside `unmatched_at` |

### Columns deliberately NOT added (and why)

Per this STEP's explicit instruction — *"อย่าเพิ่ม column เพียงเพราะ 'อาจมีประโยชน์'"* — the following
were considered and rejected, each with a concrete reason, not just omitted silently:

- **`confidence` (numeric score)** — rejected. `match_strategy` already fully encodes relative
  strength (a candidate found via exact date+amount+account is structurally stronger than one found
  via a tolerance-based fingerprint) with no ML/scoring model anywhere in this codebase to produce a
  meaningful independent number. A redundant numeric field with no real producer or consumer would
  violate this instruction directly.
- **`direction` / `flow_type` (income/expense/transfer/fee/refund/unknown)** — rejected. This is
  already fully derivable from two existing sources of truth: the sign of
  `bank_statement_transactions.amount` (bank side) and `transactions.transaction_type`/`category`
  (financial side, once matched). A third stored classification would be a second copy of the same
  fact with no mechanism keeping it in sync — see §3/§8 for how each case (transfer/fee/refund/
  unknown) is actually represented without this column.
- **`bank_account_id` (denormalized)** — rejected. Unlike `bank_statement_transactions.bank_account_id`
  (STEP C.2), which was denormalized specifically because SQLite cannot express a unique index across
  a join, nothing in this table's indexes (§12) needs that. It is always reachable via
  `bank_statement_transaction_id → bank_statement_transactions.bank_account_id` — denormalizing here
  would be "might be useful," not "structurally required," which this STEP explicitly forbids.

---

## 3. MONEY REPRESENTATION

- `allocated_amount` is **`INTEGER` satang** — same minor-unit convention as
  `bank_statement_transactions` (STEP C.1 Decision 1), for the same reason: no Decimal/Prisma
  available, `better-sqlite3` marshals every number through an IEEE-754 double regardless of declared
  affinity, so integer minor-units is the only dependency-free way to keep money arithmetic exact.
  **No FLOAT, no decimal float arithmetic, anywhere in reconciliation logic.**
- Sign convention: `allocated_amount` uses the **same signed convention as
  `bank_statement_transactions.amount`** (positive = credit/inflow, negative = debit/outflow) for the
  specific bank row it allocates against — this keeps the bank-side invariant below a simple magnitude
  comparison, not a sign-flipping one.
- `transactions.amount` remains `REAL` baht (unchanged, out of scope to modify — Design Principle 4).
  Any comparison between the two must convert the `REAL` baht value to satang **only at comparison
  time**, via `Math.round(bahtValue * 100)` — this single controlled rounding is acceptable *here*
  specifically because it is a one-off boundary check against an already-stored value, not an ingest
  pipeline computing a value that gets persisted (unlike `bankStatementCsv.ts`'s stricter
  string-based-scaling rule, which exists to avoid persisting an imprecise *parsed* value — nothing
  here is persisted from this conversion). This must be documented at the call site when implemented.

### Invariants (enforced at the TS layer, inside the same `db.transaction()` as the write — never a SQL
`CHECK`, matching this schema's 100% consistent convention)

- **Bank-side:** for a given `bank_statement_transaction_id`, the sum of `allocated_amount` across all
  *active* rows (`status` ∈ {SUGGESTED, MATCHED, CONFIRMED, NEEDS_REVIEW}) must satisfy
  `|SUM(allocated_amount)| <= |bank_statement_transactions.amount|`, and every individual
  `allocated_amount` must share the same sign as `bank_statement_transactions.amount`.
- **Financial-side:** for a given `transaction_id`, the sum of `|allocated_amount|` (converted to
  satang) across all active rows must satisfy `SUM <= ROUND(transactions.amount * 100)`.
- **Zero allocation is forbidden** — `allocated_amount` must be non-zero. A zero-amount mapping row is
  meaningless (mirrors `bank_statement_transactions`' own precedent: an all-zero debit/credit row is
  classified `INFORMATIONAL` and never even reaches this table as a real transaction to match against).
- These invariants bound `allocated_amount`; they do **not** require exact equality — partial
  allocation (§7) is a legitimate, supported state, not an error.

### Special cases — how each is represented (no new column; see rejected-columns list above)

| Case | Representation |
|---|---|
| **income** | Bank row `amount > 0`, matched `transaction_id` has `transaction_type = 'income'` — ordinary case, no special handling |
| **expense** | Bank row `amount < 0`, matched `transaction_id` has `transaction_type = 'expense'` — ordinary case |
| **transfer** (between the shop's own bank accounts) | Never auto-booked as income+expense. Represented purely at the workflow/state level (§8) — typically `EXCLUDED` with `note` explaining the transfer, or (future UI convenience, not a schema requirement) two mapping rows linked to each other informally via matching `note` text — no dedicated column |
| **fee** | Either linked to a genuine `expense` `transactions` row (ordinary case) or `EXCLUDED` with `note` — never silently dropped (Design Principle 7 — the bank row itself remains visible/UNMATCHED until a decision is made either way) |
| **refund** | An ordinary mapping row like any other — the reversing bank credit is matched (or not) to its own `transactions` row; the original expense/debit's own mapping row (if any) is untouched — see Design Principle 6, rows are never merged |
| **unknown** | `status = NEEDS_REVIEW` with `note` — surfaced for human decision, never silently left ambiguous |

---

## 4. MATCH TYPE / STRATEGY ENUM

```
match_strategy: 'BANK_TRANSACTION_ID' | 'EXACT_DATE_AMOUNT_ACCOUNT' | 'CONSTRAINED_FINGERPRINT' | 'MANUAL'
```

Vocabulary intentionally aligned with `docs/BANK_ACCOUNT_NUMBER_POLICY.md`'s existing strategy
vocabulary (`EXACT` / `BANK_PROVIDED_IDENTIFIER` / `NORMALIZED_CANDIDATE` / `MANUAL_CONFIRMED`) —
renamed to this table's own concrete meanings rather than reused verbatim, since that policy's
vocabulary was written for account-**number** text matching, not transaction matching:

- **`BANK_TRANSACTION_ID`** — bank-provided identifier match (`docs/BANK_ACCOUNT_NUMBER_POLICY.md`'s
  `BANK_PROVIDED_IDENTIFIER` concept). **Not usable today** — `transactions` has no field to carry a
  bank-provided transaction ID (confirmed: no such column exists in `src/lib/transactions.ts`'s
  schema). Reserved for a future extension, not removed, so the enum doesn't need to change later.
- **`EXACT_DATE_AMOUNT_ACCOUNT`** — system found a candidate by exact date + exact amount + (where
  determinable) same bank account. This STEP D.1's §4 strategy #2.
- **`CONSTRAINED_FINGERPRINT`** — system found a near-match candidate within an explicit, narrow
  tolerance (never description-alone/amount-alone/date-alone — Design Principle inherited from STEP
  D.1 §4 / `bankStatementCsv.ts`'s own fingerprint rule).
- **`MANUAL`** — a human found and linked the pair directly (browsed and picked), with no system
  suggestion involved at all.

**`NORMALIZED_CANDIDATE` is deliberately excluded from this enum.** That value's entire semantic
purpose in `docs/BANK_ACCOUNT_NUMBER_POLICY.md` is *account-number text normalization* (e.g. comparing
a stripped/reformatted account number as a temporary candidate) — this table has no such need, since
`bank_statement_transactions.bank_account_id` is already a real, denormalized FK pinned at ingestion
time (STEP C.2) — there is no text-normalization matching problem for `match_strategy` to solve.
Inventing a same-named-but-different-meaning value here would be confusing, not useful.

### Candidate suggestion vs. actual confirmed match — how `match_strategy` behaves in each

`match_strategy` **only ever describes how a row's pairing was originally identified** — it is purely
descriptive/audit metadata, immutable once set, and **carries no authority over `status`**. A row with
`match_strategy = 'EXACT_DATE_AMOUNT_ACCOUNT'` can sit at `status = SUGGESTED` indefinitely; nothing
about the strategy value itself ever changes `status`. The **only** thing that means "this is an
actual confirmed match" is `status = 'CONFIRMED'` (with `confirmed_at`/`confirmed_by` populated) — a
fact established exclusively through the explicit `CONFIRMED` transition (§5), which always requires a
distinct human action regardless of which `match_strategy` produced the original candidate. This is
the concrete mechanism that satisfies *"ห้ามเพิ่ม NORMALIZED_CANDIDATE ถ้า semantics ทำให้เกิด
auto-confirm"* — no strategy value, including the strongest one, is ever wired to auto-confirm
anything.

---

## 5. RECONCILIATION STATUS

```
status: 'SUGGESTED' | 'MATCHED' | 'CONFIRMED' | 'EXCLUDED' | 'UNMATCHED' | 'NEEDS_REVIEW'
```

All six requested states are used, with this meaning:

- **`SUGGESTED`** — system proposed this pairing; no human decision yet. Non-terminal, reversible
  (row is simply deleted on dismissal — see §10, nothing irreversible has happened yet).
- **`MATCHED`** — a human explicitly selected this specific pairing, but has not yet confirmed it.
  Non-terminal, reversible (row deleted on undo — same reasoning as SUGGESTED).
- **`CONFIRMED`** — a human took the distinct, explicit "confirm" action. This is the only state that
  represents a real, accounting-relevant reconciliation. Non-terminal *at the state-machine level*
  (unmatch is always possible) but the row itself becomes append-only from here (§10).
- **`EXCLUDED`** — a human explicitly decided this bank row (or this specific pairing) is out of scope
  for accounting matching (e.g. a transfer, a fee handled elsewhere). Reversible, but reversal creates
  a **new** row (§10), not an edit of this one.
- **`UNMATCHED`** — **only ever reached by an explicit `CONFIRMED → UNMATCHED` action** (the "unmatch"
  workflow) — a persisted historical fact that a real match existed and was later reversed. This is
  distinct from a bank/financial row simply having **no row at all** in this table, which is the far
  more common "never touched yet" case and is *not* stored as a literal `UNMATCHED` row (see Design
  Principle 7 — visibility of untouched rows comes from a `NOT EXISTS` query against this table, not
  from a stored status value. Storing one row per untouched bank transaction was considered and
  rejected — it would mean pre-populating a row for every one of potentially thousands of imported bank
  transactions with no information content beyond "nothing has happened yet," which the "don't add
  what isn't needed" principle rejects here just as it rejected extra columns above).
- **`NEEDS_REVIEW`** — an integrity concern was detected on a `CONFIRMED` row (its linked `transactions`
  row changed after confirmation — see §17 Open Decision 1 for *how* this detection is implemented) or
  a genuinely ambiguous case was flagged by a human/system as needing a second look. Reversible into
  any other appropriate state once a human resolves it.

### Transition table

| Current | Action | Next | Allowed? | Terminal? | Reversible? | Requires human? |
|---|---|---|---|---|---|---|
| *(no row)* | system proposes | `SUGGESTED` | ✅ | no | yes (delete) | no — system-initiated |
| *(no row)* | human links directly | `MATCHED` | ✅ | no | yes (delete) | **yes** |
| `SUGGESTED` | human selects this candidate | `MATCHED` | ✅ | no | yes | **yes** |
| `SUGGESTED` | human dismisses | *(row deleted)* | ✅ | — | — | **yes** |
| `SUGGESTED` | human excludes | `EXCLUDED` | ✅ | no | yes (new row on reverse) | **yes** |
| `MATCHED` | human confirms | `CONFIRMED` | ✅ | no | yes (unmatch) | **yes** |
| `MATCHED` | human undoes | *(row deleted)* | ✅ | — | — | **yes** |
| `MATCHED` | human excludes | `EXCLUDED` | ✅ | no | yes | **yes** |
| `CONFIRMED` | human unmatches | `UNMATCHED` | ✅ | **row-terminal** (§10) | yes, via a *new* row | **yes**, reason required |
| `CONFIRMED` | integrity check fails | `NEEDS_REVIEW` | ✅ | no | yes | no — system-detected, human resolves after |
| `EXCLUDED` | human un-excludes | *(new row, `SUGGESTED`/`MATCHED`)* | ✅ | this row: **row-terminal** | yes, via a new row | **yes** |
| `NEEDS_REVIEW` | human re-resolves | any of `SUGGESTED`/`MATCHED`/`CONFIRMED`/`EXCLUDED`/`UNMATCHED` | ✅ | no | — | **yes** |
| `UNMATCHED` | *(any)* | — | ❌ forbidden | **row-terminal** | a *new* row must be created to re-link the same pair | — |
| `SUGGESTED`/`MATCHED` | GET / read | *(unchanged)* | N/A | — | — | GET **never** mutates state (enforced: no GET handler in the future API, §13, will ever call a write function) |

**Explicitly forbidden, called out per this STEP's instructions:**

- A `GET` request must never change `status` — every future `GET` endpoint (§13) is read-only by
  construction (no write call in its handler).
- `SUGGESTED` is never itself treated as confirmation — no code path may read `status = 'SUGGESTED'`
  and treat the underlying money as reconciled.
- No `match_strategy`, however strong, ever causes an automatic transition to `CONFIRMED` — that
  transition is 100% gated on an explicit user-initiated API call (§13's `POST .../confirm`), always.

---

## 6. AUDIT LOG TABLE

```sql
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
```

- **`match_id`** — FK → `bank_reconciliation_matches(id)`, no `ON DELETE` (same convention). **Not**
  denormalizing `bank_statement_transaction_id`/`transaction_id` directly onto this table — unlike
  STEP C.2's denormalization of `bank_account_id` onto `bank_statement_transactions` (justified there
  because SQLite cannot express a unique index across a join), nothing here needs an index across that
  join — `bank_reconciliation_matches`'s own two FK columns are immutable (§2), so joining
  audit → match always resolves the correct, stable, historically-accurate pair. Adding the columns
  anyway would be "might be useful," which this STEP explicitly forbids.
- **`action`** — one of `MATCHED | CONFIRMED | UNMATCHED | EXCLUDED | NEEDS_REVIEW_FLAGGED | RESOLVED`.
  Deliberately does **not** log `SUGGESTED` row creation — a system-generated candidate is not a
  decision, and logging every one would flood this table with non-audit-worthy noise; only actions
  that represent a human decision (or a system-detected integrity flag, `NEEDS_REVIEW_FLAGGED`) are
  recorded.
- **`from_status`** — nullable (NULL when a row is created directly at a given status with no prior
  state, e.g. a fresh `MANUAL` match with no preceding `SUGGESTED`).
- **`to_status`** — NOT NULL, the resulting status.
- **`reason`** — nullable; **required at the TS layer** for `UNMATCHED`, `EXCLUDED`, and
  `NEEDS_REVIEW_FLAGGED` actions (answers **WHY**).
- **`performed_by`** — NOT NULL. Answers **WHO** — see limitation below.
- **`performed_at`** — answers **WHEN**.
- **Append-only** — no UPDATE/DELETE function will ever be provided for this table, matching the exact
  existing convention of `inventory_movements` (STEP 36) and `ai_cost_ledger` (STEP 21), both of which
  are immutable audit trails in this same codebase today.

### What the audit answers

| Question | Answered by |
|---|---|
| WHO | `performed_by` |
| WHAT | `action` |
| WHEN | `performed_at` |
| WHY | `reason` |
| FROM STATE | `from_status` |
| TO STATE | `to_status` |
| WHICH BANK ROW | join `match_id → bank_reconciliation_matches.bank_statement_transaction_id` |
| WHICH FINANCIAL TRANSACTION | join `match_id → bank_reconciliation_matches.transaction_id` |
| WHICH MATCH RECORD | `match_id` |

### `confirmed_by` / `unmatched_by` / `performed_by` — explicit limitation

**This app has no multi-user identity model.** Auth is a single shared admin session
(`SESSION_COOKIE_NAME`, `src/lib/auth.ts`, `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) — there is no
`users` table anywhere in `src/lib/db.ts`, and no request-scoped "current user" object exists in any
route today. Per this STEP's explicit instruction (**ห้ามสร้าง fake user identity model**), these
columns will **not** be backed by a fake FK to a nonexistent users table, and will **not** invent
per-session identity that doesn't exist. They are `TEXT` columns that a future implementation STEP
populates with a **fixed literal constant** (exact value is Open Decision 3, §17) — honestly
documented as "always the one shared admin, not a real per-user identity" today, with the column
shape left ready for real multi-user attribution if this app ever adds one. The one exception is
`bank_reconciliation_audit.performed_by = 'system'` for a system-detected `NEEDS_REVIEW_FLAGGED`
action (§5's integrity-check case) — this is not a fake human identity, it is an honest label for an
automated check, matching the existing precedent of `recoverStaleProcessingPosts()`
(`src/lib/socialQueue.ts`) already writing system-initiated status changes in this codebase.

---

## 7. ONE-TO-MANY / MANY-TO-ONE

- **1 bank statement transaction → N financial transactions**: supported natively — multiple active
  rows in `bank_reconciliation_matches` may share the same `bank_statement_transaction_id` with
  different `transaction_id` values, each with its own `allocated_amount`.
- **N bank statement transactions → 1 financial transaction**: supported symmetrically — multiple
  active rows may share the same `transaction_id` with different `bank_statement_transaction_id`
  values.
- **Partial allocation**: legitimate and expected — `allocated_amount` need not equal the full amount
  of either side; §3's invariants only bound the *sum* from overshooting, never require full coverage.
- **Allocation sum validation**: enforced at the TS layer, inside the same `db.transaction()` as the
  write, by re-querying the current sum of active rows for the relevant `bank_statement_transaction_id`
  and `transaction_id` before inserting/updating — never trusting a client-supplied running total
  (mirrors `confirm/route.ts`'s "never trust client preview state" convention).
- **Duplicate allocation prevention**: the same *pair* (`bank_statement_transaction_id`,
  `transaction_id`) cannot have two simultaneously-active rows — enforced by the partial unique index
  in §12, not by the sum-validation logic (defense in depth: app-layer check + DB-level backstop, same
  pattern as every other uniqueness guard in this codebase, e.g. `bank_accounts`' composite unique
  index).
- **No auto-pairing by row position, ever.** Same-date + same-amount bank rows (e.g. two ฿500 sales the
  same day) must **never** be assumed to correspond 1:1 in file/list order with same-amount financial
  rows — every pairing is an explicit, individually-made decision (`MANUAL`, `EXACT_DATE_AMOUNT_ACCOUNT`,
  or `CONSTRAINED_FINGERPRINT` candidate that a human still must individually select). A same-date/
  same-amount situation with more than one plausible candidate on either side must surface as multiple
  candidates or `NEEDS_REVIEW`, not a single auto-picked "best guess."

---

## 8. SPECIAL TRANSACTION TYPES

| Type | Policy |
|---|---|
| **TRANSFER** (between the shop's own bank accounts) | Never auto-booked as income + expense (would double-count P&L). Always requires manual human confirmation to classify. Represented via `EXCLUDED` + `note` explaining the transfer (most common case, since a transfer usually has no corresponding `transactions` row at all), or via two independently-confirmed mapping rows if the business genuinely wants both bank legs tracked — either way, nothing about this table's schema auto-detects or auto-links a transfer pair; that logic (if ever built) lives entirely in a future application layer, never as a stored relationship here. |
| **FEE** | May be linked as an ordinary `expense`-category `transactions` row (human creates/selects one, then matches normally), **or** `EXCLUDED` with `note`. Never silently discarded — the bank row remains visible in the unmatched queue (Design Principle 7) until one of these two decisions is made. |
| **REFUND** | Linked like any other row. The original bank row and the original `transactions` row (if any) are never merged (Design Principle 6) — a refund is its own bank transaction, matched (or not) independently. |
| **UNKNOWN** | `status = NEEDS_REVIEW`, `note` explaining the ambiguity. Never left in a state that looks resolved when it isn't. |

---

## 9. CONCURRENCY / IDEMPOTENCY

Reuses the exact pattern already proven in `src/app/api/bank-statements/[id]/confirm/route.ts`:

- **Double-click confirm / two browser tabs / concurrent confirmation**: the `CONFIRMED` transition's
  first synchronous statement inside its `db.transaction()` must be a
  `WHERE status = 'MATCHED'`-guarded `UPDATE ... SET status = 'CONFIRMED', ...`. SQLite serializes
  concurrent write transactions, so only one concurrent request can ever see `changes === 1`; the loser
  sees `changes === 0` and aborts before any further write — identical mechanism to the existing
  `UPDATE bank_statements SET status = 'IMPORTING' ... WHERE status = 'PREVIEW_READY'` guard.
- **Concurrent unmatch**: same pattern, guarded by `WHERE status = 'CONFIRMED'` before flipping to
  `UNMATCHED` — a second concurrent unmatch request sees `changes === 0` and returns a clean "already
  unmatched" response rather than double-writing an audit row.
- **Duplicate mapping / same bank transaction mapped twice accidentally**: prevented at the DB level by
  the partial unique index in §12 (`(bank_statement_transaction_id, transaction_id)` unique while
  `status` is active) — a second concurrent attempt to create the same active pair fails with
  `SQLITE_CONSTRAINT_UNIQUE`, caught and translated to a clean error (same `isUniqueConstraintError()`
  convention already used in `bankAccounts.ts`/`bankStatements.ts`).
- **General rule**: every mutating action (`match`, `confirm`, `unmatch`, `exclude`) always
  re-validates the *current* DB state of the row(s) involved inside the `db.transaction()` — never
  trusts a client-supplied "I saw status X a moment ago" claim, matching Design Principle 8.

---

## 10. DELETE / UNMATCH POLICY

- **Source bank rows (`bank_statement_transactions`) are never hard-deleted** by any reconciliation
  action — no delete path exists or is proposed here; this is unchanged from today (§1).
- **Financial transactions (`transactions`) are never hard-deleted** by any reconciliation action —
  same. (Whether `deleteTransaction()` itself should gain a new guard when a row has an active
  reconciliation mapping is a separate, genuinely open question — see §17 Open Decision 2. This
  document does not assume permission to modify `src/lib/transactions.ts`.)
- **Can a `bank_reconciliation_matches` row itself be deleted?** — **Yes, but only while non-terminal**:
  a row at `status` ∈ {SUGGESTED, MATCHED} may be hard-deleted (dismissing a suggestion, undoing a
  pre-confirmation match) — nothing accounting-relevant or audit-worthy has happened yet at that point.
  **Once a row reaches `CONFIRMED`, it is never deleted again** — an unmatch is represented by flipping
  its `status` to `UNMATCHED` (with `unmatched_at`/`unmatched_by` populated and an audit row created),
  not by removing the row. This is the soft-delete field: **`status = 'UNMATCHED'` on a row that was
  once `CONFIRMED` *is* the soft-delete marker** — no separate `deleted_at`/`is_deleted` column is
  needed, since `status` already carries that meaning precisely (adding a second column for the same
  fact would repeat the "column added because it might be useful" mistake called out in §2).
- **Row-terminal, not table-terminal**: once a specific row reaches `UNMATCHED` or `EXCLUDED`, that
  *row* accepts no further transitions (§5's transition table) — but the same
  (`bank_statement_transaction_id`, `transaction_id`) *pair* can always be re-attempted via a **new**
  row if a human decides the original unmatch/exclusion was wrong. This keeps every row's own history
  linear and simple (`created → ... → CONFIRMED → UNMATCHED`, full stop) while still allowing genuine
  correction — the correction is itself an auditable new fact, not an edit erasing the old one.
- **Before/after source rows must be byte-identical**: every mutation described in this document writes
  only to `bank_reconciliation_matches`/`bank_reconciliation_audit` — `bank_statement_transactions` and
  `transactions` rows are never touched by any write path in this design, so this property holds by
  construction, not by a runtime check.

---

## 11. ACCOUNT SCOPING

`BankStatementTransaction → BankStatement → BankAccount` is a real, enforced chain today:
`bank_statement_transactions.bank_account_id` is a denormalized, immutable FK set at ingestion (STEP
C.2) — so every mapping row's bank-side account is always known and stable via
`bank_statement_transaction_id → bank_account_id`.

**`transactions` has no `bank_account_id` column** (confirmed again this STEP by re-reading
`src/lib/transactions.ts`'s schema) — so there is **no DB-level mechanism** to constrain a
`transaction_id` to "belong to" a specific bank account, because that information doesn't exist on the
financial-transaction side at all today.

**Impact**: nothing in this schema can *structurally prevent* a mapping row from linking a bank
transaction on Account A to a financial transaction that "really" relates to Account B — the DB simply
has no fact to check. **Final decision**: this is an accepted, disclosed limitation, not silently
ignored —

- No FK/column is added to `transactions` to close this gap (Design Principle 4 forbids it without a
  clear, approved need, and none has been approved).
- The limitation is fully mitigated by Design Principle 8 (every mutating action is human-reviewed) —
  a human confirming a pairing can visually judge plausibility even without a DB constraint.
- Candidate-generation logic (a future application-layer concern, not a schema concern) **should**
  additionally use `bank_accounts.classification` (BUSINESS/PERSONAL/MIXED) as a soft filtering hint
  when computing `EXACT_DATE_AMOUNT_ACCOUNT`/`CONSTRAINED_FINGERPRINT` candidates — this is a
  recommendation for the future API implementation STEP, not a schema requirement, and is explicitly
  out of scope to build now.

This closes the same question STEP D.1 §7 flagged as a risk — resolved here as a documented,
accepted limitation rather than an unresolved gap.

---

## 12. INDEX PLAN

```sql
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_bank_txn_id
  ON bank_reconciliation_matches(bank_statement_transaction_id);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_transaction_id
  ON bank_reconciliation_matches(transaction_id);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_status
  ON bank_reconciliation_matches(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_reconciliation_matches_active_pair
  ON bank_reconciliation_matches(bank_statement_transaction_id, transaction_id)
  WHERE status IN ('SUGGESTED', 'MATCHED', 'CONFIRMED', 'NEEDS_REVIEW');
```

| Index | Why |
|---|---|
| `bank_statement_transaction_id` (plain) | Candidate-lookup direction 1: "show all mappings for this bank row" |
| `transaction_id` (plain) | Candidate-lookup direction 2: "show all mappings for this financial transaction" |
| `status` (plain) | History/queue views filtered by state (e.g. "all EXCLUDED", "all NEEDS_REVIEW") |
| `(bank_statement_transaction_id, transaction_id)` **partial unique**, active statuses only | The actual duplicate-prevention mechanism (§9/§10) — SQLite partial indexes support arbitrary `WHERE` expressions including `IN`, so terminal rows (`UNMATCHED`/`EXCLUDED`) can coexist historically for the same pair without blocking a legitimate new attempt |

**Deliberately not indexed** — `allocated_amount`, `match_strategy`, `note`, `created_at`,
`confirmed_at`/`confirmed_by`, `unmatched_at`/`unmatched_by`: no query in this design's own API/UI plan
(§13/§14) filters primarily by any of these at a scale where a missing index would matter, and adding
one anyway would violate this STEP's explicit "อย่าสร้าง index เกินความจำเป็น" instruction. If a future
implementation STEP finds a real, measured need (e.g. a "history" view sorted by `confirmed_at`), that
index can be added additively then, with its own justification — not speculatively now.

---

## 13. FUTURE API CONTRACT (documentation only — nothing built this STEP)

| Endpoint | Input | Output | Auth | State requirement | Mutation? | Concurrency |
|---|---|---|---|---|---|---|
| `GET /api/reconciliation/candidates?bankAccountId=&bankStatementId=` | query params | list of unmatched bank rows + computed candidates (strategy, both sides' data) | session cookie (proxy) | none — works regardless of current state | **read-only, never mutates** | N/A |
| `GET /api/reconciliation/matches/[id]` | `id` (path) | one mapping row's full detail + its audit history | session cookie | row must exist | **read-only** | N/A |
| `POST /api/reconciliation/suggest` | `bankStatementTransactionId` | creates/refreshes `SUGGESTED` row(s) | session cookie | bank row must be UNMATCHED-eligible (no conflicting active row) | writes `bank_reconciliation_matches` only (no audit row — §6) | idempotent-ish: re-running regenerates candidates, doesn't duplicate active rows (unique index backstop) |
| `POST /api/reconciliation/match` | `bankStatementTransactionId`, `transactionId`, `allocatedAmount`, (`fromSuggestionId`?) | new/updated row at `MATCHED` | session cookie | target pair must not already have an active row (unique index) | writes match row | re-submission with same inputs is safe — blocked by unique index, not silently duplicated |
| `POST /api/reconciliation/confirm` | `matchId` | row at `CONFIRMED`, audit row written | session cookie | row must be `MATCHED` (server re-checks, §9's guarded UPDATE) | writes match row + audit row, atomic | double-click-safe via `WHERE status = 'MATCHED'` guard (§9) |
| `POST /api/reconciliation/unmatch` | `matchId`, `reason` | row at `UNMATCHED`, audit row written | session cookie | row must be `CONFIRMED` (guarded UPDATE) | writes match row + audit row, atomic | double-click-safe, same pattern |
| `POST /api/reconciliation/exclude` | `bankStatementTransactionId` or `matchId`, `reason` (required) | row at `EXCLUDED`, audit row written | session cookie | source row must not already be actively matched elsewhere in a conflicting way (app-layer check) | writes match row + audit row | re-submission safe (idempotent outcome, not double-audited — app-layer check before write) |

Every endpoint needs a new `/api/reconciliation/*` prefix added to `src/proxy.ts`'s
`isProtectedApi()`/`matcher`, exactly mirroring the existing `/api/bank-accounts/*` (STEP B.3) and
`/api/bank-statements/*` (STEP C.2) precedent — **not done in this STEP**, flagged here so it isn't
forgotten at implementation time (this exact class of gap was caught and fixed live during STEP C.5 for
the UI page routes).

---

## 14. FUTURE UI CONTRACT (documentation only)

```
Unmatched → Suggested → Review → Confirm → Reconciled
```

Each candidate/review screen must show, per pairing: source bank transaction (date, description,
direction, amount formatted from satang), candidate financial transaction (date, category, amount,
linked order # if any), which bank account, `match_strategy` (matching reason), and any warning
(amount mismatch, date-gap, suspected transfer, already-`CONFIRMED`-then-edited `NEEDS_REVIEW` flag).
`allocated_amount` is shown and editable pre-confirmation, locked after.

**Bulk actions — only these are safe:**
- Bulk-`EXCLUDE` a visually-verified batch of rows the user has confirmed are the same kind of known
  non-accounting noise.
- Bulk `SUGGESTED → MATCHED` **only** when every row in the batch has exactly one unambiguous
  strongest-strategy candidate (no row with multiple candidates or any amount mismatch may be included).

**Bulk actions — explicitly forbidden:**
- Bulk-`CONFIRM` of any kind that skips showing each row's own detail before the single confirming
  action — no "confirm all 40" that a user can click without having seen each pairing.
- Bulk-match across any ambiguous/multi-candidate row.
- Any bulk action touching an already-`CONFIRMED` row — unmatch is always individual and reasoned.

This directly satisfies *"ห้ามออกแบบ bulk confirm ที่สามารถทำ irreversible auto-match"*.

---

## 15. TEST MATRIX (implementation-ready)

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Exact match (unique date+amount+account candidate) | One `SUGGESTED` row via `EXACT_DATE_AMOUNT_ACCOUNT`; requires human `MATCH` then `CONFIRM` |
| 2 | Bank transaction ID match | Not reachable in MVP (`transactions` has no ID field) — verify `BANK_TRANSACTION_ID` strategy path is unreachable/dormant, not broken |
| 3 | Constrained fingerprint | Near-match within tolerance → `SUGGESTED` via `CONSTRAINED_FINGERPRINT`, never auto-confirmed |
| 4 | Duplicate mapping attempt | Second attempt at the same active pair → rejected by unique index (§12), clean error, no duplicate row/audit entry |
| 5 | Same date/amount, multiple bank rows and/or financial rows | No auto-pairing by position (§7) — each must be an individually-made decision; multiple equally-plausible candidates surface together, not silently resolved |
| 6 | One-to-many (1 bank row → N financial rows) | Multiple active rows share `bank_statement_transaction_id`; §3 bank-side invariant enforced |
| 7 | Many-to-one (N bank rows → 1 financial row) | Multiple active rows share `transaction_id`; §3 financial-side invariant enforced |
| 8 | Partial allocation | `allocated_amount` < full amount on either side accepted; sums remain within invariant |
| 9 | Allocation overflow | Attempt to allocate beyond either side's remaining amount → rejected at TS layer before write |
| 10 | Zero allocation | `allocated_amount = 0` → rejected |
| 11 | Transfer | Represented via `EXCLUDED` + `note` (or two independently-confirmed rows) — never auto-booked income+expense |
| 12 | Fee | Linkable to an expense `transactions` row or `EXCLUDED` with `note` — never silently dropped from the unmatched queue until resolved |
| 13 | Refund | Linked without merging with the original bank/financial row (Design Principle 6) |
| 14 | Unknown | `NEEDS_REVIEW` with `note`, surfaced for human decision |
| 15 | Manual confirmation required | `MATCHED → CONFIRMED` never happens without the explicit confirm call — verify no code path performs this transition as a side effect of anything else |
| 16 | GET does not mutate | Every `GET` handler verified to call no write function; repeated `GET` calls produce byte-identical DB state |
| 17 | Unmatch audit | `CONFIRMED → UNMATCHED` creates exactly one audit row with correct `from_status`/`to_status`/`reason`/`performed_by`/`performed_at`; source rows byte-identical before/after |
| 18 | Concurrent confirm | Two simultaneous `POST .../confirm` for the same `matchId` → exactly one succeeds (guarded UPDATE, §9), the other gets a clean "already confirmed" style response |
| 19 | Concurrent unmatch | Same pattern for `POST .../unmatch` |
| 20 | Authorization | Every new endpoint rejects an unauthenticated session (401 for API, redirect for any future page) — same as every existing Finance/Bank endpoint |
| 21 | Cross-account protection | Documented limitation (§11) — verify candidate-generation UI hint (classification-based soft filter) behaves as designed once implemented; verify a manual cross-account match is still technically possible but requires deliberate human action, never silent |
| 22 | Historical transaction protection | No reconciliation action of any kind mutates `transactions.amount`/`date`/`category`/etc. — verify via before/after row comparison in every test above |
| 23 | Order #1 protection | Order #1 (`id=1`, `status='cancelled'`) untouched by any reconciliation test — no income transaction exists for it (per `assertNoDuplicateOrderIncome`), so it naturally starts and stays UNMATCHED with zero mapping rows unless a test explicitly and deliberately creates one against temp data only |
| 24 | Existing 6 transactions protection | All 6 current `transactions` rows verified byte-identical (via row-count + spot-check, matching this engagement's established safety-check convention) before and after any reconciliation test run |

---

## 16. MIGRATION / ROLLOUT

- **Additive only** — both proposed tables are new (`CREATE TABLE IF NOT EXISTS`), no `ALTER TABLE` on
  any existing table, matching this schema's established additive-migration pattern throughout
  `src/lib/db.ts`.
- **Existing data untouched** — `transactions` (6 rows), `bank_statement_transactions` (0 rows,
  verified live end of STEP C.5), `orders` (including Order #1), `customers`, `products` are not
  referenced by any DDL in this document except as the *target* of a new FK (a pure addition, not a
  modification of those tables' own definitions).
- **No backfill** — both new tables start genuinely empty; there is no historical reconciliation state
  to reconstruct, since reconciliation has never existed in this app before.
- **New tables empty by default** — no seed data, no default rows.
- **Backup coverage** — `scripts/backup.ts`'s `db.backup()` (SQLite Online Backup API) copies the entire
  database file regardless of table list, so both new tables are automatically included in every backup
  from the moment they exist, with zero script changes required for correctness. The script's
  `TABLES_TO_COUNT` array (used only for the backup manifest's cosmetic before/after row-count display)
  would need a **one-line future addition** (`"bank_reconciliation_matches"`,
  `"bank_reconciliation_audit"`) at implementation time — purely cosmetic, not a coverage gap, matching
  exactly how STEP B.6/C.2 each added their own tables to this same list after the fact.
- **Confirmed: no schema mutation of any existing money table** (`products`, `orders`, `order_items`,
  `transactions`, `bank_accounts`, `bank_statements`, `bank_statement_transactions`) is proposed
  anywhere in this document.

---

## 17. OPEN DECISIONS

The following genuinely require user approval before STEP D.3 can implement them — not hidden in the
details above:

1. **How is `NEEDS_REVIEW` auto-detection implemented** for a `CONFIRMED` row whose linked
   `transactions` row is later edited/deleted? Two real options:
   - **(a)** Modify `updateTransaction()`/`deleteTransaction()` in `src/lib/transactions.ts` to check
     for an active `CONFIRMED` mapping and flip it to `NEEDS_REVIEW` at write time — this touches an
     **existing file** this STEP's rules forbid touching, and would need its own explicit approval even
     at D.3.
   - **(b)** Lazy, read-time detection: compare `transactions.updated_at` against the mapping row's
     `confirmed_at` whenever the mapping is displayed/queried (`updated_at > confirmed_at` ⇒ flag as
     possibly-stale) — touches no existing file, purely additive read logic in the new
     `src/lib/reconciliation.ts`.
   - **Recommendation**: (b), since it requires zero changes to `transactions.ts` — but this is a real
     design fork affecting D.3's shape, left for explicit user choice, not decided unilaterally here.

2. **Should `deleteTransaction()` gain a guard** against deleting a `transactions` row that has an
   active reconciliation mapping — mirroring the existing `ORDER_LINKED_CONFIRMATION_REQUIRED` pattern
   it already has for order-linked transactions? This would modify `src/lib/transactions.ts`, which
   this STEP's rules explicitly forbid touching (**ห้ามแตะ transactions เดิม**) — flagged rather than
   assumed, even for D.3.

3. **Exact literal value for `confirmed_by`/`unmatched_by`/`performed_by`** (§6's documented
   limitation) — a fixed string constant (e.g. `"admin"`, no new coupling) vs. reading
   `process.env.ADMIN_USERNAME` at write time (slightly more "real," but introduces an env-var
   dependency into `src/lib/reconciliation.ts` that no sibling file — `bankStatements.ts`,
   `bankAccounts.ts`, `transactions.ts` — currently has). Recommendation: the fixed literal, for
   consistency with every existing `src/lib/*.ts` file's total absence of `process.env` reads — final
   choice left to the user.

Everything else in this document (table shapes, enum values, index plan, state machine, invariants) is
a **FINAL DECISION**, with its reasoning stated inline at the point it's made — not left open.

---

## 18. FINAL RECOMMENDATION

- **Exact tables**: `bank_reconciliation_matches` (§2), `bank_reconciliation_audit` (§6) — both new,
  both additive, no changes to any existing table.
- **Exact relationships**: `bank_reconciliation_matches.bank_statement_transaction_id →
  bank_statement_transactions.id`, `bank_reconciliation_matches.transaction_id → transactions.id`,
  `bank_reconciliation_audit.match_id → bank_reconciliation_matches.id` — all FK, no `ON DELETE`, same
  convention as every FK in this schema today.
- **Exact status enum**: `SUGGESTED | MATCHED | CONFIRMED | EXCLUDED | UNMATCHED | NEEDS_REVIEW` (§5),
  with the transition table in §5 as the authoritative source for what's allowed.
- **Exact match strategy enum**: `BANK_TRANSACTION_ID | EXACT_DATE_AMOUNT_ACCOUNT |
  CONSTRAINED_FINGERPRINT | MANUAL` (§4) — `NORMALIZED_CANDIDATE` deliberately excluded.
- **Exact safety invariants**: §3 (money, satang-only, sum-bounded, non-zero), §9 (WHERE-guarded
  atomic transitions), §10 (row-terminal once `CONFIRMED`, re-link via new row), §12 (partial unique
  index preventing duplicate active pairs).
- **Exact next implementation STEP**: **STEP D.3 — Reconciliation Schema Implementation** — applies the
  DDL in §2/§6/§12 to `src/lib/db.ts` (additive `CREATE TABLE IF NOT EXISTS` + indexes, following the
  exact established migration pattern), and creates `src/lib/reconciliation.ts` (CRUD + state-transition
  validation, mirroring `src/lib/bankStatements.ts`'s own structure). **STEP D.3 must not begin until
  the user has explicitly approved this STEP D.2 design — including a decision on Open Decisions 1–3
  above.**

---

STEP D.2 — documentation only, ตามที่อนุมัติ ไม่มีการแก้ schema, migration, API, UI, proxy, dependency,
`.env`, ข้อมูลจริง, หรือสร้าง test data ใดๆ ประกอบเอกสารนี้ ไม่มีการแตะ Order #1, `transactions` เดิม,
หรือ `bank_statement_transactions` เดิมแต่อย่างใด
