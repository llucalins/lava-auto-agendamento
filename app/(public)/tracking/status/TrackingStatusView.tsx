"use client";

import { useEffect, useState } from "react";

type TrackingStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type ViewState = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; status: TrackingStatus };

const labels: Record<TrackingStatus, string> = {
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export default function TrackingStatusView() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadTrackingStatus().then((nextState) => {
        if (active) setState(nextState);
      });
    };
    refresh();
    const refreshAfterHistoryRestore = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("pageshow", refreshAfterHistoryRestore);
    return () => {
      active = false;
      window.removeEventListener("pageshow", refreshAfterHistoryRestore);
    };
  }, []);

  if (state.kind === "loading") return <p role="status">Consultando status…</p>;
  if (state.kind === "invalid") return <p role="alert">Acesso de acompanhamento expirado ou inválido.</p>;
  return <p role="status">{labels[state.status]}</p>;
}

async function loadTrackingStatus(): Promise<ViewState> {
  try {
    const response = await fetch("/api/public/tracking/status", { cache: "no-store" });
    const body = await response.json() as { status?: unknown };
    return response.ok && typeof body.status === "string" && body.status in labels
      ? { kind: "ready", status: body.status as TrackingStatus }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}
