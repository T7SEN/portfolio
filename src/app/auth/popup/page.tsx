"use client";

import { useEffect, Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type Provider = "github" | "discord" | "google";

function isProvider(value: string | null): value is Provider {
  return value === "github" || value === "discord" || value === "google";
}

function AuthPopupLogic() {
  const searchParams = useSearchParams();
  const providerParam = searchParams.get("provider");
  const provider = isProvider(providerParam) ? providerParam : null;

  useEffect(() => {
    if (!provider) return;

    // Better Auth's social sign-in. callbackURL is where the OAuth dance
    // returns to; /auth/success closes the popup + posts AUTH_SUCCESS back
    // to the opener (window.postMessage) so the guestbook form refetches
    // its session.
    authClient.signIn.social({
      provider,
      callbackURL: "/auth/success",
    });
  }, [provider]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono">
          Connecting to {provider ?? "provider"}...
        </p>
      </div>
    </div>
  );
}

export default function AuthPopupPage() {
  return (
    <Suspense>
      <AuthPopupLogic />
    </Suspense>
  );
}
