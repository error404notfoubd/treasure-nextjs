"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/dashboard/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
        skipUnauthorizedRedirect: true,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      setMessage(typeof data.message === "string" ? data.message : "Check your email for next steps.");
      setEmail("");
    } catch {
      setError("An unexpected error occurred.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[20%] w-[500px] h-[400px] rounded-full bg-accent/[0.04] blur-[100px]" />
        <div className="absolute bottom-[20%] right-[15%] w-[400px] h-[350px] rounded-full bg-warn/[0.03] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[400px] mx-4 animate-slide-up">
        <div className="card p-10 relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-7">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" aria-hidden>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <path d="m22 6-10 7L2 6" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-center mb-1 tracking-tight">Forgot password</h1>
          <p className="text-ink-3 text-sm text-center mb-8">
            Enter your account email. If it exists, we will send a reset link.
          </p>

          {error && (
            <div className="bg-danger-muted text-danger text-xs font-medium px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-success-muted text-success text-xs font-medium px-4 py-3 rounded-lg mb-5">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="label" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
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

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="text-center text-ink-3 text-xs mt-6">
            <Link
              href="/login"
              className={`text-accent hover:text-accent-hover font-medium ${loading ? "pointer-events-none opacity-50" : ""}`}
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
