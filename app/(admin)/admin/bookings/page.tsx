import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_noStore } from "next/cache";
import Link from "next/link";

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
  const labels: Record<BookingListCategory, string> = { today: "Hoje", upcoming: "Próximos", history: "Histórico" };
  return <main className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">Operação</p><h1>Agendamentos</h1><p className="intro">Consulte e gerencie os atendimentos do estabelecimento.</p></div></div><nav aria-label="Categorias de agendamentos" className="admin-tabs">{categories.map((item) => <Link aria-current={item === category ? "page" : undefined} href={`/admin/bookings?category=${item}`} key={item}>{labels[item]}</Link>)}</nav>{bookings.length === 0 ? <section className="admin-empty"><span aria-hidden="true">◷</span><h2>Nenhum agendamento {category === "today" ? "para hoje" : category === "upcoming" ? "próximo" : "no histórico"}</h2><p>Quando houver atendimentos nesta categoria, eles aparecerão aqui.</p></section> : <ul className="booking-list">{bookings.map((booking) => <li key={booking.bookingId}><Link className="booking-row" href={`/admin/bookings/${booking.bookingId}`}><span className="booking-time">{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.serviceStart))}</span><span className="booking-primary"><strong>{booking.fullName}</strong><span>{booking.packageName} · {booking.vehicleModel} · {booking.vehicleColor}</span></span><span className="status-pill">{booking.status}</span><span className="row-arrow" aria-hidden="true">→</span></Link></li>)}</ul>}</main>;
}

function parsePage(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page >= 1 && page <= 100 ? page : 1;
}
