'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import {
  ANNUAL_FREE_MONTHS,
  plans as PLAN_CATALOG,
  toCheckoutPlanKey,
  type BillingCycle,
} from '@/lib/billing/plans';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type PlanKey = 'starter' | 'pro' | 'enterprise';

type SignupState = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  companyName: string;
  industry: string;
  companySize: string;
  country: string;
  state: string;
  timezone: string;
  currency: string;
  selectedPlan: PlanKey;
  termsAccepted: boolean;
  termsVersion: string;
};

type Errors = Partial<Record<keyof SignupState, string>>;

const plans: Array<{
  key: PlanKey;
  name: string;
  price: number;
  badge?: string;
  features: string[];
}> = [
  {
    key: 'starter',
    name: 'Starter',
    price: 79,
    // Source of truth: lib/billing/plans.ts + app/config/plans.ts (PLAN_MODULES).
    // Starter unlocks CRM, Sales, Projects, Reports — NOT Finance/Production/HR.
    features: [
      'CRM, Sales & Projects',
      'Reports',
      '10 users',
      '20GB storage',
      '10 client portal seats',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 149,
    badge: 'Most Popular',
    // Pro adds Finance, Production, Approvals, full Reports, AI Workforce, Website Embed.
    features: [
      'All Starter, plus:',
      'Finance & Production',
      'AI Workforce + Website Embed',
      '20 users',
      '75GB storage',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 299,
    badge: 'Best Value',
    // Enterprise adds HR, Client Stripe Connect payments, white-label.
    features: [
      'All Pro, plus:',
      'HR module',
      'Client payments + white-label',
      'Unlimited users',
      '250GB storage',
    ],
  },
];

const industries = [
  'Technology',
  'Marketing & Creative',
  'Finance',
  'Healthcare',
  'Retail & E-commerce',
  'Manufacturing',
  'Consulting',
  'Education',
  'Real Estate',
  'Other',
];

const teamSizes = ['1-5', '6-20', '21-50', '51-200', '200+'];
const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'United Arab Emirates',
  'Saudi Arabia',
  'Pakistan',
  'India',
  'Germany',
  'France',
  'Spain',
  'Netherlands',
  'Singapore',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Brazil',
  'Mexico',
  'Japan',
  'Other',
];

function buildTermsText(isAnnual: boolean) {
  const cadenceAdjective = isAnnual ? 'annual' : 'monthly';
  const cadenceNoun = isAnnual ? 'year' : 'month';
  return `By creating a Bizosto account, you agree to the following:

FREE TRIAL & BILLING
Your 14-day free trial begins immediately upon account creation. A valid payment method is required at signup, but you will not be charged until day 15. If you cancel at any time before the end of day 14, you will not be charged anything. If you do not cancel, your selected plan is billed automatically starting on day 15, and on a recurring ${cadenceAdjective} basis thereafter. You authorize Bizosto to charge your payment method on file at the start of each billing cycle.

PLATFORM HANDLING FEE
A 0.5% platform handling fee applies to all transactions processed through Bizosto payment infrastructure.

TAX
Applicable sales tax, VAT, or digital services tax will be automatically calculated and added to your subscription based on your billing location and applicable local law. Bizosto, a product of LA CREATIVO GROUP, LLC, complies with Texas state tax law and applicable US and international tax regulations.

PAYMENTS & DISPUTES
When you connect a payment account to accept payments from your clients, you become the merchant of record for those transactions. Bizosto bears no responsibility for chargebacks, payment disputes, or refunds between you and your clients.

CANCELLATION
You may cancel your subscription at any time. Upon cancellation, your access continues until the end of the current billing period. No refunds are issued for partial ${cadenceNoun}s.

ACCOUNT LOCK
If a payment fails, a 7-day grace period applies with full access. On day 8, your account enters read-only mode. On day 21, your account is locked. Data is retained for 60 days after lock. Full access is restored immediately upon successful payment.

DATA & PRIVACY
Your data is securely stored and isolated from other tenants. Upon account cancellation, your data is retained for 30 days and then permanently deleted unless you request an export. If your account is locked for non-payment, data is retained for 60 days before deletion.

By checking the box below, you confirm you have read and agree to these terms. You authorize automatic ${cadenceAdjective} billing after your free trial ends.`;
}

const stepContent: Record<Exclude<Step, 7>, { title: string; subtitle: string }> = {
  1: { title: 'Create Your Account', subtitle: 'Set your admin login credentials to begin.' },
  2: { title: 'Verify Your Email', subtitle: 'Enter the 6-digit code we sent to your email.' },
  3: {
    title: 'Tell Us About Your Business',
    subtitle: 'Help us configure your workspace defaults.',
  },
  4: {
    title: 'Choose Your Plan',
    subtitle: 'Select the subscription your team will use after the trial.',
  },
  5: { title: 'Terms & Conditions', subtitle: 'Review and accept to activate your free trial.' },
  6: {
    title: 'Start Your Trial',
    subtitle: 'Confirm checkout details before starting your 14-day free trial.',
  },
};

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [trialEndsAt, setTrialEndsAt] = useState<string>('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const initialPlan = plans.some((plan) => plan.key === searchParams.get('plan'))
    ? (searchParams.get('plan') as PlanKey)
    : 'pro';
  const [formState, setFormState] = useState<SignupState>({
    fullName: searchParams.get('name') || '',
    email: searchParams.get('email') || '',
    password: '',
    phone: '',
    companyName: searchParams.get('company') || '',
    industry: industries[0],
    companySize: teamSizes[0],
    country: COUNTRIES[0],
    state: '',
    timezone: 'UTC',
    currency: 'USD',
    selectedPlan: initialPlan,
    termsAccepted: false,
    termsVersion: '1.0',
  });

  // OTP resend cooldown countdown
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = setTimeout(() => setOtpResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpResendCooldown]);

  const progress = useMemo(() => ((step - 1) / 6) * 100, [step]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const isAnnual = billingCycle === 'annual';
  const selectedPlan = plans.find((plan) => plan.key === formState.selectedPlan) || plans[1];
  const noChargeUntil = useMemo(
    () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    [],
  );

  const setValue = <K extends keyof SignupState>(key: K, value: SignupState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateStep1 = () => {
    const nextErrors: Errors = {};
    if (formState.fullName.trim().length < 2)
      nextErrors.fullName = 'Full name must be at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim()))
      nextErrors.email = 'Please enter a valid email address.';
    if (!/^.*(?=.{8,})(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(formState.password)) {
      nextErrors.password =
        'Password must include uppercase, lowercase, and a number (min 8 chars).';
    }
    if (formState.phone.trim().length < 7) nextErrors.phone = 'Please enter a valid phone number.';
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateCompanyStep = () => {
    const nextErrors: Errors = {};
    if (formState.companyName.trim().length < 2)
      nextErrors.companyName = 'Company name must be at least 2 characters.';
    if (!formState.country.trim()) nextErrors.country = 'Country is required.';
    if (!formState.industry.trim()) nextErrors.industry = 'Industry is required.';
    if (!formState.companySize.trim()) nextErrors.companySize = 'Team size is required.';
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const sendOtp = async (isResend = false) => {
    setOtpSending(true);
    setOtpError('');
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formState.email.trim().toLowerCase() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        setOtpError(payload?.error || 'Failed to send code. Please try again.');
        return;
      }
      if (isResend) setOtpResendCooldown(60);
    } catch {
      setOtpError('Network error. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const nextStep = async () => {
    setError('');

    if (step === 1) {
      if (!validateStep1()) return;
      // Send OTP then advance to OTP step
      setLoading(true);
      try {
        const res = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formState.email.trim().toLowerCase() }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) {
          setError(payload?.error || 'Failed to send verification code. Please try again.');
          return;
        }
        setOtpResendCooldown(60);
        setStep(2);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === 2) {
      // Verify OTP
      if (!otpCode.trim()) {
        setOtpError('Please enter the verification code.');
        return;
      }
      setLoading(true);
      setOtpError('');
      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formState.email.trim().toLowerCase(),
            otp: otpCode.trim(),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) {
          setOtpError(payload?.error || 'Invalid code. Please try again.');
          return;
        }
        setStep(3);
      } catch {
        setOtpError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === 3 && !validateCompanyStep()) return;

    if (step === 5) {
      if (!formState.termsAccepted) {
        setFieldErrors((prev) => ({
          ...prev,
          termsAccepted: 'You must accept the terms to continue.',
        }));
        return;
      }
      setStep(6);
      return;
    }

    if (step === 6) {
      if (!formState.termsAccepted) {
        setFieldErrors((prev) => ({
          ...prev,
          termsAccepted: 'You must accept the terms to continue.',
        }));
        return;
      }

      setLoading(true);

      try {
        const response = await fetch('/api/signup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: formState.fullName.trim(),
            email: formState.email.trim().toLowerCase(),
            password: formState.password,
            phone: formState.phone.trim(),
            companyName: formState.companyName.trim(),
            industry: formState.industry,
            companySize: formState.companySize,
            country: formState.country,
            state: formState.state,
            timezone: formState.timezone,
            currency: formState.currency,
            selectedPlan: formState.selectedPlan,
            referredBy: searchParams.get('ref') || null,
            termsAccepted: formState.termsAccepted,
            termsVersion: '1.0',
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          tenantId?: string;
        } | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'Unable to create your workspace. Please try again.');
        }

        const auth = await getFirebaseAuth();
        const userCred = await signInWithEmailAndPassword(
          auth,
          formState.email.trim().toLowerCase(),
          formState.password,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const idToken = await userCred.user.getIdToken(true);
        const sessionRes = await fetch('/api/session-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, rememberMe: true }),
        });

        if (!sessionRes.ok) {
          throw new Error(
            'Workspace created, but we could not create your session. Please log in manually.',
          );
        }

        const checkoutResponse = await fetch('/api/stripe/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // S7: `${plan}_${cycle}` — sending the bare plan key always resolved to the
            // monthly Stripe price, making annual billing impossible to purchase.
            plan: toCheckoutPlanKey(formState.selectedPlan, billingCycle),
            tenantId: payload.tenantId,
            customerEmail: formState.email.trim().toLowerCase(),
            trialPeriodDays: 14,
            successUrl: `${window.location.origin}/dashboard?signup=success`,
            cancelUrl: `${window.location.origin}/signup?checkout=cancelled&plan=${formState.selectedPlan}`,
          }),
        });
        const checkoutPayload = (await checkoutResponse.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          url?: string;
        } | null;
        if (!checkoutResponse.ok || !checkoutPayload?.ok || !checkoutPayload.url) {
          throw new Error(checkoutPayload?.error || 'Unable to start Stripe Checkout.');
        }

        setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
        setFormState((prev) => ({ ...prev, password: '' }));
        setStep(7);
        window.location.assign(checkoutPayload.url);
      } catch (submitError: unknown) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'Unable to create your workspace. Please try again.',
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    setStep((prev) => Math.min(7, prev + 1) as Step);
  };

  const previousStep = () => {
    setError('');
    setOtpError('');
    setStep((prev) => Math.max(1, prev - 1) as Step);
  };

  const handleBlur = (field: keyof SignupState) => {
    if (step === 1) validateStep1();
    if (step === 3) validateCompanyStep();
    if (field === 'termsAccepted' && !formState.termsAccepted) {
      setFieldErrors((prev) => ({
        ...prev,
        termsAccepted: 'You must accept the terms to continue.',
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-3 py-6 sm:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[480px] items-center justify-center">
        <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-[var(--text-primary)] shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] text-3xl font-bold text-white">
              B
            </div>
            <p className="text-xs font-semibold tracking-[0.24em] text-[var(--text-muted)]">
              BIZOSTO
            </p>
          </div>

          {step !== 7 ? (
            <>
              <div className="mb-5">
                {/* Progress bar */}
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #012167, #6692f9)',
                    }}
                  />
                </div>

                {/* Step indicators with labels */}
                {(() => {
                  const stepLabels = [
                    'Account',
                    'Verify',
                    'Business',
                    'Plan',
                    'Terms',
                    'Payment',
                    'Done',
                  ];
                  return (
                    <div className="mb-4 flex items-start justify-between">
                      {stepLabels.map((label, i) => {
                        const dotStep = i + 1;
                        const isComplete = step > dotStep;
                        const isActive = step === dotStep;
                        return (
                          <div
                            key={label}
                            className="flex flex-col items-center gap-1"
                            style={{ width: '12%' }}
                          >
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
                              style={{
                                background: isComplete
                                  ? 'linear-gradient(135deg, #012167, #6692f9)'
                                  : isActive
                                    ? 'linear-gradient(135deg, #012167, #6692f9)'
                                    : 'rgba(255,255,255,0.15)',
                                color: isComplete || isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                                transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                boxShadow: isActive ? '0 0 0 3px rgba(102,146,249,0.3)' : 'none',
                              }}
                            >
                              {isComplete ? '✓' : dotStep}
                            </span>
                            <span
                              className="text-center text-[9px] font-semibold uppercase tracking-wider transition-all"
                              style={{
                                color: isActive
                                  ? '#6692f9'
                                  : isComplete
                                    ? 'rgba(255,255,255,0.6)'
                                    : 'rgba(255,255,255,0.35)',
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Step counter */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    {step < 7 ? `Step ${step} of 6` : 'Almost there!'}
                  </p>
                  {step < 7 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {step === 1 && '🔐 Secure setup'}
                      {step === 2 && '📬 Check your inbox'}
                      {step === 3 && '🏢 Tell us about you'}
                      {step === 4 && '💳 Pick your plan'}
                      {step === 5 && '✅ Review terms'}
                      {step === 6 && '🔒 Secure checkout'}
                    </p>
                  )}
                </div>

                <h1 className="text-2xl font-semibold">
                  {stepContent[step as Exclude<Step, 7>].title}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {stepContent[step as Exclude<Step, 7>].subtitle}
                </p>
              </div>

              <div className="space-y-4">
                {step === 1 ? (
                  <>
                    <Input
                      label="Full Name"
                      value={formState.fullName}
                      placeholder="Jane Smith"
                      onChange={(value) => setValue('fullName', value)}
                      onBlur={() => handleBlur('fullName')}
                      error={fieldErrors.fullName}
                    />
                    <Input
                      label="Business Email"
                      type="email"
                      value={formState.email}
                      placeholder="jane@company.com"
                      onChange={(value) => setValue('email', value)}
                      onBlur={() => handleBlur('email')}
                      error={fieldErrors.email}
                    />
                    <Input
                      label="Password"
                      type="password"
                      value={formState.password}
                      placeholder="Min. 8 characters"
                      onChange={(value) => setValue('password', value)}
                      onBlur={() => handleBlur('password')}
                      error={fieldErrors.password}
                    />
                    <Input
                      label="Phone"
                      type="tel"
                      value={formState.phone}
                      placeholder="+1 555 123 4567"
                      onChange={(value) => setValue('phone', value)}
                      onBlur={() => handleBlur('phone')}
                      error={fieldErrors.phone}
                    />
                  </>
                ) : null}

                {step === 2 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-muted)]">
                      We sent a 6-digit code to{' '}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {formState.email}
                      </span>
                      . Enter it below to verify your email address.
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">Verification Code</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="000000"
                        value={otpCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setOtpCode(val);
                          setOtpError('');
                        }}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] text-[var(--text-primary)] outline-none focus:border-[var(--erp-blue)]"
                        autoFocus
                        autoComplete="one-time-code"
                      />
                      {otpError ? (
                        <span className="mt-1 block text-xs text-red-600">{otpError}</span>
                      ) : null}
                    </label>

                    <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                      <span>Didn&apos;t receive it?</span>
                      <button
                        type="button"
                        disabled={otpSending || otpResendCooldown > 0}
                        onClick={() => void sendOtp(true)}
                        className="font-semibold text-[var(--erp-blue)] disabled:opacity-50"
                      >
                        {otpSending
                          ? 'Sending…'
                          : otpResendCooldown > 0
                            ? `Resend in ${otpResendCooldown}s`
                            : 'Resend code'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <>
                    <Input
                      label="Company Name"
                      value={formState.companyName}
                      placeholder="Acme Corp"
                      onChange={(value) => setValue('companyName', value)}
                      onBlur={() => handleBlur('companyName')}
                      error={fieldErrors.companyName}
                    />
                    <Select
                      label="Country"
                      value={formState.country}
                      options={COUNTRIES}
                      onChange={(value) => setValue('country', value)}
                      error={fieldErrors.country}
                    />
                    <Select
                      label="Industry"
                      value={formState.industry}
                      options={industries}
                      onChange={(value) => setValue('industry', value)}
                      error={fieldErrors.industry}
                    />
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Team Size</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {teamSizes.map((size) => (
                          <label
                            key={size}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${formState.companySize === size ? 'border-[var(--erp-blue)] bg-[var(--erp-blue)]/10' : 'border-[var(--border-subtle)]'}`}
                          >
                            <input
                              type="radio"
                              name="teamSize"
                              value={size}
                              checked={formState.companySize === size}
                              onChange={(event) => setValue('companySize', event.target.value)}
                            />
                            <span>{size}</span>
                          </label>
                        ))}
                      </div>
                      {fieldErrors.companySize ? (
                        <p className="text-sm text-red-600">{fieldErrors.companySize}</p>
                      ) : null}
                    </fieldset>
                  </>
                ) : null}

                {step === 4 ? (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="mb-4 flex justify-center">
                      <div
                        className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1"
                        role="group"
                        aria-label="Billing cycle"
                      >
                        <button
                          type="button"
                          onClick={() => setBillingCycle('monthly')}
                          aria-pressed={!isAnnual}
                          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${!isAnnual ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                          Monthly
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillingCycle('annual')}
                          aria-pressed={isAnnual}
                          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${isAnnual ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                        >
                          Annual — {ANNUAL_FREE_MONTHS} months free
                        </button>
                      </div>
                    </div>

                    {plans.map((plan) => {
                      const selected = formState.selectedPlan === plan.key;

                      return (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => setValue('selectedPlan', plan.key)}
                          className={`rounded-xl border p-4 text-left transition ${selected ? 'border-[var(--erp-blue)] bg-[var(--erp-blue)]/10 shadow-lg' : 'border-[var(--border-subtle)]'}`}
                          aria-pressed={selected}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold">{plan.name}</p>
                              <p className="mt-1 text-2xl font-bold">
                                ${isAnnual ? PLAN_CATALOG[plan.key].annualPrice : plan.price}
                                <span className="text-sm font-medium text-[var(--text-muted)]">
                                  {isAnnual ? '/yr' : '/mo'}
                                </span>
                              </p>
                            </div>
                            {plan.badge ? (
                              <span className="rounded-full bg-[var(--erp-blue)]/15 px-2 py-1 text-xs font-semibold text-[var(--erp-blue)]">
                                {plan.badge}
                              </span>
                            ) : null}
                          </div>
                          <ul className="mt-3 grid grid-cols-1 gap-1 text-sm text-[var(--text-muted)] sm:grid-cols-2">
                            {plan.features.map((feature) => (
                              <li key={feature}>✓ {feature}</li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {step === 6 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Selected plan
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-lg font-bold">{selectedPlan.name}</span>
                        <span className="text-lg font-bold">${selectedPlan.price}/mo</span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--text-muted)]">
                        No charge until {noChargeUntil}. Cancel anytime.
                      </p>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      Start your 14-day free trial with Stripe Checkout. Your subscription remains
                      in trial status until the trial period ends.
                    </p>
                  </div>
                ) : null}

                {step === 5 ? (
                  <>
                    <div className="max-h-[200px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] p-3 text-sm leading-6 text-[var(--text-muted)] whitespace-pre-line">
                      {buildTermsText(isAnnual)}
                    </div>
                    <label className="flex items-start gap-3 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={formState.termsAccepted}
                        onChange={(event) => setValue('termsAccepted', event.target.checked)}
                        onBlur={() => handleBlur('termsAccepted')}
                        className="mt-0.5"
                      />
                      <span>
                        I have read and agree to the Bizosto Terms of Service. I authorize automatic{' '}
                        {isAnnual ? 'annual' : 'monthly'} billing of my selected plan after my
                        14-day free trial ends.
                      </span>
                    </label>
                    {fieldErrors.termsAccepted ? (
                      <p className="text-sm text-red-600">{fieldErrors.termsAccepted}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={previousStep}
                  disabled={step === 1 || loading}
                  className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void nextStep();
                  }}
                  disabled={loading || (step === 5 && !formState.termsAccepted)}
                  className="rounded-lg bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading
                    ? step === 2
                      ? 'Verifying…'
                      : step === 1
                        ? 'Sending code…'
                        : step === 6
                          ? 'Opening Stripe Checkout…'
                          : 'Creating your workspace…'
                    : step === 6
                      ? 'Start your 14-day free trial'
                      : step === 5
                        ? 'Continue to Payment'
                        : step === 1
                          ? 'Continue & Verify Email'
                          : 'Continue'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
                ✓
              </div>
              <h1 className="text-2xl font-semibold">Your workspace is ready!</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your 14-day free trial is ready. Stripe Checkout is opening for {formState.email}.
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                Trial ends on{' '}
                {new Date(
                  trialEndsAt || Date.now() + 14 * 24 * 60 * 60 * 1000,
                ).toLocaleDateString()}
              </p>
              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                onClick={() => {
                  router.push('/dashboard');
                }}
                className="mt-6 w-full rounded-lg bg-[linear-gradient(180deg,#012167_0%,#6692f9_100%)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Go to Dashboard
              </button>
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                If you are not redirected, you can{' '}
                <Link href="/login" className="underline">
                  sign in manually
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: 'linear-gradient(180deg,#012167 0%,#6692f9 100%)' }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}

function Input({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  type?: 'text' | 'email' | 'password' | 'tel';
}) {
  const [showPassword, setShowPassword] = useState(false);
  const resolvedType = type === 'password' && showPassword ? 'text' : type;

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
        {type === 'password' ? (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[var(--text-muted)]"
          >
            {showPassword ? 'Hide' : 'Show'}
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
