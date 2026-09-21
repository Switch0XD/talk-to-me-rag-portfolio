import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kuldeep Singh — Full Stack Developer",
  description: "Kuldeep Singh’s portfolio and grounded RAG assistant.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
