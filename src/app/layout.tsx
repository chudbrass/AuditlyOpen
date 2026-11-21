import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import ActiveScansBanner from "@/components/ActiveScansBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auditly",
  description: "Executive website health dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-audit-surface text-slate-950 antialiased">
        <Sidebar />
        <main className="min-h-screen min-w-0 overflow-y-auto lg:ml-52">
          <ActiveScansBanner />
          {children}
        </main>
      </body>
    </html>
  );
}
