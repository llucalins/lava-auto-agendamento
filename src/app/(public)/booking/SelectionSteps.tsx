"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PersonalStep, { type PersonalDetails } from "./PersonalStep";
import VehicleStep, { type VehicleDetails } from "./VehicleStep";
import ServiceModeStep, { type ServiceModeDetails } from "./ServiceModeStep";
import PaymentStep, { type PaymentIntent } from "./PaymentStep";
import ReviewStep from "./ReviewStep";

type Package = Readonly<{
  id: string;
  name: string;
  description: string;
  priceCentavos: string;
  durationMinutes: number;
}>;

type Start = Readonly<{ start: string; end: string }>;
type AuthoritativeReview = Readonly<{
  kind: "READY";
  package: Package & Readonly<{ revision: number }>;
  calendarRevision: number;
  start: string;
  end: string;
  reviewToken: string;
}>;

const timezone = "America/Fortaleza";

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function zonedInstant(dateKey: string, hour: number, minute: number): string {
  const guess = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess).reduce<Record<string, string>>((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  const wanted = Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)), hour, minute);
  return new Date(guess.getTime() + wanted - seen).toISOString();
}

function futureDays(count: number): string[] {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() + index * 86_400_000);
    return localDateKey(date);
  });
}

function money(centavos: string): string {
  const value = Number(centavos);
  return Number.isSafeInteger(value) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100) : "Preço indisponível";
}

export default function SelectionSteps({ piiAllowed = true, initialPackageId }: { piiAllowed?: boolean; initialPackageId?: string }) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [starts, setStarts] = useState<Start[]>([]);
  const [selectedStart, setSelectedStart] = useState<Start | null>(null);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [serviceModeDetails, setServiceModeDetails] = useState<ServiceModeDetails | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [authoritativeReview, setAuthoritativeReview] = useState<AuthoritativeReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => futureDays(14), []);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/public/packages", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result: unknown = await response.json();
      if (!Array.isArray(result)) throw new Error();
      const availablePackages = result as Package[];
      setPackages(availablePackages);
      if (initialPackageId) {
        const initialPackage = availablePackages.find((item) => item.id === initialPackageId);
        if (initialPackage) setSelectedPackage(initialPackage);
      }
    } catch {
      setError("Não foi possível carregar os pacotes agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [initialPackageId]);

  useEffect(() => { void Promise.resolve().then(loadPackages); }, [loadPackages]);

  async function chooseDay(day: string) {
    if (!selectedPackage) return;
    setSelectedDay(day);
    setStarts([]);
    setSelectedStart(null);
    setPersonalDetails(null);
    setVehicleDetails(null);
    setServiceModeDetails(null);
    setPaymentIntent(null);
    setError(null);
    setAvailabilityLoading(true);
    const candidates = Array.from({ length: 21 }, (_, index) => zonedInstant(day, 8 + Math.floor(index / 2), (index % 2) * 30));
    const query = new URLSearchParams({ packageId: selectedPackage.id });
    candidates.forEach((start) => query.append("start", start));
    try {
      const response = await fetch(`/api/public/availability?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json() as { availableStarts?: Start[] };
      setStarts(body.availableStarts ?? []);
    } catch {
      setError("Não foi possível consultar os horários. Tente novamente.");
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function choosePackage(value: Package | null) {
    setSelectedPackage(value);
    setSelectedDay(null);
    setStarts([]);
    setSelectedStart(null);
    setPersonalDetails(null);
    setVehicleDetails(null);
    setServiceModeDetails(null);
    setPaymentIntent(null);
    setError(null);
  }

  async function reviewDemo(start: Start) {
    if (!selectedPackage) return;
    setSelectedStart(start);
    setAuthoritativeReview(null);
    setReviewLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/public/bookings/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage.id, serviceStart: start.start }),
      });
      const body = await response.json() as AuthoritativeReview | Readonly<{ kind?: string }>;
      if (!response.ok || body.kind !== "READY") throw new Error();
      setAuthoritativeReview(body as AuthoritativeReview);
    } catch {
      setSelectedStart(null);
      setError("Não foi possível revisar os termos atuais. Escolha outro horário ou tente novamente.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function choosePayment(value: PaymentIntent) {
    if (!selectedPackage || !selectedStart) return;
    setPaymentIntent(value);
    setAuthoritativeReview(null);
    setReviewLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/public/bookings/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage.id, serviceStart: selectedStart.start }),
      });
      const body = await response.json() as AuthoritativeReview | Readonly<{ kind?: string }>;
      if (!response.ok || body.kind !== "READY") {
        setSelectedStart(null);
        setPaymentIntent(null);
        setError("O pacote ou horário mudou. Escolha novamente para revisar os termos atuais.");
        return;
      }
      setAuthoritativeReview(body as AuthoritativeReview);
    } catch {
      setError("Não foi possível preparar a revisão autoritativa. Tente novamente.");
    } finally {
      setReviewLoading(false);
    }
  }

  return <section className="booking-shell" aria-labelledby="booking-title">
    <p className="eyebrow">Agendamento online</p>
    <h1 id="booking-title">Agende sua lavagem</h1>
    <p className="intro">Escolha um serviço e consulte os horários disponíveis para este estabelecimento.</p>
    {!piiAllowed && <p className="notice demo-notice"><strong>Demonstração limitada</strong><span>Agendamentos estão em modo de demonstração. Não solicitaremos dados pessoais e nenhuma reserva será confirmada.</span></p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!selectedPackage && <div className="step"><h2>Escolha o serviço</h2>{loading ? <p role="status">Carregando serviços…</p> : error ? <button className="button button-quiet" onClick={() => void loadPackages()}>Tentar novamente</button> : packages.length === 0 ? <p className="empty-state">Nenhum pacote disponível no momento.</p> : <div className="cards">{packages.map((item) => <button className="package-card" key={item.id} onClick={() => choosePackage(item)}><span className="package-name">{item.name}</span><span>{item.description}</span><span>{money(item.priceCentavos)} · {item.durationMinutes} min</span></button>)}</div>}</div>}
    {selectedPackage && <div className="step"><button className="back" onClick={() => choosePackage(null)}>← Trocar serviço</button><p className="selected">Serviço: <strong>{selectedPackage.name}</strong> · {money(selectedPackage.priceCentavos)} · {selectedPackage.durationMinutes} min</p><h2>Escolha o dia</h2><div className="day-list">{days.map((day, index) => <button key={day} className={selectedDay === day ? "day selected-day" : "day"} onClick={() => void chooseDay(day)}>{index === 0 ? "Hoje" : index === 1 ? "Amanhã" : new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`))}</button>)}</div>{selectedDay && <><h2>Escolha o horário</h2>{availabilityLoading ? <p role="status">Consultando disponibilidade…</p> : starts.length ? <div className="start-list">{starts.map((item) => <button className={selectedStart?.start === item.start ? "start selected-day" : "start"} key={item.start} onClick={() => { setPersonalDetails(null); setVehicleDetails(null); setServiceModeDetails(null); setPaymentIntent(null); setAuthoritativeReview(null); if (!piiAllowed) void reviewDemo(item); else setSelectedStart(item); }}>{new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.start))}</button>)}</div> : <p className="muted">Nenhum horário compatível encontrado neste dia.</p>}</>}{reviewLoading && <p role="status">Conferindo serviço, preço e horário atuais…</p>}{!piiAllowed && authoritativeReview && <section className="step demo-review" aria-label="Revisão demonstrativa"><h2>Revisão demonstrativa</h2><p>As informações abaixo foram conferidas novamente no servidor. Esta demonstração não cria uma reserva.</p><dl><dt>Serviço</dt><dd>{authoritativeReview.package.name}</dd><dt>Preço atual</dt><dd>{money(authoritativeReview.package.priceCentavos)}</dd><dt>Duração</dt><dd>{authoritativeReview.package.durationMinutes} min</dd><dt>Data e hora</dt><dd>{new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(authoritativeReview.start))}</dd></dl></section>}{piiAllowed && selectedStart && <PersonalStep onValid={(details) => { setPersonalDetails(details); setVehicleDetails(null); setServiceModeDetails(null); setPaymentIntent(null); setAuthoritativeReview(null); }} />}{piiAllowed && personalDetails && <VehicleStep onValid={(details) => { setVehicleDetails(details); setServiceModeDetails(null); setPaymentIntent(null); setAuthoritativeReview(null); }} />}{piiAllowed && vehicleDetails && <ServiceModeStep onValid={(details) => { setServiceModeDetails(details); setPaymentIntent(null); setAuthoritativeReview(null); }} />}{piiAllowed && serviceModeDetails && <PaymentStep onValid={(value) => void choosePayment(value)} />}{piiAllowed && paymentIntent && authoritativeReview && personalDetails && vehicleDetails && serviceModeDetails && <ReviewStep review={authoritativeReview} personal={personalDetails} vehicle={vehicleDetails} mode={serviceModeDetails} payment={paymentIntent} />}</div>}
  </section>;
}
