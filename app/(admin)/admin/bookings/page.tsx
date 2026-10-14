import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_noStore } from "next/cache";
import Link from "next/link";

import styles from "./booking-list.module.css";
import { listAdminBookings, type BookingListCategory, type BookingStatusFilter } from "../../../../src/server/capabilities/admin-operations/booking-lists";
import type { AdminBookingListItem } from "../../../../src/server/capabilities/admin-operations/booking-lists";
import { getDatabasePool } from "../../../../src/server/persistence/pool";

const categories: readonly BookingListCategory[] = ["today", "upcoming", "history"];
const statuses: readonly BookingStatusFilter[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const statusLabels: Record<BookingStatusFilter, string> = {
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export default async function AdminBookingsPage({
  searchParams,
}: { searchParams: Promise<{ category?: string | string[]; page?: string | string[]; status?: string | string[] }> }) {
  unstable_noStore();
  const query = await searchParams;
  const category = categories.includes(query.category as BookingListCategory) ? query.category as BookingListCategory : "today";
  const page = parsePage(query.page);
  const status = parseStatus(query.status);
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let bookings: readonly AdminBookingListItem[];
  let hasNextPage = false;
  try {
    const result = await listAdminBookings(getDatabasePool(), sessionCookie, { category, page, now: new Date(), status });
    bookings = result.items;
    hasNextPage = result.hasNextPage;
  } catch {
    notFound();
  }

  const categoryLabels: Record<BookingListCategory, string> = { today: "Hoje", upcoming: "Próximos", history: "Histórico" };
  return <main className="admin-page">
    <div className="admin-page-heading"><div><p className="eyebrow">Operação</p><h1>Agendamentos</h1><p className="intro">Consulte e gerencie os atendimentos do estabelecimento.</p></div></div>
    <nav aria-label="Categorias de agendamentos" className="admin-tabs">
      {categories.map((item) => <Link aria-current={item === category ? "page" : undefined} href={listUrl(item, status)} key={item}>{categoryLabels[item]}</Link>)}
    </nav>
    <form className={styles.filter} method="get">
      <input type="hidden" name="category" value={category} />
      <label htmlFor="booking-status-filter">Filtrar por status</label>
      <select id="booking-status-filter" name="status" defaultValue={status ?? "ALL"}>
        <option value="ALL">Todos os status</option>
        {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
      </select>
      <button className="secondary" type="submit">Aplicar filtro</button>
      {status && <Link href={listUrl(category)}>Limpar</Link>}
    </form>
    {bookings.length === 0
      ? <section className="admin-empty"><span aria-hidden="true">◷</span><h2>Nenhum agendamento {status ? `com status ${statusLabels[status]}` : category === "today" ? "para hoje" : category === "upcoming" ? "próximo" : "no histórico"}</h2><p>Quando houver atendimentos nesta categoria, eles aparecerão aqui.</p></section>
      : <ul className="booking-list">{bookings.map((booking) => <BookingRow key={booking.bookingId} booking={booking} />)}</ul>}
    {(page > 1 || hasNextPage) && <nav className="admin-tabs" aria-label="Paginação de agendamentos">
      {page > 1 && <Link href={listUrl(category, status, page - 1)}>Página anterior</Link>}
      <span aria-current="page">Página {page}</span>
      {hasNextPage && <Link href={listUrl(category, status, page + 1)}>Próxima página</Link>}
    </nav>}
  </main>;
}

function BookingRow({ booking }: { booking: AdminBookingListItem }) {
  const discounted = booking.discountCentavos !== "0";
  return <li>
    <Link className="booking-row" href={`/admin/bookings/${booking.bookingId}`}>
      <span className="booking-time">{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.serviceStart))}</span>
      <span className="booking-primary"><strong>{booking.fullName}</strong><span>{booking.packageName} · {booking.vehicleModel} · {booking.vehicleColor}</span>
        <span>{money(booking.finalPriceCentavos)}{discounted && <> · <s>{money(booking.basePriceCentavos)}</s> · {booking.promotionName ?? "Desconto"} ({money(booking.discountCentavos)})</>}</span>
      </span>
      <span className="status-pill">{statusLabels[booking.status as BookingStatusFilter] ?? booking.status}</span><span className="row-arrow" aria-hidden="true">→</span>
    </Link>
  </li>;
}

function listUrl(category: BookingListCategory, status?: BookingStatusFilter, page = 1): string {
  return `/admin/bookings?category=${category}${status ? `&status=${status}` : ""}${page > 1 ? `&page=${page}` : ""}`;
}

function parsePage(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page >= 1 && page <= 100 ? page : 1;
}

function parseStatus(value: string | string[] | undefined): BookingStatusFilter | undefined {
  return typeof value === "string" && statuses.includes(value as BookingStatusFilter) ? value as BookingStatusFilter : undefined;
}

function money(centavos: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(centavos) / 100);
}
