import type { Metadata } from "next";
import { Bricolage_Grotesque, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import ThemeScript from "./theme-script";

const display = Bricolage_Grotesque({
  variable: "--font-sb-display",
  subsets: ["latin"],
});

const body = M_PLUS_Rounded_1c({
  variable: "--font-sb-body",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Starbeam",
  description: "Daily pulse for startup teams and founders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <ThemeScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
