"use client";

import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import type { CalendarConflict } from "../../../../src/server/capabilities/admin-operations/calendar-conflicts";
import type { CalendarConfiguration } from "../../../../src/server/capabilities/admin-operations/calendar-management";

type ConflictState = Readonly<{ count: number; rows: readonly CalendarConflict[] }> | null;
type Window = CalendarConfiguration["weeklySchedule"][number]["windows"][number];
const subscribeToHydration = () => () => {};
const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function CalendarConflictForm({ initialConfiguration }: { initialConfiguration: CalendarConfiguration }) {
  const router = useRouter();
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [closeDate, setCloseDate] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"CLOSED" | "OPEN">("OPEN");
  const [exceptionWindows, setExceptionWindows] = useState<Window[]>([{ start: "08:00", end: "17:00" }]);
  const [blockDate, setBlockDate] = useState("");
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [conflict, setConflict] = useState<ConflictState>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  function update(next: CalendarConfiguration) {
    setConfiguration(next);
    setConflict(null);
    setAcknowledged(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value ?? "save";
    let next = configuration;
    if (action === "close") {
      if (!closeDate) return;
      next = { ...configuration, overrides: [...configuration.overrides.filter((item) => item.date !== closeDate), { date: closeDate, kind: "CLOSED" }] };
    }
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setStatus("Não foi possível preparar a alteração segura.");
      return;
    }
    setLoading(true);
    setStatus("Revalidando calendário, capacidade e agendamentos…");
    try {
      const response = await fetch("/api/admin/calendar", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ configuration: next, acknowledgeConflicts: acknowledged }),
      });
      const body = await response.json() as {
        kind?: string;
        conflictCount?: number;
        conflicts?: readonly CalendarConflict[];
        calendarRevision?: number;
      };
      if (response.status === 409 && body.kind === "CONFLICT_WITH_EXISTING_BOOKINGS") {
        setConflict({ count: body.conflictCount ?? 0, rows: body.conflicts ?? [] });
        setAcknowledged(false);
        setStatus("A alteração não foi aplicada. Revise os agendamentos afetados.");
        return;
      }
      if (!response.ok) throw new Error(body.kind === "STALE_RESOURCE" ? "STALE" : "FAILED");
      setConfiguration({ ...next, expectedRevision: body.calendarRevision ?? next.expectedRevision + 1 });
      setStatus(action === "close"
        ? "Fechamento aplicado. Os agendamentos existentes foram preservados."
        : "Calendário salvo. Os agendamentos existentes foram preservados.");
      setConflict(null);
      setAcknowledged(false);
      setCloseDate("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error && error.message === "STALE"
        ? "O calendário mudou. Atualize a página e revise novamente."
        : "A alteração não foi aplicada. Confira horários e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function changeDay(weekday: number, change: (windows: Window[]) => Window[]) {
    update({
      ...configuration,
      weeklySchedule: configuration.weeklySchedule.map((day) => day.weekday === weekday
        ? { ...day, windows: change([...day.windows]) }
        : day),
    });
  }

  function addException() {
    if (!exceptionDate) return;
    const override = exceptionKind === "CLOSED"
      ? { date: exceptionDate, kind: "CLOSED" as const }
      : { date: exceptionDate, kind: "OPEN" as const, windows: exceptionWindows };
    update({ ...configuration, overrides: [...configuration.overrides.filter((item) => item.date !== exceptionDate), override] });
    setExceptionDate("");
  }

  function addBlock() {
    try {
      const start = fortalezaLocalToIso(blockDate, blockStart);
      const end = fortalezaLocalToIso(blockDate, blockEnd);
      if (start >= end) throw new Error("invalid interval");
      update({ ...configuration, unavailability: [...configuration.unavailability, { start, end }] });
      setBlockDate("");
    } catch {
      setStatus("Informe uma data e um intervalo válido no fuso America/Fortaleza.");
    }
  }

  return <section className="step" aria-labelledby="calendar-editor-title">
    <h2 id="calendar-editor-title">Editar calendário</h2>
    <p className="muted">Configure horários locais. Intervalos separados criam pausas entre atendimentos.</p>
    <form onSubmit={submit}>
      <label htmlFor="calendar-capacity">Atendimentos simultâneos</label>
      <input id="calendar-capacity" type="number" min={1} max={20} step={1} required disabled={!hydrated || loading}
        value={configuration.capacity} onChange={(event) => update({ ...configuration, capacity: Number(event.target.value) })} />

      <fieldset className="calendar-weekly"><legend>Funcionamento semanal</legend>
        {configuration.weeklySchedule.map((day) => <fieldset className="calendar-day" key={day.weekday}>
          <legend>{weekdays[day.weekday]}</legend>
          <label className="checkbox-row">
            <input type="checkbox" checked={day.windows.length > 0} disabled={!hydrated || loading}
              onChange={(event) => changeDay(day.weekday, (windows) => event.target.checked
                ? (windows.length ? windows : [{ start: "08:00", end: "17:00" }])
                : [])} />
            Abrir neste dia
          </label>
          {day.windows.map((window, index) => <div className="calendar-window" key={`${day.weekday}-${index}`}>
            <label htmlFor={`day-${day.weekday}-start-${index}`}>Abertura {index + 1}</label>
            <input id={`day-${day.weekday}-start-${index}`} type="time" value={window.start} disabled={!hydrated || loading}
              onChange={(event) => changeDay(day.weekday, (windows) => windows.map((item, at) => at === index ? { ...item, start: event.target.value } : item))} />
            <label htmlFor={`day-${day.weekday}-end-${index}`}>Fechamento {index + 1}</label>
            <input id={`day-${day.weekday}-end-${index}`} type="time" value={window.end} disabled={!hydrated || loading}
              onChange={(event) => changeDay(day.weekday, (windows) => windows.map((item, at) => at === index ? { ...item, end: event.target.value } : item))} />
            <button type="button" disabled={!hydrated || loading} onClick={() => changeDay(day.weekday, (windows) => windows.filter((_, at) => at !== index))}>Remover faixa</button>
          </div>)}
          {day.windows.length > 0 && <button type="button" disabled={!hydrated || loading || day.windows.length >= 8}
            onClick={() => changeDay(day.weekday, (windows) => [...windows, { start: "13:00", end: "17:00" }])}>Adicionar faixa / pausa</button>}
        </fieldset>)}
      </fieldset>

      <section className="calendar-subsection" aria-labelledby="exceptions-title">
        <h3 id="exceptions-title">Feriados e datas especiais</h3>
        <div>
          <label htmlFor="exception-date">Data local da exceção</label>
          <input id="exception-date" type="date" value={exceptionDate} disabled={!hydrated || loading} onChange={(event) => setExceptionDate(event.target.value)} />
          <label htmlFor="exception-kind">Regra para a data</label>
          <select id="exception-kind" value={exceptionKind} disabled={!hydrated || loading} onChange={(event) => setExceptionKind(event.target.value as "CLOSED" | "OPEN")}>
            <option value="CLOSED">Fechado (folga ou feriado)</option><option value="OPEN">Abrir com horário especial</option>
          </select>
          {exceptionKind === "OPEN" && exceptionWindows.map((window, index) => <div className="calendar-window" key={index}>
            <label htmlFor={`exception-start-${index}`}>Abertura especial {index + 1}</label>
            <input id={`exception-start-${index}`} type="time" value={window.start} disabled={!hydrated || loading}
              onChange={(event) => setExceptionWindows(exceptionWindows.map((item, at) => at === index ? { ...item, start: event.target.value } : item))} />
            <label htmlFor={`exception-end-${index}`}>Fechamento especial {index + 1}</label>
            <input id={`exception-end-${index}`} type="time" value={window.end} disabled={!hydrated || loading}
              onChange={(event) => setExceptionWindows(exceptionWindows.map((item, at) => at === index ? { ...item, end: event.target.value } : item))} />
            <button type="button" disabled={!hydrated || loading || exceptionWindows.length === 1} onClick={() => setExceptionWindows(exceptionWindows.filter((_, at) => at !== index))}>Remover faixa</button>
          </div>)}
          {exceptionKind === "OPEN" && <button type="button" disabled={!hydrated || loading || exceptionWindows.length >= 8}
            onClick={() => setExceptionWindows([...exceptionWindows, { start: "13:00", end: "17:00" }])}>Adicionar faixa especial</button>}
          <button className="secondary" type="button" onClick={addException} disabled={!hydrated || loading || !exceptionDate}>Adicionar exceção</button>
        </div>
        {configuration.overrides.length === 0 ? <p className="muted">Nenhuma data especial cadastrada.</p> : <ul>
          {configuration.overrides.map((item) => <li key={item.date}>{item.date} — {item.kind === "CLOSED" ? "Fechado" : item.windows.map((window) => `${window.start}–${window.end}`).join(", ")}
            <button type="button" disabled={!hydrated || loading} onClick={() => update({ ...configuration, overrides: configuration.overrides.filter((row) => row.date !== item.date) })}>Remover</button>
          </li>)}
        </ul>}
      </section>

      <section className="calendar-subsection" aria-labelledby="blocks-title">
        <h3 id="blocks-title">Pausas e bloqueios de data</h3>
        <p className="muted">Use um bloqueio para indisponibilidade pontual dentro do horário de funcionamento.</p>
        <div>
          <label htmlFor="block-date">Data do bloqueio (America/Fortaleza)</label>
          <input id="block-date" type="date" value={blockDate} disabled={!hydrated || loading} onChange={(event) => setBlockDate(event.target.value)} />
          <label htmlFor="block-start">Início do bloqueio</label>
          <input id="block-start" type="time" value={blockStart} disabled={!hydrated || loading} onChange={(event) => setBlockStart(event.target.value)} />
          <label htmlFor="block-end">Fim do bloqueio</label>
          <input id="block-end" type="time" value={blockEnd} disabled={!hydrated || loading} onChange={(event) => setBlockEnd(event.target.value)} />
          <button className="secondary" type="button" onClick={addBlock} disabled={!hydrated || loading || !blockDate}>Adicionar bloqueio</button>
        </div>
        {configuration.unavailability.length === 0 ? <p className="muted">Nenhum bloqueio temporário cadastrado.</p> : <ul>
          {configuration.unavailability.map((item, index) => <li key={`${item.start}-${index}`}>{formatFortaleza(item.start)}–{formatFortaleza(item.end)}
            <button type="button" disabled={!hydrated || loading} onClick={() => update({ ...configuration, unavailability: configuration.unavailability.filter((_, at) => at !== index) })}>Remover</button>
          </li>)}
        </ul>}
      </section>

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
      <button className="primary" type="submit" value="save" disabled={!hydrated || loading || Boolean(conflict && !acknowledged)}>
        {conflict ? "Aplicar alteração reconhecida" : "Revisar e salvar calendário"}
      </button>
      <label htmlFor="closure-date">Data local em America/Fortaleza</label>
      <input id="closure-date" name="closureDate" type="date" disabled={!hydrated || loading} value={closeDate} onChange={(event) => {
        setCloseDate(event.target.value);
        setConflict(null);
        setAcknowledged(false);
      }} />
      <button className="secondary" type="submit" value="close" disabled={!hydrated || loading || !closeDate || Boolean(conflict && !acknowledged)}>
        {conflict ? "Aplicar fechamento reconhecido" : "Revisar e aplicar fechamento"}
      </button>
    </form>
    <p className={status.includes("não") || status.includes("mudou") || status.includes("válido") ? "error" : "muted"} role="status" aria-live="polite">{status}</p>
  </section>;
}

function readCsrfCookie(): string | undefined {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function fortalezaLocalToIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("invalid local date-time");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let instant = desired;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const difference = desired - represented;
    if (difference === 0) return new Date(instant).toISOString();
    instant += difference;
  }
  throw new Error("invalid local date-time");
}

function formatFortaleza(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}
