import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Chief of Staff",
  description: "Human-in-the-loop executive communications analysis demo"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
