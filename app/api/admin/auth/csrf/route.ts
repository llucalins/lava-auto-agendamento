import { NextResponse } from "next/server";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  return NextResponse.json(
    { kind: "GONE" },
    { status: 410, headers: noStore },
  );
}
