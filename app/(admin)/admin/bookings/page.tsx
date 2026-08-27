import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_noStore } from "next/cache";

import { listAdminBookings, type BookingListCategory } from "../../../../src/server/capabilities/admin-operations/booking-lists";
import type { AdminBookingListItem } from "../../../../src/server/capabilities/admin-operations/booking-lists";
import { getDatabasePool } from "../../../../src/server/persistence/pool";

const categories: readonly BookingListCategory[] = ["today", "upcoming", "history"];

export default async function AdminBookingsPage({
  searchParams,
}: { searchParams: Promise<{ category?: string | string[]; page?: string | string[] }> }) {
  unstable_noStore();
  const query = await searchParams;
  const category = categories.includes(query.category as BookingListCategory) ? query.category as BookingListCategory : "today";
  const page = parsePage(query.page);
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let bookings: readonly AdminBookingListItem[];
  try {
    bookings = await listAdminBookings(getDatabasePool(), sessionCookie, { category, page, now: new Date() });
  } catch {
    notFound();
  }
  return <main><h1>Agendamentos</h1><nav aria-label="Categorias de agendamentos">{categories.map((item) => <a href={`/admin/bookings?category=${item}`} key={item}>{item}</a>)}</nav><p>{category}</p><ul>{bookings.map((booking) => <li key={booking.bookingId}>{booking.serviceStart} — {booking.status} — {booking.packageName} — {booking.fullName} — {booking.vehicleModel} — {booking.vehicleColor}</li>)}</ul></main>;
}

function parsePage(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page >= 1 && page <= 100 ? page : 1;
}
