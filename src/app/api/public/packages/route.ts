import { NextResponse } from "next/server"; import { listActivePackages } from "../../../../server/capabilities/service-catalog/public-query"; import { getDatabasePool } from "../../../../server/persistence/pool";
export async function GET(){ return NextResponse.json(await listActivePackages(getDatabasePool())); }
