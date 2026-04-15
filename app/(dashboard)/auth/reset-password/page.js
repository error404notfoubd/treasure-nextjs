"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const MIN_PASSWORD = 8;

function getRecoveryTokensFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const p = new URLSearchParams(hash);
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    const type = p.get("type");
    if (access_token && refresh_token && type === "recovery") {
      return { access_token, refresh_token };
    }
  }
  return null;
}

function getRecoveryQuery() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const token_hash = q.get("token_hash");
  const type = q.get("type");
  if (token_hash && type === "recovery") return { token_hash };
  return null;
}

/** PKCE: createBrowserClient already uses detectSessionInUrl — wait for implicit exchange. */
async function waitForSessionFromUrl(supabase, attempts = 8, delayMs = 150) {
  for (let i = 0; i < attempts; i++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const applySession = useCallback(async (supabase) => {
    const tokens = getRecoveryTokensFromUrl();
    if (tokens?.access_token && tokens?.refresh_token) {
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (sessionErr) {
        setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
        setBusy(false);
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
      setBusy(false);
      return;
    }

    const qRecovery = getRecoveryQuery();
    if (qRecovery?.token_hash) {
      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: qRecovery.token_hash,
      });
      if (otpErr) {
        setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
        setBusy(false);
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
      setBusy(false);
      return;
    }

    // PKCE `?code=` — @supabase/ssr createBrowserClient exchanges it via detectSessionInUrl.
    // Do not call exchangeCodeForSession here (second exchange → 400 from Supabase).
    const waited = await waitForSessionFromUrl(supabase);
    if (waited?.user) {
      if (typeof window !== "undefined" && (window.location.search || window.location.hash)) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      setReady(true);
      setBusy(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setReady(true);
    } else {
      setError("Open the reset link from your email, or request a new password reset.");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
    startTransition(() => {
      void applySession(supabase);
    });
  }, [applySession]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      );
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message || "Could not update password.");
        setSaving(false);
        return;
      }
      await supabase.auth.signOut();
      router.push("/login?reset=1");
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    }
    setSaving(false);
  };

  if (busy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-3">
          <span className="w-10 h-10 border-2 border-accent/25 border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-ink-3">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[20%] w-[500px] h-[400px] rounded-full bg-accent/[0.04] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[400px] mx-4 animate-slide-up">
        <div className="card p-10">
          <h1 className="text-xl font-bold text-center mb-1 tracking-tight">Set new password</h1>
          <p className="text-ink-3 text-sm text-center mb-8">Choose a strong password for your account.</p>

          {error && (
            <div className="bg-danger-muted text-danger text-xs font-medium px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}

          {ready ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="label" htmlFor="npw">
                  New password
                </label>
                <input
                  id="npw"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD}
                  required
                  disabled={saving}
                />
              </div>
              <div className="mb-6">
                <label className="label" htmlFor="npw2">
                  Confirm password
                </label>
                <input
                  id="npw2"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={MIN_PASSWORD}
                  required
                  disabled={saving}
                />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? "Saving…" : "Update password"}
              </button>
            </form>
          ) : null}

          <p className="text-center text-ink-3 text-xs mt-6">
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
              Back to sign in
            </Link>
            {" · "}
            <Link href="/forgot-password" className="text-accent hover:text-accent-hover font-medium">
              Resend link
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
