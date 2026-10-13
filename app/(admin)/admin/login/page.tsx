export default function AdminLoginPage() {
  return <main>
    <h1>Entrar no painel</h1>
    <p>Use a identidade administrativa configurada para este estabelecimento.</p>
    <form action="/api/admin/auth/login" method="post">
      <button type="submit">Entrar com autenticação segura</button>
    </form>
  </main>;
}
