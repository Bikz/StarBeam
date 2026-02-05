import type { Metadata } from "next";
import { Bricolage_Grotesque, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

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
  description: "Enterprise pulse for stronger shared context.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
