import { NextResponse } from "next/server";
import { cancelSocialPost, SocialQueueError } from "@/lib/socialQueue";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "รหัส Post คิวไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const cancelled = cancelSocialPost(id);

    return NextResponse.json({ success: true, post: cancelled });
  } catch (error) {
    if (error instanceof SocialQueueError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("POST /api/social/queue/[id]/cancel error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถยกเลิก Post คิวได้" },
      { status: 500 }
    );
  }
}
