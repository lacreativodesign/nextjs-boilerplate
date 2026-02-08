import {
  TotpMultiFactorGenerator,
  multiFactor,
  type MultiFactorResolver,
  type TotpSecret,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";

const enrollmentSecrets = new Map<string, TotpSecret>();

function getEnrollmentSecret(uid: string) {
  return enrollmentSecrets.get(uid);
}

export async function enrollMFA(user: FirebaseUser): Promise<{ secret: string; qrCodeUrl: string }> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const accountName = user.email || user.uid;
  const qrCodeUrl = secret.generateQrCodeUrl(accountName, "Bizosto");

  enrollmentSecrets.set(user.uid, secret);

  return {
    secret: secret.secretKey,
    qrCodeUrl,
  };
}

export async function verifyMFAEnrollment(user: FirebaseUser, verificationCode: string): Promise<boolean> {
  try {
    const secret = getEnrollmentSecret(user.uid);
    if (!secret) {
      return false;
    }

    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode);
    await multiFactor(user).enroll(assertion, "Authenticator app");
    enrollmentSecrets.delete(user.uid);
    return true;
  } catch (error) {
    console.error("MFA enrollment verification failed", error);
    return false;
  }
}

export async function verifyMFASignIn(
  resolver: MultiFactorResolver,
  verificationCode: string
): Promise<UserCredential> {
  const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) {
    throw new Error("No TOTP MFA enrollment available for this account.");
  }

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, verificationCode);
  return resolver.resolveSignIn(assertion);
}

export function isMFAEnabled(user: FirebaseUser): boolean {
  return multiFactor(user).enrolledFactors.length > 0;
}

export async function unenrollMFA(user: FirebaseUser): Promise<void> {
  const factors = multiFactor(user).enrolledFactors;
  if (!factors.length) return;

  for (const factor of factors) {
    await multiFactor(user).unenroll(factor);
  }
}
