"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/dashboard/api-client";
import { useToast } from "@/components/toast";

const SYM_IDS = ["key", "crystal", "map", "compass", "shield", "scroll", "star"];

const SYM_LABELS = {
  key: "Key",
  crystal: "Crystal",
  map: "Map",
  compass: "Compass",
  shield: "Shield",
  scroll: "Scroll",
  star: "Star",
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function SystemAppSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState(null);
  const [searchCostPresetsText, setSearchCostPresetsText] = useState("");
  const [reelDelaysText, setReelDelaysText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch("/api/dashboard/app-settings");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load settings");
        if (!cancelled) {
          setS(json);
          setSearchCostPresetsText((json.searchCostPresets || []).join(", "));
          setReelDelaysText((json.reelStopDelays || []).join(", "));
        }
      } catch (e) {
        if (!cancelled) toast(e.message || "Could not load settings", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const setField = (key, value) => {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setWeight = (id, value) => {
    setS((prev) =>
      prev
        ? {
            ...prev,
            symbolWeights: { ...prev.symbolWeights, [id]: num(value, prev.symbolWeights[id]) },
          }
        : prev
    );
  };

  const setFind = (key, value) => {
    setS((prev) =>
      prev ? { ...prev, findPayouts: { ...prev.findPayouts, [key]: num(value, prev.findPayouts[key]) } } : prev
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!s) return;
    const searchCostPresets = searchCostPresetsText
      .split(/[\s,]+/)
      .map((x) => num(x, NaN))
      .filter((n) => n > 0);
    const reelStopDelays = reelDelaysText
      .split(/[\s,]+/)
      .map((x) => num(x, NaN))
      .filter((n) => n > 0);
    const payload = {
      ...s,
      searchCostPresets: searchCostPresets.length ? searchCostPresets : s.searchCostPresets,
      reelStopDelays: reelStopDelays.length ? reelStopDelays : s.reelStopDelays,
      surveyControlPhoneE164: s.surveyControlPhoneE164 === "" ? null : s.surveyControlPhoneE164,
    };

    setSaving(true);
    try {
      const res = await apiFetch("/api/dashboard/app-settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Save failed");
      setS(json);
      setSearchCostPresetsText((json.searchCostPresets || []).join(", "));
      setReelDelaysText((json.reelStopDelays || []).join(", "));
      toast("System settings saved.", "success");
    } catch (err) {
      toast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !s) {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-surface-3 px-4 py-3 sm:px-5 sm:py-3.5">
          <h3 className="text-sm font-semibold">App parameters</h3>
        </div>
        <div className="px-4 py-8 sm:px-5 text-center text-sm text-ink-4">Loading…</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="card overflow-hidden">
      <div className="border-b border-surface-3 px-4 py-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">App parameters</h3>
          <p className="text-[11px] text-ink-4 mt-0.5 leading-relaxed">
            Values are stored in the database and enforced on the server. Invalid combinations are rejected on save.
          </p>
        </div>
        <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="max-h-[75vh] overflow-y-auto px-4 py-4 sm:px-5 space-y-5">
        <Section
          title="Public links"
          lead="Used by automated player emails (e.g. after phone verification). Must be a full https URL to your official Facebook page."
        >
          <DescribedControl
            label="Facebook page URL"
            description="Opens in the player email button and plain-text fallback. Example: https://www.facebook.com/yourpage"
            input={
              <input
                type="url"
                className="input font-mono text-sm w-full max-w-xl"
                placeholder="https://www.facebook.com/…"
                value={s.facebookPageUrl ?? ""}
                onChange={(e) => setField("facebookPageUrl", e.target.value)}
                spellCheck={false}
                autoComplete="url"
              />
            }
          />
        </Section>

        <Section
          title="Public game (marketing site)"
          lead="Controls the free-to-play experience: starting balance, outcome mix, timing, and coin search sizes. Reward and rarity rates influence random outcomes on the client."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Start credits"
              description="How many credits a new browser session begins with before any localStorage restore."
              value={s.startCredits}
              onChange={(v) => setField("startCredits", num(v))}
            />
            <Field
              label="Bonus credits"
              description="Extra credits granted for certain wins or promotions in the client game logic."
              value={s.bonusCredits}
              onChange={(v) => setField("bonusCredits", num(v))}
            />
            <Field
              label="Reward rate %"
              description="How often the client grants a winning outcome (0–100). Used alongside the rates below."
              value={s.rewardRate}
              onChange={(v) => setField("rewardRate", num(v))}
            />
            <Field
              label="Rare find line rate %"
              description="Among wins, how often all five symbols match the same treasure (0–100). Set to 0 to disable that tier."
              value={s.rareFindRate}
              onChange={(v) => setField("rareFindRate", num(v))}
            />
            <Field
              label="Four-match rate %"
              description="Weight for four-symbol match outcomes relative to other non-rare-find results."
              value={s.fourOfAKindRate}
              onChange={(v) => setField("fourOfAKindRate", num(v))}
            />
          </div>

          <DescribedControl
            label="Search cost presets"
            description="Comma-separated coin amounts for each search, shown in the public UI in the same order as entered."
            input={
              <input
                className="input font-mono text-sm"
                value={searchCostPresetsText}
                onChange={(e) => setSearchCostPresetsText(e.target.value)}
                spellCheck={false}
              />
            }
          />

          <DescribedControl
            label="Reel stop delays (ms)"
            description="Comma-separated pause in milliseconds before each reel stops, left to right. Length should match the number of reels in the UI (typically five)."
            input={
              <input
                className="input font-mono text-sm"
                value={reelDelaysText}
                onChange={(e) => setReelDelaysText(e.target.value)}
                spellCheck={false}
              />
            }
          />

          <div>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2">Symbol weights</h5>
            <p className="text-[11px] text-ink-4 leading-relaxed mb-3">
              Higher weight means the symbol lands less often on the reel and generally earns a higher five-of-a-kind
              reward tier in the player-facing treasure rules.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {SYM_IDS.map((id) => (
                <Field
                  key={id}
                  label={`${SYM_LABELS[id] ?? id} weight`}
                  description={`Tier weight for the ${SYM_LABELS[id] ?? id} reel symbol.`}
                  value={s.symbolWeights[id] ?? ""}
                  onChange={(v) => setWeight(id, v)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Great find multiplier (× search cost)"
              description='Coin multiplier (times current search cost) for a "great find" outcome that is not a five-symbol treasure line.'
              value={s.findPayouts.great_find}
              onChange={(v) => setFind("great_find", v)}
            />
            <Field
              label="Good find multiplier (× search cost)"
              description='Coin multiplier for a "good find" outcome below the great-find tier.'
              value={s.findPayouts.good_find}
              onChange={(v) => setFind("good_find", v)}
            />
          </div>
        </Section>

        <Section
          title="Survey & SMS OTP"
          lead="Limits on the public survey API and verification texts. Abuse protection applies per IP and per phone hash."
        >
          <Field
            label="Survey JSON body max characters"
            description="Maximum size of the raw POST body for /api/survey. Larger values allow bigger payloads but increase memory use (bounded in the database)."
            value={s.surveyRequestBodyMaxChars}
            onChange={(v) => setField("surveyRequestBodyMaxChars", num(v))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="OTP sends per phone (max)"
              description="Maximum verification SMS sends (initial + resends) for the same normalized phone within the rolling window below."
              value={s.otpSendsPerPhoneMax}
              onChange={(v) => setField("otpSendsPerPhoneMax", num(v))}
            />
            <Field
              label="OTP phone window (ms)"
              description="Rolling window length in milliseconds for the per-phone OTP cap (e.g. 3600000 = one hour)."
              value={s.otpSendsPerPhoneWindowMs}
              onChange={(v) => setField("otpSendsPerPhoneWindowMs", num(v))}
            />
          </div>
          <DescribedControl
            label="QA control phone (E.164)"
            description="Optional full international number (e.g. +15551234567) that is exempt from the per-phone OTP cap for testing. Leave empty in production unless you use a dedicated test handset."
            input={
              <input
                className="input font-mono text-sm"
                placeholder="+15551234567 or leave empty"
                value={s.surveyControlPhoneE164 ?? ""}
                onChange={(e) => setField("surveyControlPhoneE164", e.target.value)}
                spellCheck={false}
              />
            }
          />
        </Section>

        <Section
          title="Dashboard authentication"
          lead="Rate limits for sign-in, sign-up, and username/email checks on the management host. Password rules apply when users change passwords or admins reset them."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Login attempts (max per window)"
              description="How many failed or successful login POSTs one IP may make within the login window before HTTP 429."
              value={s.loginRateLimitMaxPerWindow}
              onChange={(v) => setField("loginRateLimitMaxPerWindow", num(v))}
            />
            <Field
              label="Login window (ms)"
              description="Sliding window for the login attempt counter, in milliseconds."
              value={s.loginRateLimitWindowMs}
              onChange={(v) => setField("loginRateLimitWindowMs", num(v))}
            />
            <Field
              label="Signup attempts (max per window)"
              description="How many sign-up POSTs one IP may make within the signup window before HTTP 429."
              value={s.signupRateLimitMaxPerWindow}
              onChange={(v) => setField("signupRateLimitMaxPerWindow", num(v))}
            />
            <Field
              label="Signup window (ms)"
              description="Sliding window for the signup counter. Supports long windows (stored as a large integer)."
              value={s.signupRateLimitWindowMs}
              onChange={(v) => setField("signupRateLimitWindowMs", num(v))}
            />
            <Field
              label="Check availability (max per window)"
              description="How many name/email availability checks one IP may call per window during sign-up."
              value={s.checkAvailabilityMaxPerWindow}
              onChange={(v) => setField("checkAvailabilityMaxPerWindow", num(v))}
            />
            <Field
              label="Check availability window (ms)"
              description="Sliding window for availability-check rate limiting."
              value={s.checkAvailabilityWindowMs}
              onChange={(v) => setField("checkAvailabilityWindowMs", num(v))}
            />
            <Field
              label="Password minimum length"
              description="Minimum characters required for new passwords (sign-up, change password, owner reset). Strength rules still require mixed case, digits, and symbols."
              value={s.passwordMinLength}
              onChange={(v) => setField("passwordMinLength", num(v))}
            />
            <Field
              label="Name / email debounce (ms)"
              description="Delay after typing before the sign-up form calls the availability API, to reduce duplicate requests."
              value={s.authUiCheckDebounceMs}
              onChange={(v) => setField("authUiCheckDebounceMs", num(v))}
            />
          </div>
          <DescribedControl
            label="Default role for new sign-ups"
            description="Role written into new Auth users when they request access. Cannot be owner; pick viewer for least privilege, or editor/admin if your onboarding policy allows."
            input={
              <select
                className="input text-sm"
                value={s.defaultSignupRole}
                onChange={(e) => setField("defaultSignupRole", e.target.value)}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            }
          />
        </Section>
      </div>
    </form>
  );
}

function Section({ title, lead, children }) {
  return (
    <section className="space-y-4 rounded-xl border border-surface-3/70 bg-surface-2/20 p-4 sm:p-5">
      <header>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</h4>
        {lead ? <p className="text-[11px] text-ink-4 mt-1.5 leading-relaxed">{lead}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, description, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {description ? <p className="text-[11px] text-ink-4 leading-relaxed">{description}</p> : null}
      <input type="number" className="input text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DescribedControl({ label, description, input }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {description ? <p className="text-[11px] text-ink-4 leading-relaxed">{description}</p> : null}
      {input}
    </div>
  );
}
