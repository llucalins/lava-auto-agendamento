"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { ManagedPackage } from "../../../../src/server/capabilities/admin-operations/package-management";

type MutationState = Readonly<{ kind: "idle" | "loading" | "success" | "error"; message: string }>;

export function PackageAdmin({ initialPackages }: { initialPackages: readonly ManagedPackage[] }) {
  const router = useRouter();
  const [mutation, setMutation] = useState<MutationState>({ kind: "idle", message: "" });

  async function submit(event: FormEvent<HTMLFormElement>, packageId?: string) {
    event.preventDefault();
    if (mutation.kind === "loading") return;
    const csrfToken = readCsrfCookie();
    if (!csrfToken) {
      setMutation({ kind: "error", message: "Não foi possível preparar alterações seguras." });
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      ...(packageId ? { expectedRevision: Number(data.get("expectedRevision")) } : {}),
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? "").trim() || null,
      priceCentavos: Number(data.get("priceCentavos")),
      durationMinutes: Number(data.get("durationMinutes")),
      state: String(data.get("state") ?? ""),
    };
    setMutation({ kind: "loading", message: "Salvando…" });
    try {
      const response = await fetch(packageId ? `/api/admin/packages/${packageId}` : "/api/admin/packages", {
        method: packageId ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { kind?: string };
      if (!response.ok) throw new Error(body.kind === "STALE_RESOURCE" ? "STALE_RESOURCE" : "FAILED");
      setMutation({ kind: "success", message: packageId ? "Nova revisão publicada." : "Pacote criado." });
      if (!packageId) form.reset();
      router.refresh();
    } catch (error) {
      setMutation({
        kind: "error",
        message: error instanceof Error && error.message === "STALE_RESOURCE"
          ? "O pacote mudou. Atualize a página e revise os termos atuais."
          : "A alteração não foi aplicada.",
      });
    }
  }

  const disabled = mutation.kind === "loading";
  return <div className="package-admin">
    <section className="step" aria-labelledby="new-package-title">
      <h2 id="new-package-title">Novo pacote</h2>
      <form onSubmit={(event) => submit(event)}>
        <label htmlFor="new-name">Nome do novo pacote</label>
        <input id="new-name" name="name" maxLength={100} required />
        <label htmlFor="new-description">Descrição do novo pacote</label>
        <textarea id="new-description" name="description" maxLength={1000} />
        <label htmlFor="new-price">Preço em centavos do novo pacote</label>
        <input id="new-price" name="priceCentavos" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required />
        <label htmlFor="new-duration">Duração em minutos do novo pacote</label>
        <input id="new-duration" name="durationMinutes" type="number" min="1" max="480" step="1" required />
        <label htmlFor="new-state">Estado inicial</label>
        <select id="new-state" name="state" defaultValue="ACTIVE"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select>
        <button className="primary" type="submit" disabled={disabled}>Criar pacote</button>
      </form>
    </section>

    <section className="package-list" aria-labelledby="current-packages-title">
      <h2 id="current-packages-title">Pacotes atuais</h2>
      {initialPackages.length === 0 ? <p className="muted">Nenhum pacote configurado.</p> : initialPackages.map((item) => <form className="step" key={item.packageId} onSubmit={(event) => submit(event, item.packageId)}>
        <fieldset aria-label={`Editar ${item.name}`}>
          <legend>{item.name}</legend>
          <p className="muted">Revisão {item.revision} · {item.state}</p>
          <input name="expectedRevision" type="hidden" value={item.revision} readOnly />
          <label htmlFor={`name-${item.packageId}`}>Nome</label>
          <input id={`name-${item.packageId}`} name="name" defaultValue={item.name} maxLength={100} required />
          <label htmlFor={`description-${item.packageId}`}>Descrição</label>
          <textarea id={`description-${item.packageId}`} name="description" defaultValue={item.description ?? ""} maxLength={1000} />
          <label htmlFor={`price-${item.packageId}`}>Preço em centavos</label>
          <input id={`price-${item.packageId}`} name="priceCentavos" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" defaultValue={item.priceCentavos} required />
          <label htmlFor={`duration-${item.packageId}`}>Duração em minutos</label>
          <input id={`duration-${item.packageId}`} name="durationMinutes" type="number" min="1" max="480" step="1" defaultValue={item.durationMinutes} required />
          <label htmlFor={`state-${item.packageId}`}>Estado</label>
          <select id={`state-${item.packageId}`} name="state" defaultValue={item.state}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select>
          <button className="primary" type="submit" disabled={disabled}>Salvar revisão</button>
        </fieldset>
      </form>)}
    </section>
    <p className={mutation.kind === "error" ? "error" : mutation.kind === "success" ? "success" : "muted"} role="status" aria-live="polite">{mutation.message}</p>
  </div>;
}

function readCsrfCookie(): string | undefined {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
