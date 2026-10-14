import Link from "next/link";
import { PublicLayout } from "./components/PublicLayout";
import { ServiceCatalog } from "./components/ServiceCatalog";

const benefits = [
  ["01", "Horário de verdade", "Consulte a disponibilidade atual antes de escolher."],
  ["02", "Preço transparente", "Veja o valor e a duração de cada serviço com clareza."],
  ["03", "Seu tempo importa", "Uma experiência simples, do primeiro clique ao cuidado do carro."],
];

export default function Page() {
  return <PublicLayout><main className="home-page">
    <section className="hero section-wrap">
      <div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" /> Estética automotiva · Fortaleza</p><h1>Cuidado automotivo <span>sem complicação.</span></h1><p className="hero-description">Seu carro merece atenção. Encontre o serviço ideal e escolha o melhor horário para você.</p><div className="hero-actions"><Link className="button" href="/booking">Escolher horário <span aria-hidden="true">↗</span></Link><a className="text-link" href="#servicos">Conheça os serviços <span aria-hidden="true">↓</span></a></div><div className="hero-proof"><span className="proof-icon" aria-hidden="true">✓</span><span>Agendamento simples, sem surpresas</span></div></div>
      <div className="hero-art" aria-label="Ilustração de um automóvel sob luzes de detalhamento" role="img"><div className="art-glow" /><div className="art-topline">LAVA AUTO <span>DETAIL STUDIO</span></div><svg className="car-illustration" viewBox="0 0 720 360" fill="none" aria-hidden="true"><path d="M119 219 159 156c10-16 28-27 47-29l191-21c27-3 54 7 72 27l65 72 51 15c18 5 30 21 30 39v26H88v-28c0-18 12-34 31-39Z" fill="url(#body)" stroke="#b6f8ff" strokeWidth="3"/><path d="m222 145 173-20c19-2 38 5 50 20l47 54H184l38-54Z" fill="#0b1628" stroke="#35d8f0" strokeWidth="2"/><path d="m308 136-12 62m93-72 33 72" stroke="#35d8f0" strokeWidth="2"/><path d="M99 236h68m331 0h85" stroke="#35d8f0" strokeWidth="5" strokeLinecap="round"/><circle cx="198" cy="281" r="38" fill="#08101d" stroke="#718ba8" strokeWidth="7"/><circle cx="198" cy="281" r="15" fill="#35d8f0"/><circle cx="493" cy="281" r="38" fill="#08101d" stroke="#718ba8" strokeWidth="7"/><circle cx="493" cy="281" r="15" fill="#35d8f0"/><defs><linearGradient id="body" x1="205" y1="127" x2="487" y2="282" gradientUnits="userSpaceOnUse"><stop stopColor="#b8f6ff"/><stop offset=".3" stopColor="#537a9c"/><stop offset=".65" stopColor="#1c3654"/><stop offset="1" stopColor="#101d33"/></linearGradient></defs></svg><div className="art-caption"><span>01 / 03</span><span>O cuidado começa aqui <i /></span></div></div>
    </section>
    <section className="section-wrap section-block" id="servicos"><div className="section-heading"><div><p className="eyebrow">Feito para o seu carro</p><h2>Serviços que fazem a diferença.</h2></div><p>Consulte as opções e valores cadastrados para este estabelecimento.</p></div><ServiceCatalog /></section>
    <section className="how-section" id="como-funciona"><div className="section-wrap section-block"><div className="section-heading"><div><p className="eyebrow">Direto ao ponto</p><h2>Como funciona.</h2></div><p>Sem ligações, sem complicação. Você escolhe quando está pronto.</p></div><div className="how-grid"><article><span>01</span><h3>Escolha o serviço</h3><p>Compare as opções disponíveis e encontre a que combina com você.</p></article><article><span>02</span><h3>Encontre seu horário</h3><p>Veja os horários reais e selecione o melhor para sua rotina.</p></article><article><span>03</span><h3>Pronto para cuidar</h3><p>Revise as informações antes de seguir com seu atendimento.</p></article></div></div></section>
    <section className="section-wrap section-block benefits-block"><div className="section-heading"><div><p className="eyebrow">Nosso jeito de cuidar</p><h2>Mais cuidado. Menos espera.</h2></div></div><div className="benefits-grid">{benefits.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="closing-cta section-wrap"><div><p className="eyebrow">Seu próximo cuidado</p><h2>Vamos deixar seu carro brilhando?</h2></div><Link className="button" href="/booking">Ver disponibilidade <span aria-hidden="true">↗</span></Link></section>
  </main></PublicLayout>;
}
