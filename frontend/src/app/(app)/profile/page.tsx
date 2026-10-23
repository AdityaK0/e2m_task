"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Mail, Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/status-badges";
import { authApi } from "@/lib/api/auth";
import { getApiError } from "@/lib/api/errors";
import { useAuth } from "@/features/auth/hooks";
import { logout, setUser } from "@/features/auth/authSlice";
import { formatDateTime } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "At least 8 characters"),
    confirm_password: z.string().min(8, "Confirm your new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "" },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  useEffect(() => {
    if (user?.name) {
      profileForm.reset({ name: user.name });
    }
  }, [user?.name, profileForm]);

  const onProfileSubmit = async (values: ProfileForm) => {
    setUpdatingProfile(true);
    try {
      const updated = await authApi.updateProfile(values.name);
      dispatch(setUser(updated));
      toast.success("Profile updated");
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setUpdatingProfile(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordForm) => {
    setUpdatingPassword(true);
    try {
      await authApi.changePassword(
        values.current_password,
        values.new_password,
      );
      toast.success("Password updated. Please sign in again.");
      passwordForm.reset();
      await dispatch(logout());
      router.replace("/login?next=/profile");
      router.refresh();
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Profile & security"
        description="Manage your personal details and keep your account secure."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Profile details"
            description="Your name and account identity."
            action={<RoleBadge role={user.role} />}
          />
          <CardContent>
            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              className="space-y-4"
              noValidate
            >
              <Field
                label="Full name"
                htmlFor="name"
                error={profileForm.formState.errors.name?.message}
                required
              >
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    id="name"
                    className="pl-10"
                    {...profileForm.register("name")}
                  />
                </div>
              </Field>

              <Field label="Email address">
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
                  <Input value={user.email} disabled className="pl-10" />
                </div>
                <p className="hint">Email cannot be changed from this screen.</p>
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-4 text-xs text-ink-500">
                <span>Last login</span>
                <span className="font-medium text-ink-700">
                  {formatDateTime(user.last_login_at)}
                </span>
              </div>

              <div className="flex justify-end">
                <Button type="submit" isLoading={updatingProfile} leftIcon={<Save className="size-4" />}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Change password"
            description="Updating your password signs you out of all sessions."
          />
          <CardContent>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-4"
              noValidate
            >
              <Field
                label="Current password"
                htmlFor="current_password"
                error={passwordForm.formState.errors.current_password?.message}
                required
              >
                <Input
                  id="current_password"
                  type="password"
                  autoComplete="current-password"
                  {...passwordForm.register("current_password")}
                />
              </Field>

              <Field
                label="New password"
                htmlFor="new_password"
                error={passwordForm.formState.errors.new_password?.message}
                hint="At least 8 characters, up to 72 bytes"
                required
              >
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("new_password")}
                />
              </Field>

              <Field
                label="Confirm new password"
                htmlFor="confirm_password"
                error={passwordForm.formState.errors.confirm_password?.message}
                required
              >
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("confirm_password")}
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" isLoading={updatingPassword} leftIcon={<KeyRound className="size-4" />}>
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
