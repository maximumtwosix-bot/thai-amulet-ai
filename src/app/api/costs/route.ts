import { NextResponse } from "next/server";
import {
  AI_COST_OPERATIONS,
  AI_COST_PROVIDERS,
  AI_COST_STATUSES,
  isValidAiCostOperation,
  isValidAiCostProvider,
  isValidAiCostStatus,
  listAiCostLedger,
  toSqliteTimestamp,
  type AiCostLedgerFilters,
} from "@/lib/costLedger";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 100;

// GET /api/costs — STEP 21
//
// รายการ AI generation ledger ดิบ พร้อม filter — ใช้ parameterized query ทุกจุด (ผ่าน
// src/lib/costLedger.ts) ไม่มีการ interpolate ค่าที่มาจาก user ลง SQL string โดยตรงที่ไหนเลย
//
// filters: productId, provider, operation, status, startDate, endDate + pagination (page, pageSize)
// ทุก filter ที่ format ผิดจะคืน 400 เสมอ ไม่พยายามเดาความหมาย
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const filters: AiCostLedgerFilters = {};

    const productIdParam = url.searchParams.get("productId");

    if (productIdParam !== null) {
      const productId = Number(productIdParam);

      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({ error: "productId ไม่ถูกต้อง" }, { status: 400 });
      }

      filters.productId = productId;
    }

    const contentPlanIdParam = url.searchParams.get("contentPlanId");

    if (contentPlanIdParam !== null) {
      const contentPlanId = Number(contentPlanIdParam);

      if (!Number.isInteger(contentPlanId) || contentPlanId <= 0) {
        return NextResponse.json({ error: "contentPlanId ไม่ถูกต้อง" }, { status: 400 });
      }

      filters.contentPlanId = contentPlanId;
    }

    const aiVideoJobIdParam = url.searchParams.get("aiVideoJobId");

    if (aiVideoJobIdParam !== null) {
      const aiVideoJobId = Number(aiVideoJobIdParam);

      if (!Number.isInteger(aiVideoJobId) || aiVideoJobId <= 0) {
        return NextResponse.json({ error: "aiVideoJobId ไม่ถูกต้อง" }, { status: 400 });
      }

      filters.aiVideoJobId = aiVideoJobId;
    }

    const providerParam = url.searchParams.get("provider");

    if (providerParam !== null) {
      if (!isValidAiCostProvider(providerParam)) {
        return NextResponse.json(
          { error: `provider ไม่ถูกต้อง — ต้องเป็นหนึ่งใน: ${AI_COST_PROVIDERS.join(", ")}` },
          { status: 400 }
        );
      }

      filters.provider = providerParam;
    }

    const operationParam = url.searchParams.get("operation");

    if (operationParam !== null) {
      if (!isValidAiCostOperation(operationParam)) {
        return NextResponse.json(
          { error: `operation ไม่ถูกต้อง — ต้องเป็นหนึ่งใน: ${AI_COST_OPERATIONS.join(", ")}` },
          { status: 400 }
        );
      }

      filters.operation = operationParam;
    }

    const statusParam = url.searchParams.get("status");

    if (statusParam !== null) {
      if (!isValidAiCostStatus(statusParam)) {
        return NextResponse.json(
          { error: `status ไม่ถูกต้อง — ต้องเป็นหนึ่งใน: ${AI_COST_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }

      filters.status = statusParam;
    }

    const startDateParam = url.searchParams.get("startDate");

    if (startDateParam !== null) {
      const startDate = new Date(startDateParam);

      if (Number.isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "startDate ไม่ถูกต้อง" }, { status: 400 });
      }

      filters.startDate = toSqliteTimestamp(startDate);
    }

    const endDateParam = url.searchParams.get("endDate");

    if (endDateParam !== null) {
      const endDate = new Date(endDateParam);

      if (Number.isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "endDate ไม่ถูกต้อง" }, { status: 400 });
      }

      filters.endDate = toSqliteTimestamp(endDate);
    }

    const pageParam = Number(url.searchParams.get("page") || "1");
    const pageSizeParam = Number(url.searchParams.get("pageSize") || "20");

    if (url.searchParams.get("page") !== null && (!Number.isInteger(pageParam) || pageParam <= 0)) {
      return NextResponse.json({ error: "page ไม่ถูกต้อง" }, { status: 400 });
    }

    if (
      url.searchParams.get("pageSize") !== null &&
      (!Number.isInteger(pageSizeParam) || pageSizeParam <= 0 || pageSizeParam > MAX_PAGE_SIZE)
    ) {
      return NextResponse.json(
        { error: `pageSize ไม่ถูกต้อง (สูงสุด ${MAX_PAGE_SIZE})` },
        { status: 400 }
      );
    }

    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize =
      Number.isInteger(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= MAX_PAGE_SIZE
        ? pageSizeParam
        : 20;

    const result = listAiCostLedger(filters, { page, pageSize });

    return NextResponse.json({ success: true, ...result, page, pageSize });
  } catch (error) {
    console.error("GET /api/costs error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลต้นทุน AI ได้" }, { status: 500 });
  }
}
