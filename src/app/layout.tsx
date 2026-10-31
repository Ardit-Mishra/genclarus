import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://genclarus.com"),
  title: "Genclarus — Grounded Gene & Variant Explainer",
  description:
    "Look up a human gene or a genetic variant (rsID) and get a clear, cited, plain-language explanation grounded in real biology. Educational, not medical advice.",
  openGraph: {
    type: "website",
    url: "https://genclarus.com",
    title: "Genclarus — Grounded Gene & Variant Explainer",
    description: "Look up a gene or variant and get a plain-English explanation where every sentence cites its source.",
    images: [{ url: "/og.png", width: 1200, height: 627, alt: "Genclarus gene and variant explainer" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
