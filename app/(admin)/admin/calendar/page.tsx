import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getCalendarConfiguration } from "../../../../src/server/capabilities/admin-operations/calendar-management";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { CalendarConflictForm } from "./calendar-conflict-form";

export default async function AdminCalendarPage() {
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let current: Awaited<ReturnType<typeof getCalendarConfiguration>>;
  try {
    current = await getCalendarConfiguration(getDatabasePool(), sessionCookie);
  } catch {
    notFound();
  }

  return <main><div className="admin-shell">
    <p className="eyebrow">Administração</p>
    <h1>Calendário operacional</h1>
    <p className="intro">Horários interpretados em {current.timezone}. Agendamentos existentes nunca são movidos ou cancelados automaticamente.</p>
    <section className="step" aria-labelledby="calendar-summary-title">
      <h2 id="calendar-summary-title">Configuração atual</h2>
      <p>Revisão {current.configuration.expectedRevision}</p>
      <p>{current.configuration.overrides.length} exceções de data · {current.configuration.unavailability.length} bloqueios temporários</p>
    </section>
    <CalendarConflictForm initialConfiguration={current.configuration} />
  </div></main>;
}
