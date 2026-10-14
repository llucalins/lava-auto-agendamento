import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/app/styles.css";

export const metadata: Metadata = {
  title: "Lava Auto | Cuidado automotivo",
  description: "Consulte serviços e horários de cuidado automotivo em Fortaleza."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
