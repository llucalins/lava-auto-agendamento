import TrackingStatusView from "./TrackingStatusView";

export default function TrackingStatusPage() {
  return <main><section className="booking-shell" aria-labelledby="tracking-status-heading"><p className="eyebrow">Acompanhamento</p><h1 id="tracking-status-heading">Status do serviço</h1><TrackingStatusView /></section></main>;
}
