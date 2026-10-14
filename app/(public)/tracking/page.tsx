import TrackingProofForm from "./TrackingProofForm";
import { PublicLayout } from "../../components/PublicLayout";

export default function TrackingPage() {
  return <PublicLayout><main className="page-main"><section className="booking-shell page-card" aria-labelledby="tracking-heading"><p className="eyebrow">Acompanhamento seguro</p><h1 id="tracking-heading">Seu serviço, acompanhado.</h1><p className="intro">Digite o código recebido após a confirmação. Ele será enviado com segurança e nunca aparecerá no endereço da página.</p><TrackingProofForm /></section></main></PublicLayout>;
}
