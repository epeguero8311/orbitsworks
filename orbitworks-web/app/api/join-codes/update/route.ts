import { NextRequest, NextResponse } from "next/server";
import { updateJoinCode, errorResponse, readJsonBody, requireProAdmin } from "@/lib/joinCodes/server";

// POST { token, ... } - the token travels in the body, never the URL.
export async function POST(request: NextRequest) {
  try {
    const caller = await requireProAdmin(request);
    return NextResponse.json(await updateJoinCode(caller, await readJsonBody(request)));
  } catch (err) {
    return errorResponse("update", err);
  }
}
