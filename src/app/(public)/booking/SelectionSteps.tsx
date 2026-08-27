"use client";

import { useEffect, useMemo, useState } from "react";
import PersonalStep, { type PersonalDetails } from "./PersonalStep";
import VehicleStep, { type VehicleDetails } from "./VehicleStep";

type Package = Readonly<{
  id: string;
  name: string;
  description: string;
  priceCentavos: string;
  durationMinutes: number;
}>;

type Start = Readonly<{ start: string; end: string }>;

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

export default function SelectionSteps() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [starts, setStarts] = useState<Start[]>([]);
  const [selectedStart, setSelectedStart] = useState<Start | null>(null);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => futureDays(14), []);

  useEffect(() => {
    fetch("/api/public/packages", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Package[]> : Promise.reject(new Error()))
      .then(setPackages)
      .catch(() => setError("Não foi possível carregar os pacotes agora."))
      .finally(() => setLoading(false));
  }, []);

  async function chooseDay(day: string) {
    if (!selectedPackage) return;
    setSelectedDay(day);
    setStarts([]);
    setSelectedStart(null);
    setPersonalDetails(null);
    setVehicleDetails(null);
    setError(null);
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
    }
  }

  function choosePackage(value: Package | null) {
    setSelectedPackage(value);
    setSelectedDay(null);
    setStarts([]);
    setSelectedStart(null);
    setPersonalDetails(null);
    setVehicleDetails(null);
    setError(null);
  }

  return <section className="booking-shell" aria-labelledby="booking-title">
    <p className="eyebrow">Agendamento online</p>
    <h1 id="booking-title">Agende sua lavagem</h1>
    <p className="intro">Escolha um pacote, um dia e um horário compatível.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!selectedPackage && <div className="step"><h2>Escolha o pacote</h2>{loading ? <p>Carregando pacotes…</p> : <div className="cards">{packages.map((item) => <button className="package-card" key={item.id} onClick={() => choosePackage(item)}><span className="package-name">{item.name}</span><span>{item.description}</span><span>{money(item.priceCentavos)} · {item.durationMinutes} min</span></button>)}</div>}</div>}
    {selectedPackage && <div className="step"><button className="back" onClick={() => choosePackage(null)}>Trocar pacote</button><p className="selected">Pacote: <strong>{selectedPackage.name}</strong></p><h2>Escolha o dia</h2><div className="day-list">{days.map((day, index) => <button key={day} className={selectedDay === day ? "day selected-day" : "day"} onClick={() => void chooseDay(day)}>{index === 0 ? "Hoje" : index === 1 ? "Amanhã" : new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`))}</button>)}</div>{selectedDay && <><h2>Escolha o horário</h2>{starts.length ? <div className="start-list">{starts.map((item) => <button className={selectedStart?.start === item.start ? "start selected-day" : "start"} key={item.start} onClick={() => { setSelectedStart(item); setPersonalDetails(null); setVehicleDetails(null); }}>{new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.start))}</button>)}</div> : <p className="muted">Nenhum horário compatível encontrado neste dia.</p>}</>}{selectedStart && <PersonalStep onValid={(details) => { setPersonalDetails(details); setVehicleDetails(null); }} />}{personalDetails && <VehicleStep onValid={setVehicleDetails} />}{vehicleDetails && <p className="success" role="status">Dados do veículo preenchidos. A revisão será exibida na próxima etapa.</p>}</div>}
  </section>;
}
