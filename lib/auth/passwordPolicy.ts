import { changePasswordSchema } from '@/lib/validations/user';

export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  maxAge: 90,
  historyCount: 5,
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  'qwerty',
  'qwerty123',
  'admin123',
  'letmein',
  'welcome',
  'iloveyou',
  'abc123',
  '11111111',
]);

export function validatePasswordStrength(
  password: string,
  userInfo?: { email?: string; name?: string },
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = password || '';

  if (trimmed.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters.`);
  }

  if (trimmed.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must be at most ${PASSWORD_POLICY.maxLength} characters.`);
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(trimmed)) {
    errors.push('Password must include at least one uppercase letter.');
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(trimmed)) {
    errors.push('Password must include at least one lowercase letter.');
  }

  if (PASSWORD_POLICY.requireNumber && !/\d/.test(trimmed)) {
    errors.push('Password must include at least one number.');
  }

  if (PASSWORD_POLICY.requireSpecialChar && !/[^A-Za-z\d]/.test(trimmed)) {
    errors.push('Password must include at least one special character.');
  }

  if (PASSWORD_POLICY.preventCommonPasswords) {
    const lowered = trimmed.toLowerCase();
    if (COMMON_PASSWORDS.has(lowered)) {
      errors.push('Password is too common. Choose a more unique password.');
    }
  }

  if (PASSWORD_POLICY.preventUserInfoInPassword) {
    const lowered = trimmed.toLowerCase();
    const email = userInfo?.email?.toLowerCase() || '';
    const emailName = email.split('@')[0] || '';
    const nameFragments = (userInfo?.name || '')
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3);

    if (emailName && lowered.includes(emailName)) {
      errors.push('Password cannot include your email name.');
    }

    if (nameFragments.some((fragment) => lowered.includes(fragment))) {
      errors.push('Password cannot include your name.');
    }
  }

  const schemaCheck =
    (changePasswordSchema as any)._def?.schema?.shape?.newPassword?.safeParse(trimmed) ??
    (changePasswordSchema as any)?.sourceType?.()?.shape?.newPassword?.safeParse(trimmed);
  if (schemaCheck && !schemaCheck.success && schemaCheck.error?.issues?.length) {
    const existing = new Set(errors);
    (schemaCheck.error.issues as Array<{ message: string }>).forEach((issue) => {
      if (!existing.has(issue.message)) {
        errors.push(issue.message);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function isPasswordExpired(lastPasswordChange: Date, role: string): boolean {
  const normalizedRole = (role || '').toLowerCase();
  if (normalizedRole === 'client') return false;

  const privilegedRoles = new Set(['admin', 'super_admin', 'finance']);
  const maxAgeDays = privilegedRoles.has(normalizedRole) ? PASSWORD_POLICY.maxAge : 180;

  const lastChange = lastPasswordChange?.getTime?.() ? lastPasswordChange.getTime() : 0;
  if (!lastChange) return true;

  const ageMs = Date.now() - lastChange;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs > maxAgeMs;
}

export function getPasswordStrengthScore(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong';
} {
  const value = password || '';
  const checks = [
    value.length >= PASSWORD_POLICY.minLength,
    value.length >= 12,
    /[A-Z]/.test(value),
    /[a-z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z\d]/.test(value),
  ];

  const raw = checks.filter(Boolean).length;
  const score = Math.min(4, Math.max(0, Math.round((raw / checks.length) * 4))) as
    | 0
    | 1
    | 2
    | 3
    | 4;

  const labelMap: Record<typeof score, 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong'> = {
    0: 'Weak',
    1: 'Fair',
    2: 'Good',
    3: 'Strong',
    4: 'Very Strong',
  };

  return { score, label: labelMap[score] };
}
