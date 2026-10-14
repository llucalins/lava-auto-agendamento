import Link from "next/link";
import { PublicEstablishmentDetails } from "./PublicEstablishmentDetails";

export function SiteHeader() {
  return <header className="site-header">
    <Link className="brand" href="/" aria-label="Lava Auto, página inicial"><span className="brand-mark" aria-hidden="true">L</span><span>Lava<span className="brand-accent">Auto</span></span></Link>
    <nav aria-label="Navegação principal" className="site-nav">
      <Link href="/#servicos">Serviços</Link><Link href="/#como-funciona">Como funciona</Link><Link href="/tracking">Acompanhar</Link><Link className="button button-small" href="/booking">Agendar <span aria-hidden="true">↗</span></Link>
    </nav>
    <Link className="button button-small mobile-booking-cta" href="/booking">Agendar <span aria-hidden="true">↗</span></Link>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">L</span><span>Lava<span className="brand-accent">Auto</span></span></Link><p>Cuidado automotivo com hora marcada.</p><PublicEstablishmentDetails /><Link href="/admin/login">Acesso administrativo</Link><small>© {new Date().getFullYear()} Lava Auto</small></footer>;
}
