"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminEstablishmentProfile } from "../../../../src/server/capabilities/admin-operations/establishment-profile";

export function EstablishmentProfileForm({ initialProfile }: { initialProfile: AdminEstablishmentProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "loading") return;
    const csrf = readCsrfCookie();
    if (!csrf) { setState("error"); return; }
    const form = new FormData(event.currentTarget);
    setState("loading");
    try {
      const response = await fetch("/api/admin/establishment", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          expectedRevision: profile.revision,
          tradeName: String(form.get("tradeName") ?? ""),
          whatsapp: String(form.get("whatsapp") ?? ""),
          address: String(form.get("address") ?? ""),
        }),
      });
      const body = await response.json() as { kind?: string; profile?: AdminEstablishmentProfile };
      if (!response.ok || !body.profile) throw new Error(body.kind === "STALE_RESOURCE" ? "STALE" : "FAILED");
      setProfile(body.profile);
      setState("success");
      router.refresh();
    } catch (error) {
      setState("error");
      if (error instanceof Error && error.message === "STALE") router.refresh();
    }
  }

  const busy = state === "loading";
  return <section className="step" aria-labelledby="profile-title">
    <h2 id="profile-title">Informações públicas</h2>
    <p className="muted">Use um número de WhatsApp com código do país, por exemplo +55 seguido de DDD e número.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="trade-name">Nome comercial</label>
      <input id="trade-name" name="tradeName" defaultValue={profile.tradeName} maxLength={100} autoComplete="organization" required />
      <label htmlFor="establishment-whatsapp">WhatsApp</label>
      <input id="establishment-whatsapp" name="whatsapp" type="tel" defaultValue={profile.whatsapp} pattern="\+[1-9][0-9]{7,14}" maxLength={16} autoComplete="tel" required />
      <label htmlFor="establishment-address">Endereço público</label>
      <textarea id="establishment-address" name="address" defaultValue={profile.address} maxLength={500} autoComplete="street-address" required />
      <button className="primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar configuração"}</button>
    </form>
    <p className={state === "error" ? "error" : state === "success" ? "success" : "muted"} role="status" aria-live="polite">
      {state === "success" ? "Configuração salva e publicada no site." : state === "error" ? "Não foi possível salvar. Atualize a página e confira os dados." : `Revisão ${profile.revision}`}
    </p>
  </section>;
}

function readCsrfCookie(): string | undefined {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
