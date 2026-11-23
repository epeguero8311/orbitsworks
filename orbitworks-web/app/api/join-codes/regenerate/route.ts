import { NextRequest, NextResponse } from "next/server";
import { regenerateJoinCode, errorResponse, readJsonBody, requireProAdmin } from "@/lib/joinCodes/server";

// POST { token, ... } - the token travels in the body, never the URL.
export async function POST(request: NextRequest) {
  try {
    const caller = await requireProAdmin(request);
    return NextResponse.json(await regenerateJoinCode(caller, await readJsonBody(request)));
  } catch (err) {
    return errorResponse("regenerate", err);
  }
}
