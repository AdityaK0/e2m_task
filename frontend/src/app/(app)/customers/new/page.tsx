"use client";

import { AccessDenied } from "@/components/access-denied";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/features/auth/hooks";

export default function NewCustomerPage() {
  const { canDo } = usePermissions();

  if (!canDo("customers:write")) {
    return <AccessDenied title="Customer creation is restricted" />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Client portfolio"
        backHref="/customers"
        backLabel="All customers"
        title="New customer"
        description="Create an account record, add context, and assign ownership."
      />
      <div className="max-w-4xl">
        <CustomerForm mode="create" />
      </div>
    </div>
  );
}
