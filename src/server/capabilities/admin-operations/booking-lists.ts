import type { Pool } from "pg";

import { resolveAuthorizedSession } from "../admin-access/authorization";

const PAGE_SIZE = 50;
const MAX_PAGE = 100;

export type BookingListCategory = "today" | "upcoming" | "history";
export type AdminBookingListInput = Readonly<{ category: BookingListCategory; page: number; now: Date }>;
export type AdminBookingListItem = Readonly<{
  bookingId: string;
  serviceStart: string;
  status: string;
  packageName: string;
  serviceMode: string;
  fullName: string;
  vehicleModel: string;
  vehicleColor: string;
}>;

type BookingListRow = Omit<AdminBookingListItem, "serviceStart"> & { serviceStart: Date };
type BookingListPool = Pick<Pool, "query">;

export async function listAdminBookings(
  pool: BookingListPool,
  sessionCookie: string,
  input: AdminBookingListInput,
): Promise<readonly AdminBookingListItem[]> {
  if (!isValidInput(input) || !(await resolveAuthorizedSession(pool, sessionCookie, "BOOKING_READ"))) {
    throw new Error("Forbidden");
  }

  const result = await pool.query<BookingListRow>(
    `select booking.booking_id as "bookingId", booking.service_start as "serviceStart",
            booking.status, snapshot.name as "packageName", booking.service_mode as "serviceMode",
            pii.full_name as "fullName", pii.vehicle_model as "vehicleModel", pii.vehicle_color as "vehicleColor"
     from app.bookings booking
     join app.booking_package_snapshots snapshot on snapshot.booking_id = booking.booking_id
     join app.booking_customer_vehicle_pii pii on pii.booking_id = booking.booking_id
     cross join app.operating_calendar calendar
     where case $1::text
       when 'today' then (booking.service_start at time zone calendar.timezone)::date = ($2::timestamptz at time zone calendar.timezone)::date
       when 'upcoming' then (booking.service_start at time zone calendar.timezone)::date > ($2::timestamptz at time zone calendar.timezone)::date
       when 'history' then (booking.service_start at time zone calendar.timezone)::date < ($2::timestamptz at time zone calendar.timezone)::date
       else false end
     order by booking.service_start ${input.category === "history" ? "desc" : "asc"}
     limit 50 offset $3`,
    [input.category, input.now.toISOString(), (input.page - 1) * PAGE_SIZE],
  );

  return result.rows.map((row) => ({ ...row, serviceStart: row.serviceStart.toISOString() }));
}

function isValidInput(input: AdminBookingListInput): boolean {
  return ["today", "upcoming", "history"].includes(input.category)
    && Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= MAX_PAGE
    && input.now instanceof Date && !Number.isNaN(input.now.getTime());
}
