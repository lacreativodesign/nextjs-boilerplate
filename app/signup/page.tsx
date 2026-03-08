"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebaseClient";

type Step = 1 | 2 | 3 | 4 | 5;

type SignupState = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  industry: string;
  companySize: string;
  country: string;
  state: string;
  timezone: string;
  currency: string;
  selectedModules: string[];
  termsAccepted: boolean;
  termsVersion: string;
};

type Errors = Partial<Record<keyof SignupState, string>>;

const REQUIRED_MODULES = new Set(["dashboard", "clients", "admin"]);

const modules = [
  { key: "dashboard", icon: "📊", name: "Dashboard", description: "Central hub for all your KPIs and activity" },
  { key: "clients", icon: "🤝", name: "Clients", description: "Manage client relationships and contacts" },
  { key: "sales", icon: "💼", name: "Sales", description: "Track leads, deals, and pipeline" },
  { key: "finance", icon: "💰", name: "Finance", description: "Invoices, expenses, and financial reporting" },
  { key: "humanResource", icon: "🧑‍💼", name: "Human Resources", description: "Employee management and payroll" },
  { key: "production", icon: "🏭", name: "Production", description: "Job tracking and production workflows" },
  { key: "projects", icon: "🗂️", name: "Projects", description: "Project management and timelines" },
  { key: "reports", icon: "📈", name: "Reports", description: "Advanced analytics and custom reports" },
  { key: "notifications", icon: "🔔", name: "Notifications", description: "Automated alerts and system notifications" },
  { key: "admin", icon: "⚙️", name: "Admin", description: "User management and system configuration" },
];

const industries = [
  "Technology",
  "Marketing & Creative",
  "Finance",
  "Healthcare",
  "Retail & E-commerce",
  "Manufacturing",
  "Consulting",
  "Education",
  "Real Estate",
  "Other",
];

const companySizes = ["Just me", "2–10", "11–50", "51–200", "201–500", "500+"];
const countries = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "United Arab Emirates",
  "Saudi Arabia",
  "Pakistan",
  "India",
  "Germany",
  "France",
  "Spain",
  "Netherlands",
  "Singapore",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Brazil",
  "Mexico",
  "Japan",
  "Other",
];

const usStates = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

const timezones = [
  "UTC", "America/New_York (EST/EDT)", "America/Chicago (CST/CDT)", "America/Denver (MST/MDT)", "America/Los_Angeles (PST/PDT)",
  "America/Phoenix", "America/Toronto", "America/Vancouver", "Europe/London (GMT/BST)", "Europe/Paris (CET/CEST)",
  "Europe/Berlin", "Europe/Amsterdam", "Europe/Madrid", "Asia/Dubai (GST)", "Asia/Karachi (PKT)", "Asia/Kolkata (IST)",
  "Asia/Singapore", "Asia/Tokyo (JST)", "Australia/Sydney (AEST/AEDT)", "Africa/Johannesburg (SAST)", "Africa/Lagos (WAT)",
  "America/Sao_Paulo (BRT)", "America/Mexico_City", "Asia/Riyadh (AST)",
];

const currencies = ["USD", "EUR", "GBP", "AED", "SAR", "PKR", "INR", "CAD", "AUD", "SGD", "ZAR", "NGN", "BRL", "MXN", "JPY"];

const termsText = `By creating a Bizosto account, you agree to the following:

FREE TRIAL & BILLING
Your 14-day free trial begins immediately upon account creation. No payment is required during the trial period. After your trial ends, your selected plan will be billed automatically on a monthly basis. You authorize Bizosto to charge your payment method on file at the start of each billing cycle. You may cancel at any time before your trial ends to avoid charges.

PLATFORM HANDLING FEE
A 0.5% platform handling fee applies to all transactions processed through Bizosto payment infrastructure.

TAX
Applicable sales tax, VAT, or digital services tax will be automatically calculated and added to your subscription based on your billing location and applicable local law. Bizosto, a product of LA CREATIVO GROUP, LLC, complies with Texas state tax law and applicable US and international tax regulations.

PAYMENTS & DISPUTES
When you connect a payment account to accept payments from your clients, you become the merchant of record for those transactions. Bizosto bears no responsibility for chargebacks, payment disputes, or refunds between you and your clients.

CANCELLATION
You may cancel your subscription at any time. Upon cancellation, your access continues until the end of the current billing period. No refunds are issued for partial months.

ACCOUNT LOCK
If a payment fails, a 7-day grace period applies. After 7 days, your account enters read-only mode. After 14 days, your account is locked. Full access is restored immediately upon successful payment.

DATA & PRIVACY
Your data is securely stored and isolated from other tenants. Upon account cancellation, your data is retained for 30 days and then permanently deleted unless you request an export.

By checking the box below, you confirm you have read and agree to these terms. You authorize automatic monthly billing after your free trial ends.`;

const stepContent: Record<Exclude<Step, 5>, { title: string; subtitle: string }> = {
  1: { title: "Create Your Account", subtitle: "Set your admin login credentials to begin." },
  2: { title: "Tell Us About Your Business", subtitle: "Help us configure your workspace defaults." },
  3: { title: "Choose Your Modules", subtitle: "Pick the tools you want enabled from day one." },
  4: { title: "Terms & Conditions", subtitle: "Review and accept to activate your free trial." },
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [trialEndsAt, setTrialEndsAt] = useState<string>("");
  const [authPassword, setAuthPassword] = useState("");
  const [formState, setFormState] = useState<SignupState>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    industry: industries[0],
    companySize: companySizes[0],
    country: countries[0],
    state: "",
    timezone: "UTC",
    currency: "USD",
    selectedModules: modules.map((module) => module.key),
    termsAccepted: false,
    termsVersion: "1.0",
  });

  const progress = useMemo(() => ((step - 1) / 4) * 100, [step]);

  const setValue = <K extends keyof SignupState>(key: K, value: SignupState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validateStep1 = () => {
    const nextErrors: Errors = {};
    if (formState.fullName.trim().length < 2) nextErrors.fullName = "Full name must be at least 2 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim())) nextErrors.email = "Please enter a valid email address.";
    if (!/^.*(?=.{8,})(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(formState.password)) {
      nextErrors.password = "Password must include uppercase, lowercase, and a number (min 8 chars).";
    }
    if (formState.confirmPassword !== formState.password) nextErrors.confirmPassword = "Passwords do not match.";
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateStep2 = () => {
    const nextErrors: Errors = {};
    if (formState.companyName.trim().length < 2) nextErrors.companyName = "Company name must be at least 2 characters.";
    if (!formState.country.trim()) nextErrors.country = "Country is required.";
    if (!formState.timezone.trim()) nextErrors.timezone = "Timezone is required.";
    if (!formState.currency.trim()) nextErrors.currency = "Currency is required.";
    if (formState.country === "United States" && !formState.state.trim()) nextErrors.state = "State is required for United States.";
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const nextStep = async () => {
    setError("");

    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3) {
      if (!formState.selectedModules.includes("dashboard") || !formState.selectedModules.includes("clients") || !formState.selectedModules.includes("admin")) {
        setError("Dashboard, Clients, and Admin modules are required.");
        return;
      }
    }

    if (step === 4) {
      if (!formState.termsAccepted) {
        setFieldErrors((prev) => ({ ...prev, termsAccepted: "You must accept the terms to continue." }));
        return;
      }

      setLoading(true);
      setAuthPassword(formState.password);

      try {
        const response = await fetch("/api/signup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: formState.fullName.trim(),
            email: formState.email.trim().toLowerCase(),
            password: formState.password,
            companyName: formState.companyName.trim(),
            industry: formState.industry,
            companySize: formState.companySize,
            country: formState.country,
            state: formState.state,
            timezone: formState.timezone,
            currency: formState.currency,
            selectedModules: formState.selectedModules,
            termsAccepted: formState.termsAccepted,
            termsVersion: "1.0",
          }),
        });

        const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Unable to create your workspace. Please try again.");
        }

        setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
        setFormState((prev) => ({ ...prev, password: "", confirmPassword: "" }));
        setStep(5);
      } catch (submitError: unknown) {
        setError(submitError instanceof Error ? submitError.message : "Unable to create your workspace. Please try again.");
      } finally {
        setLoading(false);
      }

      return;
    }

    setStep((prev) => Math.min(5, (prev + 1) as Step));
  };

  const previousStep = () => {
    setError("");
    setStep((prev) => Math.max(1, (prev - 1) as Step));
  };

  const toggleModule = (moduleKey: string) => {
    if (REQUIRED_MODULES.has(moduleKey)) return;

    setValue(
      "selectedModules",
      formState.selectedModules.includes(moduleKey)
        ? formState.selectedModules.filter((key) => key !== moduleKey)
        : [...formState.selectedModules, moduleKey]
    );
  };

  const handleBlur = (field: keyof SignupState) => {
    if (step === 1) validateStep1();
    if (step === 2) validateStep2();
    if (field === "termsAccepted" && !formState.termsAccepted) {
      setFieldErrors((prev) => ({ ...prev, termsAccepted: "You must accept the terms to continue." }));
    }
  };

  const goToDashboard = async () => {
    if (!authPassword) {
      setError("Unable to complete auto sign-in. Please log in manually.");
      router.push("/login");
      return;
    }

    setRedirecting(true);
    setError("");

    try {
      const auth = await getFirebaseAuth();
      await signInWithEmailAndPassword(auth, formState.email.trim().toLowerCase(), authPassword);
      setAuthPassword("");
      router.push("/dashboard");
    } catch (signInError) {
      console.error("Auto sign-in failed", signInError);
      setError("Workspace created, but auto sign-in failed. Please login manually.");
      router.push("/login");
    } finally {
      setRedirecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-3 py-6 sm:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[480px] items-center justify-center">
        <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-[var(--text-primary)] shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] text-3xl font-bold text-white">B</div>
            <p className="text-xs font-semibold tracking-[0.24em] text-[var(--text-muted)]">BIZOSTO</p>
          </div>

          {step !== 5 ? (
            <>
              <div className="mb-5">
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-[var(--erp-blue)] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="mb-3 flex items-center justify-between">
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span key={dot} className={`h-2.5 w-2.5 rounded-full ${step >= dot ? "bg-[var(--erp-blue)]" : "bg-black/20"}`} />
                  ))}
                </div>
                <h1 className="text-2xl font-semibold">{stepContent[step as Exclude<Step, 5>].title}</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{stepContent[step as Exclude<Step, 5>].subtitle}</p>
              </div>

              <div className="space-y-4">
                {step === 1 ? (
                  <>
                    <Input label="Full Name" value={formState.fullName} placeholder="Jane Smith" onChange={(value) => setValue("fullName", value)} onBlur={() => handleBlur("fullName")} error={fieldErrors.fullName} />
                    <Input label="Business Email" type="email" value={formState.email} placeholder="jane@company.com" onChange={(value) => setValue("email", value)} onBlur={() => handleBlur("email")} error={fieldErrors.email} />
                    <Input label="Password" type="password" value={formState.password} placeholder="Min. 8 characters" onChange={(value) => setValue("password", value)} onBlur={() => handleBlur("password")} error={fieldErrors.password} />
                    <Input label="Confirm Password" type="password" value={formState.confirmPassword} placeholder="Re-enter password" onChange={(value) => setValue("confirmPassword", value)} onBlur={() => handleBlur("confirmPassword")} error={fieldErrors.confirmPassword} />
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <Input label="Company Name" value={formState.companyName} placeholder="Acme Corp" onChange={(value) => setValue("companyName", value)} onBlur={() => handleBlur("companyName")} error={fieldErrors.companyName} />
                    <Select label="Industry" value={formState.industry} options={industries} onChange={(value) => setValue("industry", value)} />
                    <Select label="Company Size" value={formState.companySize} options={companySizes} onChange={(value) => setValue("companySize", value)} />
                    <Select label="Country" value={formState.country} options={countries} onChange={(value) => {
                      setValue("country", value);
                      if (value !== "United States") setValue("state", "");
                    }} error={fieldErrors.country} />
                    {formState.country === "United States" ? (
                      <Select label="State / Province" value={formState.state} options={usStates} onChange={(value) => setValue("state", value)} error={fieldErrors.state} />
                    ) : null}
                    <Select label="Timezone" value={formState.timezone} options={timezones} onChange={(value) => setValue("timezone", value)} error={fieldErrors.timezone} />
                    <Select label="Base Currency" value={formState.currency} options={currencies} onChange={(value) => setValue("currency", value)} error={fieldErrors.currency} />
                  </>
                ) : null}

                {step === 3 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {modules.map((module) => {
                      const checked = formState.selectedModules.includes(module.key);
                      const isRequired = REQUIRED_MODULES.has(module.key);

                      return (
                        <button
                          key={module.key}
                          type="button"
                          title={isRequired ? "Required" : ""}
                          onClick={() => toggleModule(module.key)}
                          className={`rounded-xl border p-3 text-left transition ${checked ? "border-[var(--erp-blue)] bg-[var(--erp-blue)]/10" : "border-[var(--border-subtle)]"} ${isRequired ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-lg">{module.icon}</span>
                            <input type="checkbox" checked={checked} readOnly disabled={isRequired} />
                          </div>
                          <p className="font-medium">{module.name}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{module.description}</p>
                          {isRequired ? <p className="mt-2 text-[11px] text-[var(--text-muted)]">Required</p> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {step === 4 ? (
                  <>
                    <div className="max-h-[200px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] p-3 text-sm leading-6 text-[var(--text-muted)] whitespace-pre-line">
                      {termsText}
                    </div>
                    <label className="flex items-start gap-3 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={formState.termsAccepted}
                        onChange={(event) => setValue("termsAccepted", event.target.checked)}
                        onBlur={() => handleBlur("termsAccepted")}
                        className="mt-0.5"
                      />
                      <span>
                        I have read and agree to the Bizosto Terms of Service. I authorize automatic monthly billing of my selected plan after my 14-day free trial ends.
                      </span>
                    </label>
                    {fieldErrors.termsAccepted ? <p className="text-sm text-red-600">{fieldErrors.termsAccepted}</p> : null}
                  </>
                ) : null}
              </div>

              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button type="button" onClick={previousStep} disabled={step === 1 || loading} className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void nextStep();
                  }}
                  disabled={loading || (step === 4 && !formState.termsAccepted)}
                  className="rounded-lg bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? "Creating your workspace..." : step === 4 ? "Start Trial" : "Continue"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">✓</div>
              <h1 className="text-2xl font-semibold">Your workspace is ready!</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your 14-day free trial has started. We&apos;ve sent a welcome email to {formState.email}.
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                Trial ends on {new Date(trialEndsAt || Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString()}
              </p>
              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                onClick={() => {
                  void goToDashboard();
                }}
                disabled={redirecting}
                className="mt-6 w-full rounded-lg bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {redirecting ? "Signing you in..." : "Go to Dashboard"}
              </button>
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                If you are not redirected, you can <Link href="/login" className="underline">sign in manually</Link>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  type?: "text" | "email" | "password";
}) {
  const [showPassword, setShowPassword] = useState(false);
  const resolvedType = type === "password" && showPassword ? "text" : type;

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input
          type={resolvedType}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2.5 pr-16 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--erp-blue)]"
        />
        {type === "password" ? (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[var(--text-muted)]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--erp-blue)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
