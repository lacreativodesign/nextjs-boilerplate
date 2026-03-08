"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CODE_LENGTH = 6;

type Props = {
  onVerify: (code: string) => Promise<void>;
  onCancel?: () => void;
};

export default function MFAVerify({ onVerify, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => Array.from({ length: CODE_LENGTH }, (_, i) => code[i] || ""), [code]);

  const handleVerify = useCallback(async () => {
    if (code.length !== CODE_LENGTH || loading) return;
    try {
      setLoading(true);
      setError(null);
      await onVerify(code);
    } catch (err: any) {
      setError(err?.message || "Invalid verification code.");
      setLoading(false);
    }
  }, [code, loading, onVerify]);

  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading) {
      void handleVerify();
    }
  }, [code, handleVerify, loading]);

  const handleChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, "");
    const next = code.split("");

    if (!sanitized) {
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Two-factor verification</h3>
        <p className="text-sm text-[var(--text-muted)]">Enter the 6-digit code from your authenticator app.</p>
      </div>

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
            onChange={(event) => handleChange(index, event.target.value)}
            onPaste={handlePaste}
            className="h-12 w-10 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/40 text-center text-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        ))}
      </div>

      {error ? <div className="text-sm text-red-500">{error}</div> : null}

      <div className="flex items-center gap-3">
        <button type="button" className="btn" onClick={handleVerify} disabled={loading || code.length !== CODE_LENGTH}>
          {loading ? "Verifying…" : "Verify"}
        </button>
        {onCancel ? (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        ) : null}
      </div>

      <button type="button" className="text-xs text-indigo-500 hover:text-indigo-400">
        Use backup code
      </button>
    </div>
  );
}
