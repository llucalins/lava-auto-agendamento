"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/admin/login") return <>{children}</>;

  async function logout() {
    const csrf = document.cookie.split("; ").find((value) => value.startsWith("__Host-admin_csrf="))?.slice("__Host-admin_csrf=".length);
    if (!csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) return;
    const response = await fetch("/api/admin/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } });
    if (response.ok) router.replace("/admin/login");
  }

  return <div className="admin-frame"><aside className="admin-sidebar"><Link className="brand" href="/admin/bookings"><span className="brand-mark">L</span><span>Lava<span className="brand-accent">Auto</span></span></Link><p className="sidebar-label">Operação</p><nav aria-label="Navegação administrativa" className="admin-nav"><Link href="/admin/bookings">Agendamentos</Link><Link href="/admin/packages">Serviços e pacotes</Link><Link href="/admin/calendar">Calendário</Link><Link href="/admin/establishment">Estabelecimento</Link></nav><div className="sidebar-bottom"><Link href="/">Ver site público</Link><button type="button" className="logout-button" onClick={() => void logout()}>Sair do painel</button></div></aside><div className="admin-content"><header className="admin-topbar"><span>Painel do estabelecimento</span><span className="secure-label"><i /> Sessão protegida</span></header>{children}</div></div>;
}
