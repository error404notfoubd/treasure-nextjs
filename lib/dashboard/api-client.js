"use client";

function getCsrfToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? match[1] : null;
}

/**
 * Fetch wrapper that attaches the CSRF token and handles
 * session expiry (401 → redirect to login), unless skipUnauthorizedRedirect is set
 * (e.g. login/signup forms where 401 means wrong credentials).
 */
export async function apiFetch(url, options = {}) {
  const { skipUnauthorizedRedirect = false, headers: userHeaders, ...fetchOptions } = options;
  const headers = new Headers(userHeaders);

  const csrf = getCsrfToken();
  if (csrf) headers.set("x-csrf-token", csrf);

  if (fetchOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: "same-origin",
  });

  if (res.status === 401 && !skipUnauthorizedRedirect) {
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (res.status === 403) {
    const data = await res.clone().json().catch(() => ({}));
    if (data.error?.includes("CSRF")) {
      window.location.reload();
      throw new Error("Security token expired");
    }
  }

  return res;
}
