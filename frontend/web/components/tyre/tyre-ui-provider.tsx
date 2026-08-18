"use client";

/**
 * TYRE UI Provider — renders landing, auth gate, or app shell.
 * "Get started" flips the store to app mode; if no profile exists yet the
 * animated sign-in/sign-up gate shows first. Once a profile is saved the
 * dashboard opens and the chrome greets the real user.
 *
 * Also mounts the global <Toaster/> host. Without it, every toast.success /
 * toast.error call across the app (booking, listings, settings, ...) silently
 * did nothing.
 */
import { useTyreUI } from "@/lib/tyre/store";
import { useProfile } from "@/lib/tyre/profile";
import { LandingPage } from "@/components/tyre/landing/landing-page";
import { AppShell } from "@/components/tyre/app/app-shell";
import { AuthGate } from "@/components/tyre/auth/auth-gate";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/lib/tyre/auth";

export function TyreUIProvider() {
  const { mode } = useTyreUI();
  const { profile, hydrated } = useProfile();
  useAuth(); // keeps session-expiry -> auth-gate redirect wiring active

  return (
    <>
      <Toaster richColors position="top-center" closeButton />
      <TyreUIContent mode={mode} profile={profile} hydrated={hydrated} />
    </>
  );
}

function TyreUIContent({
  mode,
  profile,
  hydrated,
}: {
  mode: string;
  profile: unknown;
  hydrated: boolean;
}) {
  if (mode === "app") {
    if (!hydrated) return null; // avoid auth flash before localStorage read
    return profile ? <AppShell /> : <AuthGate />;
  }
  return <LandingPage />;
}
