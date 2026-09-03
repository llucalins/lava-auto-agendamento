"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { CalendarConflict } from "../../../../src/server/capabilities/admin-operations/calendar-conflicts";
import type { CalendarConfiguration } from "../../../../src/server/capabilities/admin-operations/calendar-management";

type ConflictState = Readonly<{ count: number; rows: readonly CalendarConflict[] }> | null;

export function CalendarConflictForm({ initialConfiguration }: { initialConfiguration: CalendarConfiguration }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [conflict, setConflict] = useState<ConflictState>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !date || (conflict && !acknowledged)) return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setStatus("Não foi possível preparar a alteração segura.");
      return;
    }
    const configuration: CalendarConfiguration = {
      ...initialConfiguration,
      overrides: [
        ...initialConfiguration.overrides.filter((override) => override.date !== date),
        { date, kind: "CLOSED" },
      ],
    };
    setLoading(true);
    setStatus("Revalidando calendário e agendamentos…");
    try {
      const response = await fetch("/api/admin/calendar", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ configuration, acknowledgeConflicts: acknowledged }),
      });
      const body = await response.json() as {
        kind?: string;
        conflictCount?: number;
        conflicts?: readonly CalendarConflict[];
      };
      if (response.status === 409 && body.kind === "CONFLICT_WITH_EXISTING_BOOKINGS") {
        setConflict({ count: body.conflictCount ?? 0, rows: body.conflicts ?? [] });
        setAcknowledged(false);
        setStatus("A alteração não foi aplicada. Revise os agendamentos afetados.");
        return;
      }
      if (!response.ok) throw new Error(body.kind === "STALE_RESOURCE" ? "STALE" : "FAILED");
      setStatus("Fechamento aplicado. Os agendamentos existentes foram preservados.");
      setConflict(null);
      setAcknowledged(false);
      setDate("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error && error.message === "STALE"
        ? "O calendário mudou. Atualize a página e revise novamente."
        : "A alteração não foi aplicada.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="step" aria-labelledby="closure-title">
    <h2 id="closure-title">Fechar uma data</h2>
    <form onSubmit={submit}>
      <label htmlFor="closure-date">Data local em America/Fortaleza</label>
      <input id="closure-date" name="closureDate" type="date" required value={date} onChange={(event) => {
        setDate(event.target.value);
        setConflict(null);
        setAcknowledged(false);
      }} />
      {conflict ? <div className="conflict-panel" role="alert">
        <h3>Conflito com {conflict.count} agendamento(s)</h3>
        <ul>{conflict.rows.map((row) => <li key={row.bookingId}>
          <code>{row.bookingId}</code> · {row.serviceDate} · {row.localStart}–{row.localEnd} · {row.status}
        </li>)}</ul>
        {conflict.count > conflict.rows.length ? <p>Exibindo os primeiros {conflict.rows.length} resultados.</p> : null}
        <label className="checkbox-row">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          Reconheço os conflitos e quero aplicar sem mover ou cancelar agendamentos.
        </label>
      </div> : null}
      <button className="primary" type="submit" disabled={loading || !date || Boolean(conflict && !acknowledged)}>
        {conflict ? "Aplicar fechamento reconhecido" : "Revisar e aplicar fechamento"}
      </button>
    </form>
    <p className={status.includes("não") || status.includes("mudou") ? "error" : "muted"} role="status" aria-live="polite">{status}</p>
  </section>;
}

function readCsrfCookie(): string | undefined {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
