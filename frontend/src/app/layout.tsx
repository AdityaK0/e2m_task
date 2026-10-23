import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "E2M Client Insights",
  title: {
    default: "E2M Client Insights",
    template: "%s · E2M Insights",
  },
  description:
    "E2M Client Insights — Customer Success & AI Insights. Manage customer accounts, meetings, risks, and follow-up actions in one focused workspace.",
  keywords: [
    "customer success",
    "client insights",
    "meeting intelligence",
    "account management",
    "E2M",
  ],
  appleWebApp: {
    title: "E2M Insights",
    capable: true,
    statusBarStyle: "default",
  },
  openGraph: {
    title: "E2M Client Insights",
    description: "Customer Success & AI Insights",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f8f8f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
