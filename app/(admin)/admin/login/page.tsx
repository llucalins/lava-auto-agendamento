export default function AdminLoginPage() {
  return <main className="login-screen"><section className="login-card"><span className="brand-mark" aria-hidden="true">L</span><p className="eyebrow">Lava Auto · área restrita</p>
    <h1>Acesso administrativo</h1><p className="intro">Entre com a conta Google autorizada para administrar este estabelecimento.</p>
    <form action="/api/admin/auth/login" method="post"><button className="google-button" type="submit"><span className="google-g" aria-hidden="true">G</span> Continuar com Google <span aria-hidden="true">→</span></button></form>
    <p className="login-note">A entrada exige autenticação forte configurada. Se o acesso falhar, contate o responsável pelo sistema.</p>
  </section></main>;
}
