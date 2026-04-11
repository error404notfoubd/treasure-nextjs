"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFormSkeleton } from "@/components/skeleton";
import { apiFetch } from "@/lib/dashboard/api-client";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
    ? rawRedirect
    : "/dashboard";

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setLoadingMessage("Signing in…");

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
        skipUnauthorizedRedirect: true,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : res.status === 429
              ? "Too many sign-in attempts. Please wait and try again."
              : "Could not sign in. Please try again."
        );
        setLoading(false);
        setLoadingMessage("");
        return;
      }

      setLoading(false);
      setLoadingMessage("");
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError("An unexpected error occurred");
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[20%] w-[500px] h-[400px] rounded-full bg-accent/[0.04] blur-[100px]" />
        <div className="absolute bottom-[20%] right-[15%] w-[400px] h-[350px] rounded-full bg-warn/[0.03] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[400px] mx-4 animate-slide-up">
        <div className="card p-10 relative overflow-hidden">
          {loading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[inherit] bg-surface-0/85 backdrop-blur-[2px] px-6"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="w-10 h-10 border-2 border-accent/25 border-t-accent rounded-full animate-spin" />
              <p className="text-sm font-medium text-ink-2 text-center">{loadingMessage || "Please wait…"}</p>
            </div>
          )}
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-7">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-center mb-1 tracking-tight">Welcome back</h1>
          <p className="text-ink-3 text-sm text-center mb-8">Sign in to the management console</p>

          {error && (
            <div className="bg-danger-muted text-danger text-xs font-medium px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} aria-busy={loading}>
            <div className="mb-4">
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="mb-6">
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-ink-3 text-xs mt-6">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className={`text-accent hover:text-accent-hover font-medium ${loading ? "pointer-events-none opacity-50" : ""}`}
              tabIndex={loading ? -1 : undefined}
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
