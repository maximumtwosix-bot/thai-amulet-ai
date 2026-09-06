import { listTaxpayerProfiles } from "./taxpayerProfile";

// STEP 113 — read-only session-bootstrap resolution (STEP 112 Option A design, item 1 only). This
// file makes NO ownership decision and enforces NOTHING — it only answers, deterministically and
// safely, "which single taxpayer_profiles row (if any) may this login bind the new session to,
// without guessing." Called exactly once, from src/app/api/auth/login/route.ts, at the moment a
// session token is minted — never on ordinary request handling. Reuses the existing, unmodified
// listTaxpayerProfiles() (src/lib/taxpayerProfile.ts, STEP 93) — no new DAL function, no new
// query, no write of any kind, no taxpayer created or modified here.

export type TaxpayerBootstrapResult =
  | { status: "BOUND"; taxpayerProfileId: number }
  | { status: "UNAVAILABLE" }
  | { status: "AMBIGUOUS" };

// Exactly one active taxpayer_profiles row -> bind the session to it (the realistic,
// zero-friction single-operator case). Zero active rows -> UNAVAILABLE, the session is still
// issued per existing authentication behavior, but carries no taxpayer identity — a later STEP's
// ownership checks must treat this as "fail closed", never "assume one". More than one active row
// -> AMBIGUOUS: this function never guesses which one is "the" taxpayer — that would be exactly
// the silent-selection behavior STEP 113 is explicitly forbidden from doing.
export function resolveBootstrapTaxpayerProfileId(): TaxpayerBootstrapResult {
  const activeProfiles = listTaxpayerProfiles({ isActive: true });

  if (activeProfiles.length === 1) {
    return { status: "BOUND", taxpayerProfileId: activeProfiles[0].id };
  }

  if (activeProfiles.length === 0) {
    return { status: "UNAVAILABLE" };
  }

  return { status: "AMBIGUOUS" };
}
