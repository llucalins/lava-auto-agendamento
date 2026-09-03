import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { listAdminPackages } from "../../../../src/server/capabilities/admin-operations/package-management";
import type { ManagedPackage } from "../../../../src/server/capabilities/admin-operations/package-management";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { PackageAdmin } from "./package-admin";

export default async function AdminPackagesPage({
  searchParams,
}: { searchParams: Promise<{ page?: string | string[] }> }) {
  const query = await searchParams;
  const requestedPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100 ? requestedPage : 1;
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let packages: readonly ManagedPackage[];
  try {
    packages = await listAdminPackages(getDatabasePool(), sessionCookie, page);
  } catch {
    notFound();
  }

  return <main><div className="admin-shell">
    <p className="eyebrow">Administração</p>
    <h1>Pacotes</h1>
    <p className="intro">Crie versões prospectivas sem alterar os termos já confirmados.</p>
    <PackageAdmin initialPackages={packages} />
    <nav aria-label="Paginação de pacotes" className="pagination">
      {page > 1 ? <a href={`/admin/packages?page=${page - 1}`}>Página anterior</a> : <span />}
      <span>Página {page}</span>
      {packages.length === 50 && page < 100 ? <a href={`/admin/packages?page=${page + 1}`}>Próxima página</a> : <span />}
    </nav>
  </div></main>;
}
