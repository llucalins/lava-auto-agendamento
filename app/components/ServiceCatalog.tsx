"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PackageItem = Readonly<{ id: string; name: string; description: string; priceCentavos: string; durationMinutes: number }>;

function money(value: string) {
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents >= 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
    : "Preço indisponível";
}

export function ServiceCatalog() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/public/packages", { cache: "no-store" });
      if (!response.ok) throw new Error("catalog-unavailable");
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error("invalid-catalog");
      setPackages(body as PackageItem[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <div className="catalog-grid" aria-live="polite">
    {state === "loading" && <p className="muted">Carregando serviços…</p>}
    {state === "error" && <div className="notice notice-error" role="alert"><p>Não foi possível carregar os serviços agora.</p><button className="button button-quiet" onClick={() => void load()}>Tentar novamente</button></div>}
    {state === "ready" && packages.length === 0 && <p className="empty-state">Nenhum pacote disponível no momento.</p>}
    {state === "ready" && packages.map((item) => <article className="service-card" key={item.id}>
      <span className="service-icon" aria-hidden="true">✦</span><h3>{item.name}</h3><p>{item.description}</p><div className="service-meta"><strong>{money(item.priceCentavos)}</strong><span>{item.durationMinutes} min</span></div><Link href={`/booking?packageId=${encodeURIComponent(item.id)}`}>Ver horários <span aria-hidden="true">→</span></Link>
    </article>)}
  </div>;
}
