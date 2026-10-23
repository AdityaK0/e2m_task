import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit customer" };

export default function EditCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
