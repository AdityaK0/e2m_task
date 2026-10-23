import type { Metadata } from "next";

export const metadata: Metadata = { title: "Meeting" };

export default function MeetingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
