"use client";

import { FormEvent, useState } from "react";

export type VehicleDetails = Readonly<{
  vehicleModel: string;
  licencePlate: string;
  vehicleColor: string;
}>;

export default function VehicleStep({ onValid }: Readonly<{ onValid: (details: VehicleDetails) => void }>) {
  const [vehicleModel, setVehicleModel] = useState("");
  const [licencePlate, setLicencePlate] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const model = vehicleModel.trim();
    const plate = licencePlate.trim();
    const color = vehicleColor.trim();
    if (!model || !plate || !color) {
      setError("Preencha modelo, placa e cor do veículo para continuar.");
      return;
    }
    setError(null);
    onValid({ vehicleModel: model, licencePlate: plate, vehicleColor: color });
  }

  return <div className="vehicle-step">
    <h2>Seu veículo</h2>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={submit} noValidate>
      <label htmlFor="vehicle-model">Modelo <span aria-hidden="true">*</span></label>
      <input id="vehicle-model" name="vehicleModel" maxLength={100} value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} autoComplete="off" required />
      <label htmlFor="licence-plate">Placa <span aria-hidden="true">*</span></label>
      <input id="licence-plate" name="licencePlate" maxLength={32} value={licencePlate} onChange={(event) => setLicencePlate(event.target.value)} autoComplete="off" required />
      <label htmlFor="vehicle-color">Cor <span aria-hidden="true">*</span></label>
      <input id="vehicle-color" name="vehicleColor" maxLength={64} value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} autoComplete="off" required />
      <button className="primary" type="submit">Continuar</button>
    </form>
  </div>;
}
