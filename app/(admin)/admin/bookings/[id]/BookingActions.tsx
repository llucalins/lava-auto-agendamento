"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "START" | "COMPLETE" | "CANCEL";

export default function BookingActions({ bookingId, revision, status }: Readonly<{ bookingId: string; revision: number; status: string }>) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function update(action: Action) {
    const csrf = document.cookie.match(/(?:^|;\s*)__Host-admin_csrf=([^;]+)/)?.[1];
    if (!csrf) { setMessage("Sessão sem proteção CSRF válida. Entre novamente."); return; }
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": decodeURIComponent(csrf) },
        body: JSON.stringify({ action, expectedRevision: revision }),
      });
      if (!response.ok) {
        setMessage(response.status === 409 ? "O agendamento mudou. Recarregue e revise antes de tentar novamente." : "Não foi possível aplicar a ação.");
        return;
      }
      setMessage("Agendamento atualizado.");
      router.refresh();
    } catch {
      setMessage("Não foi possível aplicar a ação.");
    } finally {
      setPending(null);
    }
  }

  return <section aria-labelledby="booking-actions-heading">
    <h2 id="booking-actions-heading">Ações</h2>
    {status === "SCHEDULED" && <><button type="button" disabled={pending !== null} onClick={() => void update("START")}>Iniciar atendimento</button><button type="button" disabled={pending !== null} onClick={() => void update("CANCEL")}>Cancelar agendamento</button></>}
    {status === "IN_PROGRESS" && <button type="button" disabled={pending !== null} onClick={() => void update("COMPLETE")}>Concluir atendimento</button>}
    {!['SCHEDULED', 'IN_PROGRESS'].includes(status) && <p>Nenhuma ação disponível para este estado.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
