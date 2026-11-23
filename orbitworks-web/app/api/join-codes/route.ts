import { NextRequest, NextResponse } from "next/server";
import { createJoinCode, errorResponse, listJoinCodes, readJsonBody, requireProAdmin } from "@/lib/joinCodes/server";

// GET: list the caller's company QR codes with computed status + seats.
export async function GET(request: NextRequest) {
  try {
    const caller = await requireProAdmin(request);
    return NextResponse.json(await listJoinCodes(caller));
  } catch (err) {
    return errorResponse("list", err);
  }
}

// POST: create a QR code. companyId comes from the caller's claims only.
export async function POST(request: NextRequest) {
  try {
    const caller = await requireProAdmin(request);
    return NextResponse.json(await createJoinCode(caller, await readJsonBody(request)));
  } catch (err) {
    return errorResponse("create", err);
  }
}
