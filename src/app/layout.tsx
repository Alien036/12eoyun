import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "12-E Sınıf Oyun Merkezi | 5 Oyun & Canlı Rekabet",
  description:
    "Block Blast, Satranç, 2D Bilardo, Solitaire ve Sudoku içeren gerçek zamanlı sınıf rekabet platformu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#070917",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
