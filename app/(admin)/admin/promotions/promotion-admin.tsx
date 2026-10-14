"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { ManagedPackage } from "../../../../src/server/capabilities/admin-operations/package-management";
import type { ManagedPromotion } from "../../../../src/server/capabilities/promotions/management";

type MutationState = Readonly<{ kind: "idle" | "loading" | "success" | "error"; message: string }>;
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function PromotionAdmin({
  initialPromotions,
  packages,
}: { initialPromotions: readonly ManagedPromotion[]; packages: readonly ManagedPackage[] }) {
  const router = useRouter();
  const [mutation, setMutation] = useState<MutationState>({ kind: "idle", message: "" });

  async function submit(event: FormEvent<HTMLFormElement>, current?: ManagedPromotion) {
    event.preventDefault();
    if (mutation.kind === "loading") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = String(data.get("discountKind"));
    const rawValue = String(data.get("discountValue") ?? "").trim().replace(",", ".");
    const discountValue = kind === "FIXED" ? toCentavos(rawValue) : Number(rawValue);
    const recurring = data.get("recurring") === "on";
    const payload = {
      ...(current ? { expectedRevision: current.revision } : {}),
      name: String(data.get("name") ?? ""),
      discountKind: kind,
      discountValue,
      packageIds: data.getAll("packageIds").map(String),
      state: String(data.get("state") ?? "ACTIVE"),
      validFrom: String(data.get("validFrom") ?? ""),
      validThrough: String(data.get("validThrough") ?? ""),
      ...(recurring ? {
        weekdays: data.getAll("weekdays").map(Number),
        startsAt: String(data.get("startsAt") ?? ""),
        endsAt: String(data.get("endsAt") ?? ""),
      } : {}),
    };
    const csrf = readCsrfCookie();
    if (!csrf) {
      setMutation({ kind: "error", message: "Não foi possível preparar uma alteração segura. Recarregue o painel." });
      return;
    }
    setMutation({ kind: "loading", message: "Salvando promoção…" });
    try {
      const response = await fetch(current ? `/api/admin/promotions/${current.promotionId}` : "/api/admin/promotions", {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { kind?: string };
      if (!response.ok) throw new Error(result.kind ?? "FAILED");
      setMutation({ kind: "success", message: current ? "Promoção atualizada." : "Promoção criada." });
      if (!current) form.reset();
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "FAILED";
      const message = code === "PROMOTION_CONFLICT"
        ? "Conflito: outro desconto atende o mesmo serviço em parte dessa data e horário. Ajuste a vigência."
        : code === "DISCOUNT_EXCEEDS_PRICE"
          ? "O desconto fixo não pode superar o preço atual do serviço."
          : code === "STALE_RESOURCE"
            ? "A promoção mudou em outra sessão. Atualize a página antes de salvar."
            : "A promoção não foi aplicada. Confira os campos e tente novamente.";
      setMutation({ kind: "error", message });
    }
  }

  return <div className="promotion-admin">
    <section className="step" aria-labelledby="new-promotion-title">
      <h2 id="new-promotion-title">Nova promoção</h2>
      <PromotionFields packages={packages} />
      <form onSubmit={(event) => void submit(event)}>
        <PromotionInputs packages={packages} />
        <button className="primary" type="submit" disabled={mutation.kind === "loading"}>Criar promoção</button>
      </form>
    </section>
    <section className="package-list" aria-labelledby="promotion-list-title">
      <h2 id="promotion-list-title">Promoções cadastradas</h2>
      {initialPromotions.length === 0 ? <p className="muted">Nenhuma promoção cadastrada.</p> : initialPromotions.map((promotion) => <form className="step" key={promotion.promotionId} onSubmit={(event) => void submit(event, promotion)}>
        <fieldset aria-label={`Editar promoção ${promotion.name}`}>
          <legend>{promotion.name}</legend>
          <p className="muted">Revisão {promotion.revision} · {promotion.state === "ACTIVE" ? "Ativa" : "Inativa"}</p>
          <input name="expectedRevision" type="hidden" value={promotion.revision} readOnly />
          <PromotionInputs packages={packages} promotion={promotion} />
          <button className="primary" type="submit" disabled={mutation.kind === "loading"}>Salvar promoção</button>
        </fieldset>
      </form>)}</section>
    <p className={mutation.kind === "error" ? "error" : mutation.kind === "success" ? "success" : "muted"} role="status" aria-live="polite">{mutation.message}</p>
  </div>;
}

// Kept as a separate component so the first form and each revision share the exact same contract.
function PromotionFields({ packages }: { packages: readonly ManagedPackage[] }) {
  return <p className="muted">Descontos são aplicados no horário selecionado; reservas já confirmadas mantêm seu preço original. Serviços ativos disponíveis: {packages.filter((item) => item.state === "ACTIVE").length}.</p>;
}

function PromotionInputs({ packages, promotion }: { packages: readonly ManagedPackage[]; promotion?: ManagedPromotion }) {
  const recurring = promotion?.weekdays !== null && promotion?.weekdays !== undefined;
  const fixedValue = promotion?.discountKind === "FIXED" ? (Number(promotion.discountValue) / 100).toFixed(2) : undefined;
  return <>
    <label htmlFor={`promotion-name-${promotion?.promotionId ?? "new"}`}>Nome da promoção</label>
    <input id={`promotion-name-${promotion?.promotionId ?? "new"}`} name="name" defaultValue={promotion?.name} maxLength={100} required />
    <label htmlFor={`promotion-kind-${promotion?.promotionId ?? "new"}`}>Tipo de desconto</label>
    <select id={`promotion-kind-${promotion?.promotionId ?? "new"}`} name="discountKind" defaultValue={promotion?.discountKind ?? "PERCENTAGE"}>
      <option value="PERCENTAGE">Percentual (%)</option><option value="FIXED">Valor fixo (R$)</option>
    </select>
    <label htmlFor={`promotion-value-${promotion?.promotionId ?? "new"}`}>Desconto</label>
    <input id={`promotion-value-${promotion?.promotionId ?? "new"}`} name="discountValue" type="number" min="0.01" max="100" step="0.01" defaultValue={fixedValue ?? promotion?.discountValue} required />
    <span className="muted">Percentual: inteiro de 1 a 100. Valor fixo: até duas casas decimais.</span>
    <fieldset><legend>Serviços participantes</legend>
      {packages.length === 0 ? <p className="muted">Cadastre um serviço antes de criar promoções.</p> : packages.map((item) => <label key={item.packageId}>
        <input type="checkbox" name="packageIds" value={item.packageId} defaultChecked={promotion?.packageIds.includes(item.packageId)} disabled={item.state !== "ACTIVE"} />
        {item.name}{item.state !== "ACTIVE" ? " (inativo)" : ""}
      </label>)}
    </fieldset>
    <label htmlFor={`promotion-from-${promotion?.promotionId ?? "new"}`}>Válida a partir de (Fortaleza)</label>
    <input id={`promotion-from-${promotion?.promotionId ?? "new"}`} name="validFrom" type="date" defaultValue={promotion?.validFrom} required />
    <label htmlFor={`promotion-through-${promotion?.promotionId ?? "new"}`}>Válida até, inclusive (Fortaleza)</label>
    <input id={`promotion-through-${promotion?.promotionId ?? "new"}`} name="validThrough" type="date" defaultValue={promotion?.validThrough} required />
    <fieldset><legend>Recorrência semanal (opcional)</legend>
      <label><input type="checkbox" name="recurring" defaultChecked={recurring} /> Repetir em dias e horários selecionados</label>
      <div className="weekday-options">{weekdays.map((day, index) => <label key={day}>
        <input type="checkbox" name="weekdays" value={index} defaultChecked={promotion?.weekdays?.includes(index)} />{day}
      </label>)}</div>
      <label htmlFor={`promotion-starts-${promotion?.promotionId ?? "new"}`}>Começa às</label>
      <input id={`promotion-starts-${promotion?.promotionId ?? "new"}`} name="startsAt" type="time" defaultValue={promotion?.startsAt ?? "09:00"} />
      <label htmlFor={`promotion-ends-${promotion?.promotionId ?? "new"}`}>Termina às (limite não incluído)</label>
      <input id={`promotion-ends-${promotion?.promotionId ?? "new"}`} name="endsAt" type="time" defaultValue={promotion?.endsAt ?? "18:00"} />
    </fieldset>
    <label htmlFor={`promotion-state-${promotion?.promotionId ?? "new"}`}>Estado</label>
    <select id={`promotion-state-${promotion?.promotionId ?? "new"}`} name="state" defaultValue={promotion?.state ?? "ACTIVE"}>
      <option value="ACTIVE">Ativa</option><option value="INACTIVE">Inativa</option>
    </select>
  </>;
}

function toCentavos(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return Number.NaN;
  const [whole = "0", fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : Number.NaN;
}

function readCsrfCookie(): string | undefined {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
