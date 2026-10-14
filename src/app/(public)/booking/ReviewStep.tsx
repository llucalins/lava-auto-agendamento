"use client";

import { useState } from "react";
import type { PersonalDetails } from "./PersonalStep";
import type { VehicleDetails } from "./VehicleStep";
import type { ServiceModeDetails } from "./ServiceModeStep";
import type { PaymentIntent } from "./PaymentStep";

type PriceTerms = Readonly<{
  basePriceCentavos: string;
  discountCentavos: string;
  finalPriceCentavos: string;
  promotion: Readonly<{ id: string; revision: number; name: string }> | null;
}>;
type Review = Readonly<{
  package: Readonly<{ id: string; name: string; priceCentavos: string; durationMinutes: number }>;
  price: PriceTerms;
  start: string;
  end: string;
  reviewToken: string;
}>;
type ReviewProps = Readonly<{
  review: Review;
  personal: PersonalDetails;
  vehicle: VehicleDetails;
  mode: ServiceModeDetails;
  payment: PaymentIntent;
}>;

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  return digits.length < 4 ? "••••" : `•••.${digits.slice(-3, -1)}-${digits.slice(-1)}`;
}

function money(centavos: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(centavos) / 100);
}

export default function ReviewStep({ review, personal, vehicle, mode, payment }: ReviewProps) {
  const [intentKey] = useState(() => `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 64));
  const [state, setState] = useState<"idle" | "submitting" | "confirmed" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [trackingCredential, setTrackingCredential] = useState<string | null>(null);

  async function confirm() {
    if (state === "submitting" || state === "confirmed") return;
    setState("submitting");
    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentKey,
          material: {
            packageId: review.package.id, serviceStart: review.start, serviceMode: mode.serviceMode,
            intendedPaymentMethod: payment, fullName: personal.fullName, phoneWhatsapp: personal.phoneWhatsapp,
            email: personal.email, cpf: personal.cpf, vehicleModel: vehicle.vehicleModel,
            licencePlate: vehicle.licencePlate, vehicleColor: vehicle.vehicleColor,
            pickupAddress: mode.pickupAddress, reviewToken: review.reviewToken,
          },
        }),
      });
      const result = await response.json() as { kind?: string; code?: string; trackingCredential?: string };
      if (result.kind === "CONFIRMED") {
        setTrackingCredential(result.trackingCredential ?? null);
        setState("confirmed");
        setMessage("Agendamento confirmado.");
        return;
      }
      if (result.kind === "REJECTED") {
        setState("error");
        setMessage(result.code === "STALE_PROMOTION"
          ? "A promoção mudou desde a revisão. Confira o preço atualizado antes de confirmar."
          : "Este horário não está mais disponível. Escolha outro horário.");
        return;
      }
      if (result.kind === "IDEMPOTENCY_CONFLICT") {
        setState("error");
        setMessage("Esta tentativa não pode ser reutilizada. Revise os dados e tente novamente.");
        return;
      }
      throw new Error();
    } catch {
      setState("error");
      setMessage("Não foi possível confirmar agora. Tente novamente.");
    }
  }

  return <div className="review-step">
    <h2>Revise seu agendamento</h2>
    <p className="muted">Serviço, promoção, preço, duração e horário foram conferidos no servidor.</p>
    <dl>
      <dt>Serviço</dt><dd>{review.package.name}</dd>
      <dt>Preço normal</dt><dd>{money(review.price.basePriceCentavos)}</dd>
      {review.price.promotion && <><dt>Promoção</dt><dd>{review.price.promotion.name} · {money(review.price.discountCentavos)} de desconto</dd></>}
      <dt>Preço final</dt><dd><strong>{money(review.price.finalPriceCentavos)}</strong></dd>
      <dt>Duração</dt><dd>{review.package.durationMinutes} min</dd>
      <dt>Início</dt><dd>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "medium", timeStyle: "short" }).format(new Date(review.start))}</dd>
      <dt>Nome</dt><dd>{personal.fullName}</dd>
      <dt>Telefone/WhatsApp</dt><dd>{personal.phoneWhatsapp}</dd>
      <dt>CPF</dt><dd>{maskCpf(personal.cpf)}</dd>
      <dt>Veículo</dt><dd>{vehicle.vehicleModel} · {vehicle.vehicleColor} · {vehicle.licencePlate}</dd>
      <dt>Atendimento</dt><dd>{mode.serviceMode === "PICKUP_REQUESTED" ? `Retirada: ${mode.pickupAddress}` : "Entrega na unidade"}</dd>
      <dt>Pagamento</dt><dd>{payment}</dd>
    </dl>
    {message && <p className={state === "confirmed" ? "success" : "error"} role={state === "confirmed" ? "status" : "alert"}>{message}</p>}
    {trackingCredential && <section aria-labelledby="tracking-credential-heading">
      <h3 id="tracking-credential-heading">Código de acompanhamento</h3>
      <p>Copie e guarde agora. Este código não será exibido novamente.</p>
      <output aria-label="Código de acompanhamento">{trackingCredential}</output>
    </section>}
    <button className="primary" type="button" onClick={() => void confirm()} disabled={state === "submitting" || state === "confirmed"}>
      {state === "confirmed" ? "Confirmado" : state === "submitting" ? "Confirmando…" : "Confirmar agendamento"}
    </button>
  </div>;
}
