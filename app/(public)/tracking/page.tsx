import TrackingProofForm from "./TrackingProofForm";

export default function TrackingPage() {
  return <main><section className="booking-shell" aria-labelledby="tracking-heading"><p className="eyebrow">Acompanhamento</p><h1 id="tracking-heading">Consulte o status do serviço</h1><p>Digite o código recebido após a confirmação. Ele não será colocado no endereço da página.</p><TrackingProofForm /></section></main>;
}
