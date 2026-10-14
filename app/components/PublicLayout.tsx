import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteHeader";

export function PublicLayout({ children }: { children: ReactNode }) {
  return <><SiteHeader />{children}<SiteFooter /></>;
}
