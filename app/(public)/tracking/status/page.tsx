import TrackingStatusView from "./TrackingStatusView";
import { PublicLayout } from "../../../components/PublicLayout";

export default function TrackingStatusPage() {
  return <PublicLayout><main className="page-main"><section className="booking-shell page-card" aria-labelledby="tracking-status-heading"><p className="eyebrow">Acompanhamento seguro</p><h1 id="tracking-status-heading">Status do serviço</h1><TrackingStatusView /><p><a className="text-link" href="/tracking">Voltar ao acompanhamento</a></p></section></main></PublicLayout>;
}
