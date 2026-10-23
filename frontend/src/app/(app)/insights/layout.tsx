import type { Metadata } from "next";

export const metadata: Metadata = { title: "AI Insights" };

export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
