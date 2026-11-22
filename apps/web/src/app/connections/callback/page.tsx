"use client";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { invoke } from "@/lib/app/native";
import { APP } from "@/lib/app/target";
import { finishOwnLogin } from "@/lib/connections/ownOAuth";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/**
 * 2026-11 — back from signing in with the DJ's own app (lib/connections/ownOAuth.ts): Dropbox on the web
 * (`<origin>/connections/callback`, the redirect URI of their Dropbox app), Google Drive in the apps (the
 * `<bundle id>:/oauth2redirect` deep link, forwarded here by src-tauri/src/byo.rs). The code is exchanged on this
 * device, straight with the provider; nothing goes to a TDJ server.
 */
export default function OwnCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void finishOwnLogin(
      { query: location.search },
      { app: APP, fetch: (...a) => fetch(...a), invoke: (c, a) => invoke(c, a) },
    ).then((r) => {
      if (r.ok) {
        toast(
          t("connections.connected_toast", { label: r.provider === "dropbox" ? "Dropbox" : "Google Drive" }),
        );
        router.replace(r.next);
      } else
        setError(
          r.error === "denied"
            ? t("connections.signin_denied", { label: r.provider === "google" ? "Google" : "Dropbox" })
            : t("connections.signin_failed"),
        );
    });
  }, [router]);
  return (
    <div className="surface mx-auto max-w-md p-6 text-center" role="status" aria-live="polite">
      <span className="mx-auto inline-grid h-6 w-6 place-items-center">
        {error ? (
          <CircleAlert size={24} className="tone-tango" aria-hidden />
        ) : (
          <LoaderCircle size={24} className="animate-spin" aria-hidden />
        )}
      </span>
      {error ? (
        <>
          <p className="mt-2 font-semibold">{t("connections.callback_failed")}</p>
          <p className="text-muted mt-1 text-sm">{error}</p>
          <Link href="/settings" className="btn btn-ghost mt-4 min-h-11">
            {t("connections.back_to_settings")}
          </Link>
        </>
      ) : (
        <p className="mt-2 text-sm">{t("connections.callback_title")}</p>
      )}
    </div>
  );
}
