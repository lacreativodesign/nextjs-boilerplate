"use client";

import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Get Started with Bizosto</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Contact our team to set up your workspace.
          </p>
        </div>
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Bizosto ERP is set up by our onboarding team to ensure your workspace is configured correctly for your business.
          </p>
          <a
            href="https://www.bizosto.com/book-demo"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
          >
            Book a Demo
          </a>
          <div className="pt-2">
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
