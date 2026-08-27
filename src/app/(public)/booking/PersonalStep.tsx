"use client";

import { FormEvent, useState } from "react";

export type PersonalDetails = Readonly<{
  fullName: string;
  phoneWhatsapp: string;
  cpf: string;
  email?: string;
}>;

type PersonalStepProps = Readonly<{
  onValid: (details: PersonalDetails) => void;
}>;

export default function PersonalStep({ onValid }: PersonalStepProps) {
  const [fullName, setFullName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (fullName.trim().length < 1 || phoneWhatsapp.trim().length < 1 || cpf.trim().length < 1) {
      setError("Preencha nome, telefone/WhatsApp e CPF para continuar.");
      return;
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Confira o formato do e-mail informado.");
      return;
    }
    setError(null);
    onValid({ fullName: fullName.trim(), phoneWhatsapp: phoneWhatsapp.trim(), cpf: cpf.trim(), ...(normalizedEmail ? { email: normalizedEmail } : {}) });
  }

  return <div className="personal-step">
    <h2>Seus dados</h2>
    <p className="muted">Usaremos estas informações apenas para este agendamento.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={submit} noValidate>
      <label htmlFor="full-name">Nome completo <span aria-hidden="true">*</span></label>
      <input id="full-name" name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
      <label htmlFor="phone-whatsapp">Telefone/WhatsApp <span aria-hidden="true">*</span></label>
      <input id="phone-whatsapp" name="phoneWhatsapp" value={phoneWhatsapp} onChange={(event) => setPhoneWhatsapp(event.target.value)} inputMode="tel" autoComplete="tel" required />
      <label htmlFor="cpf">CPF <span aria-hidden="true">*</span></label>
      <input id="cpf" name="cpf" value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" autoComplete="off" required />
      <label htmlFor="email">E-mail <span className="muted">(opcional)</span></label>
      <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      <button className="primary" type="submit">Continuar</button>
    </form>
  </div>;
}
