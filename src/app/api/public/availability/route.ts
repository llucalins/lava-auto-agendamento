import { NextResponse } from "next/server";

import {
  findSelectableStarts,
  parseAvailabilityRequest,
} from "../../../../server/capabilities/operating-calendar/availability";
import type { AvailabilityRequest } from "../../../../server/capabilities/operating-calendar/availability";
import { getDatabasePool } from "../../../../server/persistence/pool";
import { routeResourcePolicies, runWithRouteConcurrency } from "../../../../server/security/resource-controls";

export async function GET(request: Request) {
  if (request.url.length > routeResourcePolicies.availability.maxQueryBytes) {
    return NextResponse.json({ error: "Availability request is invalid." }, { status: 400 });
  }
  try {
    return await runWithRouteConcurrency("availability", () => getAvailability(request), routeResourcePolicies.availability.maxConcurrent);
  } catch {
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 503 });
  }
}

async function getAvailability(request: Request) {
  let availabilityRequest: AvailabilityRequest;

  try {
    const url = new URL(request.url);
    availabilityRequest = parseAvailabilityRequest({
      packageId: url.searchParams.get("packageId"),
      starts: url.searchParams.getAll("start"),
    });
  } catch {
    return NextResponse.json(
      { error: "Availability request is invalid." },
      { status: 400 },
    );
  }

  const availableStarts = await findSelectableStarts(
    getDatabasePool(),
    availabilityRequest,
  );

  return NextResponse.json({ availableStarts });
}
