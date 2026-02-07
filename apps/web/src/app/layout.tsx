import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";
import ThemeScript from "./theme-script";

const display = localFont({
  variable: "--font-sb-display",
  display: "swap",
  src: [
    {
      path: "../fonts/bricolage-grotesque-variable-latin.woff2",
      style: "normal",
      weight: "200 800",
    },
  ],
});

const body = localFont({
  variable: "--font-sb-body",
  display: "swap",
  src: [
    {
      path: "../fonts/manrope-variable-latin.woff2",
      style: "normal",
      weight: "200 800",
    },
  ],
});

export const metadata: Metadata = {
  title: "Starbeam",
  description: "Daily pulse for startup teams and founders.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#060607" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        data-sb-surface="app"
        className={`${display.variable} ${body.variable} antialiased`}
      >
        <ThemeScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
