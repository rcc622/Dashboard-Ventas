import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Ventas · Control de asesores",
  description: "Control visual de asesores de ventas con datos del CRM.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-page text-text antialiased">{children}</body>
    </html>
  );
}
