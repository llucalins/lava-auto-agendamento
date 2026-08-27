"use client";

import { FormEvent, useState } from "react";

export type PaymentIntent = "PIX" | "CASH" | "CREDIT_CARD" | "DEBIT_CARD";

const methods: ReadonlyArray<Readonly<{ value: PaymentIntent; label: string }>> = [
  { value: "PIX", label: "PIX" },
  { value: "CASH", label: "Dinheiro" },
  { value: "CREDIT_CARD", label: "Cartão de crédito (na unidade)" },
  { value: "DEBIT_CARD", label: "Cartão de débito (na unidade)" },
];

export default function PaymentStep({ onValid }: Readonly<{ onValid: (method: PaymentIntent) => void }>) {
  const [method, setMethod] = useState<PaymentIntent | "">("");
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method) { setError("Escolha uma forma de pagamento para continuar."); return; }
    setError(null);
    onValid(method);
  }
  return <div className="payment-step"><h2>Como pretende pagar?</h2><p className="muted">Esta é apenas uma preferência. Nenhum pagamento será processado agora.</p>{error && <p className="error" role="alert">{error}</p>}<form onSubmit={submit} noValidate><div className="payment-options">{methods.map((item) => <label className="choice" key={item.value}><input type="radio" name="paymentMethod" value={item.value} checked={method === item.value} onChange={() => setMethod(item.value)} />{item.label}</label>)}</div><button className="primary" type="submit">Continuar</button></form></div>;
}
