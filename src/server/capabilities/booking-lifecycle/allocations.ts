import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

type AllocationRow = Readonly<{ allocationId: string }>;

export async function allocateBookingCapacity(
  pool: Pick<Pool, "query">,
  bookingId: string,
): Promise<string | undefined> {
  const result = await pool.query<AllocationRow>(
    `with capacity_booking as (
       select booking_id, service_start, service_end
       from app.bookings
       where booking_id = $2 and status in ('SCHEDULED', 'IN_PROGRESS')
     ), active_unit as (
       select capacity_unit_id
       from app.capacity_units
       where state = 'ACTIVE'
       order by ordinal
       limit 1
     )
     insert into app.capacity_allocations (
       allocation_id, booking_id, capacity_unit_id, service_start, service_end
     )
     select $1, booking.booking_id, unit.capacity_unit_id,
            booking.service_start, booking.service_end
     from capacity_booking booking
     cross join active_unit unit
     returning allocation_id as "allocationId"`,
    [randomUUID(), bookingId],
  );

  return result.rows[0]?.allocationId;
}

export async function releaseCancelledBookingCapacity(
  pool: Pick<Pool, "query">,
  bookingId: string,
): Promise<boolean> {
  const result = await pool.query(
    `update app.capacity_allocations allocation
     set consumes_capacity = false,
         allocation_state = 'RELEASED',
         released_at = current_timestamp
     from app.bookings booking
     where allocation.booking_id = booking.booking_id
       and allocation.booking_id = $1
       and booking.status = 'CANCELLED'
       and allocation.allocation_state = 'ACTIVE'
     returning allocation.allocation_id`,
    [bookingId],
  );

  return result.rows.length === 1;
}
