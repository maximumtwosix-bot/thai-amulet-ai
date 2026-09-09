// Reconciliation — isolated workflow test. Exercises the real Match/Confirm/Exclude/Unmatch state
// transitions via the actual route handlers (src/app/api/reconciliation/**), called in-process
// exactly like the existing STEP E.5/E.6 route tests and sa1500V1E2E.test.ts — no HTTP server, no
// port 3000/3100, src/proxy.ts's auth middleware is not invoked by construction (same disclosed,
// pre-existing limitation as every other route-handler test in this codebase).
//
// Scope and contract verified by the STEP 121 read-only audit against the real source
// (src/lib/reconciliation.ts, src/app/api/reconciliation/**):
//   - MATCH:   SUGGESTED|NEEDS_REVIEW -> MATCHED
//   - CONFIRM: MATCHED|NEEDS_REVIEW   -> CONFIRMED
//   - EXCLUDE: SUGGESTED|MATCHED|NEEDS_REVIEW -> EXCLUDED  (CONFIRMED is NOT a valid source)
//   - UNMATCH: CONFIRMED ONLY -> UNMATCHED    (MATCHED is NOT a valid source — this corrects an
//     initial assumption from before the audit that unmatch was reachable from MATCHED)
//
// Every record this file creates is synthetic and throwaway: one uniquely-named bank account
// (never a real account), its own bank statement, and per-test-case bank_statement_transaction /
// transactions / bank_reconciliation_matches rows. Nothing here reads, writes, or references any
// real bank account, real statement, or real financial transaction. Full cleanup (including the
// bank_reconciliation_audit rows every transition writes) happens in after(), in dependency-safe
// order, regardless of individual test outcomes within this file.
//
// AUTHORIZATION/OWNERSHIP: per the STEP 121 audit, src/lib/reconciliation.ts has no per-user
// ownership model (confirmed_by/unmatched_by/performed_by are always the fixed literal "admin" —
// docs/RECONCILIATION_DATA_MODEL.md §6, an intentional, documented limitation, not a gap). The only
// authorization boundary is proxy.ts's blanket session gate, which this file — like every other
// route-handler test here — bypasses by calling the exported handler directly. No ownership/
// authorization test case is included, per instruction not to fabricate one where no such logic
// exists.
//
// Run: node --import tsx --test "src/lib/__tests__/reconciliationWorkflowE2E.test.ts"

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as suggestPost } from "@/app/api/reconciliation/suggest/route";
import { POST as matchPost } from "@/app/api/reconciliation/[id]/match/route";
import { POST as confirmPost } from "@/app/api/reconciliation/[id]/confirm/route";
import { POST as excludePost } from "@/app/api/reconciliation/[id]/exclude/route";
import { POST as unmatchPost } from "@/app/api/reconciliation/[id]/unmatch/route";
import { GET as detailGet } from "@/app/api/reconciliation/[id]/route";
import { createBankAccount, deleteBankAccount, type BankAccountRow } from "@/lib/bankAccounts";
import {
  createBankStatement,
  createBankStatementTransaction,
  type BankStatementRow,
} from "@/lib/bankStatements";
import { createTransaction } from "@/lib/transactions";
import db from "@/lib/db";

type IdContext = { params: Promise<{ id: string }> };

function idContext(id: number): IdContext {
  return { params: Promise.resolve({ id: String(id) }) };
}

function jsonRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

let account: BankAccountRow;
let statement: BankStatementRow;

// Cleanup tracking — every id this file creates, in creation order, for dependency-safe teardown.
const createdMatchIds: number[] = [];
const createdBankTxnIds: number[] = [];
const createdFinTxnIds: number[] = [];

before(() => {
  account = createBankAccount({
    bankName: "RECON_E2E_TEST_BANK",
    accountName: "Reconciliation E2E Test Account",
    accountNumber: `RECONE2E${Date.now()}`,
    classification: "BUSINESS",
  });

  statement = createBankStatement({
    bankAccountId: account.id,
    sourceFileName: "reconciliation-e2e-test.csv",
    sourceFileHash: `reconhash${Date.now()}`,
    sourceFileUrl: "/generated/bank-statements/reconciliation-e2e-test.csv",
    columnMapping: JSON.stringify({}),
    sourceFileType: "CSV",
  });
});

after(() => {
  // Dependency-safe order: audit rows (children of matches) -> matches -> financial transactions ->
  // bank statement transactions -> bank statement -> bank account. Only ids this file itself
  // created are ever touched.
  for (const matchId of createdMatchIds) {
    db.prepare("DELETE FROM bank_reconciliation_audit WHERE match_id = ?").run(matchId);
  }
  for (const matchId of createdMatchIds) {
    db.prepare("DELETE FROM bank_reconciliation_matches WHERE id = ?").run(matchId);
  }
  for (const finTxnId of createdFinTxnIds) {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(finTxnId);
  }
  for (const bankTxnId of createdBankTxnIds) {
    db.prepare("DELETE FROM bank_statement_transactions WHERE id = ?").run(bankTxnId);
  }
  if (statement) {
    db.prepare("DELETE FROM bank_statements WHERE id = ?").run(statement.id);
  }
  if (account) {
    deleteBankAccount(account.id);
  }
});

// Creates one synthetic bank_statement_transaction + one synthetic financial transaction, both
// credit-side (positive amount), and a SUGGESTED reconciliation match linking them via the real
// POST /api/reconciliation/suggest route. Returns the created match id (already tracked for
// cleanup) plus the two source ids (also already tracked).
async function createSuggestedPair(label: string, amountSatang: number): Promise<number> {
  const bankTxn = createBankStatementTransaction({
    bankStatementId: statement.id,
    transactionDate: "2026-06-01",
    description: `Synthetic reconciliation test bank row (${label})`,
    amount: amountSatang,
    credit: amountSatang,
    duplicateFingerprint: `RECON-E2E-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  createdBankTxnIds.push(bankTxn.id);

  const finTxn = createTransaction({
    transactionType: "income",
    amount: amountSatang / 100,
    transactionDate: "2026-06-01",
    category: "OTHER_INCOME",
    description: `Synthetic reconciliation test financial transaction (${label})`,
  });
  createdFinTxnIds.push(finTxn.id);

  const res = await suggestPost(
    jsonRequest("http://localhost/api/reconciliation/suggest", {
      bankStatementTransactionId: bankTxn.id,
      transactionId: finTxn.id,
      allocatedAmount: amountSatang,
      matchStrategy: "MANUAL",
    })
  );
  const body = await res.json();
  assert.equal(res.status, 201, `suggest failed for ${label}: ${JSON.stringify(body)}`);
  assert.equal(body.data.status, "SUGGESTED");

  const matchId = body.data.id as number;
  createdMatchIds.push(matchId);
  return matchId;
}

// ===== A + B: MATCH, then CONFIRM after MATCH (sequential — B depends on A's match id) =====

let matchIdAB: number;

test("A. MATCH: SUGGESTED -> MATCHED succeeds and state/records are correct", async () => {
  matchIdAB = await createSuggestedPair("AB", 50000);

  const res = await matchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdAB}/match`),
    idContext(matchIdAB)
  );
  const body = await res.json();

  assert.equal(res.status, 200, `match failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.status, "MATCHED");
  assert.equal(body.data.id, matchIdAB);

  // Independently re-read via GET detail to confirm persistence, not just the mutation response.
  const detailRes = await detailGet(
    new NextRequest(`http://localhost/api/reconciliation/${matchIdAB}`),
    idContext(matchIdAB)
  );
  const detailBody = await detailRes.json();
  assert.equal(detailRes.status, 200);
  assert.equal(detailBody.data.status, "MATCHED");
});

test("B. CONFIRM: MATCHED -> CONFIRMED (after Match) succeeds and state/records are correct", async () => {
  assert.ok(matchIdAB, "test A must have run first and set matchIdAB");

  const res = await confirmPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdAB}/confirm`),
    idContext(matchIdAB)
  );
  const body = await res.json();

  assert.equal(res.status, 200, `confirm failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.status, "CONFIRMED");
  assert.ok(body.data.confirmedAt, "confirmedAt must be set");
  assert.equal(body.data.confirmedBy, "admin");

  const detailRes = await detailGet(
    new NextRequest(`http://localhost/api/reconciliation/${matchIdAB}`),
    idContext(matchIdAB)
  );
  const detailBody = await detailRes.json();
  assert.equal(detailBody.data.status, "CONFIRMED");
});

// ===== C: EXCLUDE from SUGGESTED (an explicitly valid source state) =====

test("C. EXCLUDE: SUGGESTED -> EXCLUDED succeeds and state is correct", async () => {
  const matchIdC = await createSuggestedPair("C", 30000);

  const res = await excludePost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdC}/exclude`, {
      reason: "Synthetic reconciliation test exclusion reason",
    }),
    idContext(matchIdC)
  );
  const body = await res.json();

  assert.equal(res.status, 200, `exclude failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.status, "EXCLUDED");
  assert.equal(body.data.note, "Synthetic reconciliation test exclusion reason");
});

// ===== D: UNMATCH from CONFIRMED (the only valid source state per the real contract) =====

test("D. UNMATCH: CONFIRMED -> UNMATCHED succeeds and state/records are correct", async () => {
  const matchIdD = await createSuggestedPair("D", 40000);

  const matchRes = await matchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdD}/match`),
    idContext(matchIdD)
  );
  assert.equal((await matchRes.json()).data.status, "MATCHED");

  const confirmRes = await confirmPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdD}/confirm`),
    idContext(matchIdD)
  );
  assert.equal((await confirmRes.json()).data.status, "CONFIRMED");

  const unmatchRes = await unmatchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdD}/unmatch`, {
      reason: "Synthetic reconciliation test unmatch reason",
    }),
    idContext(matchIdD)
  );
  const unmatchBody = await unmatchRes.json();

  assert.equal(unmatchRes.status, 200, `unmatch failed: ${JSON.stringify(unmatchBody)}`);
  assert.equal(unmatchBody.data.status, "UNMATCHED");
  assert.ok(unmatchBody.data.unmatchedAt, "unmatchedAt must be set");
  assert.equal(unmatchBody.data.unmatchedBy, "admin");
});

// ===== E1/E2: INVALID STATE TRANSITIONS — both asymmetries the STEP 121 audit found in the real
// contract (UNMATCH requires CONFIRMED, not MATCHED; EXCLUDE explicitly excludes CONFIRMED as a
// source). Neither case is guessed — both are direct consequences of the WHERE-guarded UPDATE
// clauses in src/lib/reconciliation.ts. =====

test("E1. INVALID TRANSITION: unmatch on a MATCHED (not yet CONFIRMED) row is rejected", async () => {
  const matchIdE1 = await createSuggestedPair("E1", 60000);

  const matchRes = await matchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdE1}/match`),
    idContext(matchIdE1)
  );
  assert.equal((await matchRes.json()).data.status, "MATCHED");

  const unmatchRes = await unmatchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdE1}/unmatch`, {
      reason: "This should be rejected — row is only MATCHED, not CONFIRMED",
    }),
    idContext(matchIdE1)
  );
  const unmatchBody = await unmatchRes.json();

  assert.equal(unmatchRes.status, 409, `expected 409 CONFLICT, got: ${JSON.stringify(unmatchBody)}`);
  assert.equal(unmatchBody.success, false);

  // Confirm the reject was truly a no-op — status is unchanged, still MATCHED.
  const detailRes = await detailGet(
    new NextRequest(`http://localhost/api/reconciliation/${matchIdE1}`),
    idContext(matchIdE1)
  );
  assert.equal((await detailRes.json()).data.status, "MATCHED");
});

test("E2. INVALID TRANSITION: exclude on a CONFIRMED row is rejected", async () => {
  const matchIdE2 = await createSuggestedPair("E2", 70000);

  const matchRes = await matchPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdE2}/match`),
    idContext(matchIdE2)
  );
  assert.equal((await matchRes.json()).data.status, "MATCHED");

  const confirmRes = await confirmPost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdE2}/confirm`),
    idContext(matchIdE2)
  );
  assert.equal((await confirmRes.json()).data.status, "CONFIRMED");

  const excludeRes = await excludePost(
    jsonRequest(`http://localhost/api/reconciliation/${matchIdE2}/exclude`, {
      reason: "This should be rejected — CONFIRMED is not a valid exclude source",
    }),
    idContext(matchIdE2)
  );
  const excludeBody = await excludeRes.json();

  assert.equal(excludeRes.status, 409, `expected 409, got: ${JSON.stringify(excludeBody)}`);
  assert.equal(excludeBody.success, false);

  const detailRes = await detailGet(
    new NextRequest(`http://localhost/api/reconciliation/${matchIdE2}`),
    idContext(matchIdE2)
  );
  assert.equal((await detailRes.json()).data.status, "CONFIRMED");
});

// ===== Isolation check — confirms this file's own bookkeeping (the ids after() will delete)
// matches exactly what was created: 6 matches (AB, C, D, E1, E2 = 5 pairs, but AB progresses through
// two tests reusing one match id, so 5 total matches / bank txns / financial txns), each with at
// least one audit row (every transition in A/B/C/D/E1/E2 writes exactly one). =====

test("Isolation check: exactly this file's own synthetic records exist, nothing else", () => {
  assert.equal(createdMatchIds.length, 5, "5 reconciliation matches created (AB, C, D, E1, E2)");
  assert.equal(createdBankTxnIds.length, 5, "5 bank statement transactions created");
  assert.equal(createdFinTxnIds.length, 5, "5 financial transactions created");

  const matchCountRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bank_reconciliation_matches WHERE id IN (${createdMatchIds.map(() => "?").join(",")})`
    )
    .get(...createdMatchIds) as { c: number };
  assert.equal(matchCountRow.c, createdMatchIds.length);

  const auditCountRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bank_reconciliation_audit WHERE match_id IN (${createdMatchIds.map(() => "?").join(",")})`
    )
    .get(...createdMatchIds) as { c: number };
  // A/B on the same match = 2 audit rows (MATCHED, CONFIRMED); C = 1 (EXCLUDED); D = 3 (MATCHED,
  // CONFIRMED, UNMATCHED); E1 = 1 (MATCHED — the rejected unmatch writes no audit row); E2 = 2
  // (MATCHED, CONFIRMED — the rejected exclude writes no audit row). Total = 2+1+3+1+2 = 9.
  assert.equal(auditCountRow.c, 9);
});
