import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAdminEstablishmentProfile } from "../../../../src/server/capabilities/admin-operations/establishment-profile";
import { getDatabasePool } from "../../../../src/server/persistence/pool";
import { EstablishmentProfileForm } from "./establishment-profile-form";

export default async function EstablishmentPage() {
  const sessionCookie = (await cookies()).get("__Host-admin_session")?.value;
  if (!sessionCookie) notFound();

  let profile: Awaited<ReturnType<typeof getAdminEstablishmentProfile>>;
  try {
    profile = await getAdminEstablishmentProfile(getDatabasePool(), sessionCookie);
  } catch {
    notFound();
  }

  return <main className="admin-page"><div className="admin-shell">
    <p className="eyebrow">Configuração do negócio</p>
    <h1>Estabelecimento</h1>
    <p className="intro">Mantenha os dados públicos corretos. As alterações aparecem no site depois de salvas.</p>
    <EstablishmentProfileForm initialProfile={profile} />
  </div></main>;
}
