'use client';

import {
  PASSWORD_POLICY,
  getPasswordStrengthScore,
  validatePasswordStrength,
} from '@/lib/auth/passwordPolicy';

type Props = {
  password: string;
  showRequirements?: boolean;
};

const REQUIREMENTS = [
  {
    id: 'minLength',
    label: `At least ${PASSWORD_POLICY.minLength} characters`,
    test: (value: string) => value.length >= PASSWORD_POLICY.minLength,
  },
  { id: 'uppercase', label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'lowercase', label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value: string) => /\d/.test(value) },
  {
    id: 'special',
    label: 'One special character',
    test: (value: string) => /[^A-Za-z\d]/.test(value),
  },
];

export default function PasswordStrengthMeter({ password, showRequirements = true }: Props) {
  const { score, label } = getPasswordStrengthScore(password);
  const { errors } = validatePasswordStrength(password);

  const barColor =
    score <= 1
      ? 'bg-red-500'
      : score === 2
        ? 'bg-orange-400'
        : score === 3
          ? 'bg-yellow-400'
          : 'bg-emerald-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-muted)]">Password strength</span>
        <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      </div>

      <div className="h-2 w-full rounded-full bg-[var(--surface-muted)]/60 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${(score + 1) * 20}%` }}
        />
      </div>

      {showRequirements ? (
        <ul className="space-y-1 text-xs text-[var(--text-muted)]">
          {REQUIREMENTS.map((item) => {
            const passed = item.test(password);
            return (
              <li key={item.id} className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${passed ? 'bg-emerald-500' : 'bg-red-400'}`}
                />
                <span className={passed ? 'text-[var(--text-primary)]' : undefined}>
                  {item.label}
                </span>
              </li>
            );
          })}
          {errors.length > 0 && <li className="text-red-500">{errors[0]}</li>}
        </ul>
      ) : null}
    </div>
  );
}
