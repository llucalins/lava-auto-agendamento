import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/app/styles.css";

export const metadata: Metadata = {
  title: "Car Wash Scheduling"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
