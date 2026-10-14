import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminBookingDetail } from "../../../../../src/server/capabilities/admin-operations/booking-detail";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";
import BookingActions from "./BookingActions";

const statusLabels: Record<string, string> = {
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export default async function AdminBookingDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let booking;
  try {
    booking = await getAdminBookingDetail(getDatabasePool(), sessionCookie, id);
  } catch {
    notFound();
  }
  if (!booking) notFound();

  const discounted = booking.package.discountCentavos > 0;
  return <main className="admin-page">
    <Link className="back" href="/admin/bookings">← Voltar aos agendamentos</Link>
    <div className="admin-page-heading"><div><p className="eyebrow">Atendimento</p><h1>Detalhes do agendamento</h1></div><span className="status-pill">{statusLabels[booking.status] ?? booking.status}</span></div>
    <section className="step"><h2>Serviço e horário</h2><dl>
      <dt>Serviço</dt><dd>{booking.package.name}</dd>
      <dt>Descrição</dt><dd>{booking.package.description || "—"}</dd>
      <dt>Preço original</dt><dd>{money(booking.package.priceCentavos, booking.package.currency)}</dd>
      {discounted && <><dt>Promoção aplicada</dt><dd>{booking.package.promotionName ?? "Desconto"}</dd><dt>Desconto</dt><dd>−{money(booking.package.discountCentavos, booking.package.currency)}</dd></>}
      <dt>Preço final confirmado</dt><dd><strong>{money(booking.package.finalPriceCentavos, booking.package.currency)}</strong></dd>
      <dt>Duração</dt><dd>{booking.package.durationMinutes} min</dd>
      <dt>Início</dt><dd>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "full", timeStyle: "short" }).format(new Date(booking.serviceStart))}</dd>
      <dt>Término</dt><dd>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }).format(new Date(booking.serviceEnd))}</dd>
    </dl></section>
    <section className="step"><h2>Cliente e veículo</h2><dl>
      <dt>Nome</dt><dd>{booking.fullName}</dd><dt>Telefone</dt><dd>{booking.phoneWhatsapp}</dd><dt>E-mail</dt><dd>{booking.email ?? "Não informado"}</dd>
      <dt>Veículo</dt><dd>{booking.vehicleModel} · {booking.vehicleColor}</dd><dt>Placa</dt><dd>{booking.licencePlate}</dd>
      <dt>Atendimento</dt><dd>{booking.serviceMode === "PICKUP_REQUESTED" ? "Retirada solicitada" : "Entrega na unidade"}</dd><dt>Pagamento previsto</dt><dd>{booking.intendedPaymentMethod}</dd>
    </dl></section>
    <section className="step"><BookingActions bookingId={booking.bookingId} revision={booking.revision} status={booking.status} /></section>
  </main>;
}

function money(centavos: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(centavos / 100);
}
