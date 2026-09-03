import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAdminBookingDetail } from "../../../../../src/server/capabilities/admin-operations/booking-detail";
import { getDatabasePool } from "../../../../../src/server/persistence/pool";

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

  return <main>
    <h1>Detalhes do agendamento</h1>
    <p>{booking.serviceStart} — {booking.serviceEnd} — {booking.status}</p>
    <p>{booking.package.name} — {booking.package.description} — {booking.package.priceCentavos} {booking.package.currency} — {booking.package.durationMinutes} min</p>
    <p>{booking.intendedPaymentMethod} — {booking.serviceMode}</p>
    <p>{booking.fullName} — {booking.phoneWhatsapp} — {booking.email ?? "Sem e-mail"}</p>
    <p>{booking.vehicleModel} — {booking.licencePlate} — {booking.vehicleColor}</p>
  </main>;
}
