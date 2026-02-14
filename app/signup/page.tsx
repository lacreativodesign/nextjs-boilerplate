"use client";

import { FormEvent, useMemo, useState } from "react";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, params: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const initialForm = {
  name: "",
  email: "",
  company: "",
  password: "",
  agreeToLegal: false,
};

const blockedDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];

export default function SignupPage() {
  const [form, setForm] = useState(initialForm);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaId, setRecaptchaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const domainError = useMemo(() => {
    const atIndex = form.email.indexOf("@");
    if (atIndex < 0) return "";
    const domain = form.email.slice(atIndex + 1).trim().toLowerCase();
    if (blockedDomains.includes(domain)) {
      return "Use your work email (personal email domains are blocked).";
    }
    return "";
  }, [form.email]);

  const passwordRules = useMemo(() => {
    return {
      minLength: form.password.length >= 8,
      uppercase: /[A-Z]/.test(form.password),
      number: /\d/.test(form.password),
      special: /[^A-Za-z\d]/.test(form.password),
    };
  }, [form.password]);

  const isPasswordValid = Object.values(passwordRules).every(Boolean);

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.company.trim().length >= 2 &&
    !domainError &&
    form.email.trim().length > 0 &&
    isPasswordValid &&
    form.agreeToLegal &&
    recaptchaToken.length > 0;

  async function ensureRecaptcha() {
    if (typeof window === "undefined") return;
    if (window.grecaptcha && recaptchaId !== null) return;

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
    if (!siteKey) {
      setError("reCAPTCHA is not configured. Please contact support.");
      return;
    }

    if (!document.querySelector('script[src="https://www.google.com/recaptcha/api.js?render=explicit"]')) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load reCAPTCHA."));
        document.head.appendChild(script);
      });
    }

    const container = document.getElementById("signup-recaptcha");
    if (!container || !window.grecaptcha) return;
    const widgetId = window.grecaptcha.render(container, {
      sitekey: siteKey,
      callback: (token: string) => setRecaptchaToken(token),
      "expired-callback": () => setRecaptchaToken(""),
    });
    setRecaptchaId(widgetId);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError("Complete all required fields and verify reCAPTCHA.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recaptchaToken }),
      });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string; message?: string } | null;
      if (!response.ok || !payload?.success) {
        setError(payload?.error || "Unable to complete signup.");
        return;
      }

      setSuccess(payload.message || "Signup complete. Check your email.");
      setForm(initialForm);
      setRecaptchaToken("");
      if (window.grecaptcha && recaptchaId !== null) {
        window.grecaptcha.reset(recaptchaId);
      }
    } catch (submitError: any) {
      setError(submitError?.message || "Unable to complete signup.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">14-day free trial</span>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Start Bizosto ERP in minutes.</h1>
            <p className="text-slate-600">No credit card required. Cancel anytime. Enterprise-grade workflows from day one.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-bold text-slate-900">2,100+</p>
              <p className="text-sm text-slate-600">teams onboarded</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-bold text-slate-900">99.95%</p>
              <p className="text-sm text-slate-600">uptime</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-bold text-slate-900">24/7</p>
              <p className="text-sm text-slate-600">support coverage</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What customers say</h2>
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-700">“We launched our full operations stack in three days and removed five disconnected tools.”</p>
              <p className="mt-2 text-xs font-medium text-slate-500">COO, Mid-market manufacturer</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-700">“Tenant provisioning and role controls are exactly what we needed for secure scaling.”</p>
              <p className="mt-2 text-xs font-medium text-slate-500">Head of IT, Multi-entity services company</p>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Create your trial account</h2>
          <p className="mt-1 text-sm text-slate-600">Provision your workspace instantly with secure email verification.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label htmlFor="name" className="text-sm font-medium text-slate-700">Full name</label>
              <input id="name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>

            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">Work email</label>
              <input id="email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              {domainError ? <p className="text-xs text-red-600">{domainError}</p> : null}
            </div>

            <div className="space-y-1">
              <label htmlFor="company" className="text-sm font-medium text-slate-700">Company name</label>
              <input id="company" value={form.company} onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))} required minLength={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
              <input id="password" type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <PasswordStrengthMeter password={form.password} />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.agreeToLegal} onChange={(e) => setForm((s) => ({ ...s, agreeToLegal: e.target.checked }))} className="mt-1" />
              <span>
                I agree to the <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.
              </span>
            </label>

            <div className="space-y-2">
              <button type="button" onClick={ensureRecaptcha} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Load reCAPTCHA</button>
              <div id="signup-recaptcha" />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Creating trial account..." : "Start free trial"}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">No credit card required • Cancel anytime • SOC-ready architecture</p>
        </section>
      </div>
    </main>
  );
}
