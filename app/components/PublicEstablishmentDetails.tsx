"use client";

import { useEffect, useState } from "react";

type Profile = Readonly<{ tradeName: string; whatsapp: string; address: string }>;

export function PublicEstablishmentDetails() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/public/establishment", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<{ profile: Profile | null }>;
      })
      .then((body) => { if (active) { setProfile(body.profile); setState("ready"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <p className="muted" aria-live="polite">Carregando informações do estabelecimento…</p>;
  if (state === "error") return <p className="muted" role="status">Informações de contato temporariamente indisponíveis.</p>;
  if (!profile) return <p className="muted">Informações do estabelecimento ainda não configuradas.</p>;

  const phone = profile.whatsapp.replace(/\D/g, "");
  return <address className="public-establishment-details">
    <strong>{profile.tradeName}</strong>
    <span>{profile.address}</span>
    <a href={`https://wa.me/${phone}`}>WhatsApp: {profile.whatsapp}</a>
  </address>;
}
