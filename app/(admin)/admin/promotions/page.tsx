import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { listAdminPackages } from "../../../../src/server/capabilities/admin-operations/package-management";
import { listAdminPromotions } from "../../../../src/server/capabilities/promotions/management";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { PromotionAdmin } from "./promotion-admin";

export default async function AdminPromotionsPage() {
  const session = (await cookies()).get("__Host-admin_session")?.value;
  if (!session) notFound();
  const pool = getDatabasePool();
  const data = await Promise.all([
    listAdminPromotions(pool, session),
    listAdminPackages(pool, session),
  ]).catch(() => notFound());
  const [promotions, packages] = data;
  return <main className="admin-page"><div className="admin-shell">
    <p className="eyebrow">Administração</p>
    <h1>Promoções</h1>
    <p className="intro">Configure descontos por serviço. O preço final é calculado no servidor para cada horário.</p>
    <PromotionAdmin initialPromotions={promotions} packages={packages} />
  </div></main>;
}
