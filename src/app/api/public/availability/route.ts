import { NextResponse } from "next/server";

import {
  findSelectableStarts,
  parseAvailabilityRequest,
} from "../../../../server/capabilities/operating-calendar/availability";
import type { AvailabilityRequest } from "../../../../server/capabilities/operating-calendar/availability";
import { getDatabasePool } from "../../../../server/persistence/pool";

export async function GET(request: Request) {
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
