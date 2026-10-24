"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingPanel } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api/errors";
import { preferencesApi } from "@/lib/api/preferences";
import type { Preference } from "@/lib/api/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user, initialized } = useAuth();
  const isAdmin = user?.role === "admin";
  const [preference, setPreference] = useState<Preference | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialized && user && !isAdmin) router.replace("/dashboard");
  }, [initialized, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    preferencesApi
      .list()
      .then((preferences) => {
        if (cancelled) return;
        const setting = preferences.find(
          (item) => item.key === "health_score_window",
        );
        if (!setting) {
          setError("Health score window preference is not registered.");
          return;
        }
        setPreference(setting);
        setValue(String(setting.value));
      })
      .catch((requestError) => {
        if (!cancelled) setError(getApiError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!initialized || !user || !isAdmin) {
    return <LoadingPanel label="Checking settings access" />;
  }

  const parsedValue = Number(value);
  const validValue =
    preference !== null &&
    Number.isInteger(parsedValue) &&
    (preference.min === null || parsedValue >= preference.min) &&
    (preference.max === null || parsedValue <= preference.max);

  const save = async () => {
    if (!preference || !validValue) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await preferencesApi.update(preference.key, parsedValue);
      setPreference(updated);
      setValue(String(updated.value));
      setSuccess("Health score window saved. Customer scores have been recalculated.");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Control workspace-wide preferences."
      />
      <Card>
        <CardHeader
          title="Customer health score"
          description="This global setting is controlled by administrators."
        />
        <CardContent className="max-w-xl space-y-4">
          {error ? <Alert variant="error" title="Could not update settings">{error}</Alert> : null}
          {success ? <Alert variant="success" title="Settings saved">{success}</Alert> : null}
          {loading ? (
            <p className="text-sm text-ink-500">Loading preferences…</p>
          ) : preference ? (
            <>
              <Field
                label="Health score window"
                htmlFor="health-score-window"
                hint={preference.description}
              >
                <Input
                  id="health-score-window"
                  type="number"
                  min={preference.min ?? undefined}
                  max={preference.max ?? undefined}
                  step={1}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-label="Health score window"
                />
              </Field>
              <p className="text-xs text-ink-500">
                Saving recalculates all non-deleted customers&apos; scores.
              </p>
              <Button
                onClick={save}
                disabled={!validValue || saving}
                isLoading={saving}
              >
                Save
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
