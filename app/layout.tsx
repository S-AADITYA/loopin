import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loopin",
  description: "Social discovery, restaurant ops, and intelligence — one loop."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
