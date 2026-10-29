import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { ServiceDisabled } from "@/components/service-disabled";

import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  applicationName: "E2M Insights",
  title: {
    default: "E2M Insights",
    template: "%s · E2M Insights",
  },
  description:
    "E2M Insights — Customer Success & AI Insights. Manage customer accounts, meetings, risks, and follow-up actions in one focused workspace.",
  keywords: [
    "customer success",
    "customer insights",
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
    title: "E2M Insights",
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
  const apiDisabled =
    (process.env.API_DISABLED ?? "").trim().toLowerCase() === "true";

  if (apiDisabled) {
    return (
      <html lang="en">
        <body className="font-sans">
          <ServiceDisabled />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
