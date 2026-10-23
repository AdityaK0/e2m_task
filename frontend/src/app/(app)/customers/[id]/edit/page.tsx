"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AccessDenied } from "@/components/access-denied";
import { CustomerForm } from "@/components/customers/customer-form";
import { Alert } from "@/components/ui/alert";
import { LoadingPanel } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/features/auth/hooks";
import { customersApi } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import type { CustomerDetail } from "@/lib/api/types";

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const { canDo } = usePermissions();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    customersApi
      .get(Number(params.id))
      .then((result) => {
        if (!cancelled) setCustomer(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!canDo("customers:write")) {
    return <AccessDenied title="Customer editing is restricted" />;
  }

  if (loading) return <LoadingPanel label="Loading customer" />;

  if (error || !customer) {
    return (
      <Alert variant="error" title="Could not load customer">
        {error ?? "Customer not found."}
      </Alert>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Client portfolio"
        backHref={`/customers/${customer.id}`}
        backLabel={customer.name}
        title={`Edit ${customer.name}`}
        description="Update account details, health, and ownership."
      />
      <div className="max-w-4xl">
        <CustomerForm customer={customer} mode="edit" />
      </div>
    </div>
  );
}
