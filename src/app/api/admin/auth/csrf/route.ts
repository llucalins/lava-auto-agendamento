import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ kind: "GONE" }, { status: 410, headers: { "cache-control": "no-store" } });
}
