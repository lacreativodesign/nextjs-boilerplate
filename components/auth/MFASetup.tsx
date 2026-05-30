"use client";

import { OptimizedImage } from "@/components/OptimizedImage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { enrollMFA, verifyMFAEnrollment } from "@/lib/auth/mfa";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebaseClient";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

const CODE_LENGTH = 6;

type Props = {
  onComplete: () => void;
  onCancel: () => void;
};

export default function MFASetup({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<"idle" | "setup" | "success">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => Array.from({ length: CODE_LENGTH }, (_, i) => code[i] || ""), [code]);

  const handleEnroll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be signed in to enable MFA.");
      }
      const enrollment = await enrollMFA(user);
      setSecret(enrollment.secret);
      setQrCodeUrl(enrollment.qrCodeUrl);
      setStep("setup");
    } catch (err) {
      setError((err instanceof Error ? err.message : undefined) || "Unable to start MFA enrollment.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleVerify = useCallback(async () => {
    if (code.length !== CODE_LENGTH || loading) return;
    try {
      setError(null);
      setLoading(true);
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be signed in to enable MFA.");
      }
      const ok = await verifyMFAEnrollment(user, code);
      if (!ok) {
        throw new Error("Invalid verification code. Please try again.");
      }

      const db = await getFirebaseDb();
      await updateDoc(doc(db, "users", user.uid), {
        mfaEnabled: true,
        mfaUpdatedAt: serverTimestamp(),
      });

      setStep("success");
      onComplete();
    } catch (err) {
      setError((err instanceof Error ? err.message : undefined) || "Failed to verify MFA code.");
    } finally {
      setLoading(false);
    }
  }, [code, loading, onComplete]);

  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading) {
      void handleVerify();
    }
  }, [code, handleVerify, loading]);

  const handleCodeChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, "");
    const next = code.split("");

    if (sanitized.length === 0) {
      next[index] = "";
      setCode(next.join(""));
      return;
    }

    const char = sanitized[sanitized.length - 1];
    next[index] = char;
    setCode(next.join("").slice(0, CODE_LENGTH));

    if (index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setCode(pasted);
    const lastIndex = Math.min(pasted.length - 1, CODE_LENGTH - 1);
    inputsRef.current[lastIndex]?.focus();
  };

  const renderCodeInputs = () => (
    <div className="flex items-center gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(event) => handleCodeChange(index, event.target.value)}
          onPaste={handlePaste}
          className="h-12 w-10 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/40 text-center text-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {step === "idle" && (
        <button type="button" className="btn" onClick={handleEnroll} disabled={loading}>
          {loading ? "Preparing…" : "Enable Two-Factor Authentication"}
        </button>
      )}

      {step === "setup" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)]/40 p-4">
            <p className="text-sm font-medium text-[var(--text-primary)]">Scan the QR code</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Use Google Authenticator, Authy, or any compatible app.
            </p>
            {qrCodeUrl ? (
              <OptimizedImage
                src={qrCodeUrl}
                alt="MFA QR code"
                width={160}
                height={160}
                className="mt-4 h-40 w-40 rounded-lg bg-white p-2"
                sizes="160px"
                blurDataURL={qrCodeUrl}
              />
            ) : null}
            <button
              type="button"
              className="mt-4 text-xs font-medium text-indigo-500 hover:text-indigo-400"
              onClick={() => setManualVisible((prev) => !prev)}
            >
              Can&apos;t scan QR code?
            </button>
            {manualVisible && secret ? (
              <div className="mt-2 rounded-lg border border-dashed border-[var(--surface-border)] p-3 text-xs text-[var(--text-muted)]">
                Manual key: <span className="font-mono text-[var(--text-primary)]">{secret}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">Enter the 6-digit code</p>
            {renderCodeInputs()}
            <button
              type="button"
              className="btn mt-3"
              onClick={handleVerify}
              disabled={loading || code.length !== CODE_LENGTH}
            >
              {loading ? "Verifying…" : "Verify & Enable"}
            </button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <p>Two-factor authentication is now enabled for your account.</p>
          <p className="mt-2 text-xs text-emerald-100/80">
            Backup codes can be issued by your administrator if you lose access to your authenticator app.
          </p>
        </div>
      )}

      {error ? <div className="text-sm text-red-500">{error}</div> : null}

      <div className="flex items-center gap-3">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
