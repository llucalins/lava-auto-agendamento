"use client";

import { FormEvent, useState } from "react";

export type ServiceModeDetails = Readonly<{
  serviceMode: "DROP_OFF" | "PICKUP_REQUESTED";
  pickupAddress?: string;
}>;

export default function ServiceModeStep({ onValid }: Readonly<{ onValid: (details: ServiceModeDetails) => void }>) {
  const [serviceMode, setServiceMode] = useState<ServiceModeDetails["serviceMode"]>("DROP_OFF");
  const [pickupAddress, setPickupAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function changeMode(mode: ServiceModeDetails["serviceMode"]) {
    setServiceMode(mode);
    setError(null);
    if (mode === "DROP_OFF") setPickupAddress("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = pickupAddress.trim();
    if (serviceMode === "PICKUP_REQUESTED" && !address) {
      setError("Informe o endereço para solicitar a retirada.");
      return;
    }
    setError(null);
    onValid(serviceMode === "PICKUP_REQUESTED" ? { serviceMode, pickupAddress: address } : { serviceMode });
  }

  return <div className="mode-step">
    <h2>Como você vai deixar o veículo?</h2>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={submit} noValidate>
      <label className="choice"><input type="radio" name="serviceMode" value="DROP_OFF" checked={serviceMode === "DROP_OFF"} onChange={() => changeMode("DROP_OFF")} /> Deixarei o veículo na unidade</label>
      <label className="choice"><input type="radio" name="serviceMode" value="PICKUP_REQUESTED" checked={serviceMode === "PICKUP_REQUESTED"} onChange={() => changeMode("PICKUP_REQUESTED")} /> Solicitar retirada no endereço</label>
      {serviceMode === "PICKUP_REQUESTED" && <><label htmlFor="pickup-address">Endereço para retirada <span aria-hidden="true">*</span></label><textarea id="pickup-address" name="pickupAddress" maxLength={500} value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} required /></>}
      <button className="primary" type="submit">Continuar</button>
    </form>
  </div>;
}
