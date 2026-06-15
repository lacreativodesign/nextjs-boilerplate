"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, ArrowRight, Users, Briefcase, FileText, User } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

type Step = {
  id: "profile" | "team" | "client" | "invoice";
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  completed: boolean;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([
    {
      id: "profile",
      title: "Complete your profile",
      description: "Add your name, role, and company details so your team knows who you are.",
      href: "/settings",
      icon: User,
      completed: false,
    },
    {
      id: "team",
      title: "Invite your team",
      description: "Add team members and assign them roles to start collaborating.",
      href: "/users",
      icon: Users,
      completed: false,
    },
    {
      id: "client",
      title: "Add your first client",
      description: "Create a client record to manage relationships and projects.",
      href: "/clients",
      icon: Briefcase,
      completed: false,
    },
    {
      id: "invoice",
      title: "Create your first invoice",
      description: "Send a professional invoice to get paid faster.",
      href: "/finance/invoices",
      icon: FileText,
      completed: false,
    },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/onboarding/progress")
      .then((r) => r.json())
      .then((data) => {
        if (data?.steps) {
          setSteps((prev) =>
            prev.map((step) => ({
              ...step,
              completed: data.steps.find((s: { id: string; completed: boolean }) => s.id === step.id)?.completed ?? false,
            }))
          );
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const completed = steps.filter((s) => s.completed).length;
  const total = steps.length;
  const progress = Math.round((completed / total) * 100);
  const allDone = completed === total;

  const markComplete = async (id: string) => {
    await apiFetch("/api/onboarding/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId: id }),
    });
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: true } : s))
    );
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--app-bg)" }}
    >
      {/* Header bar */}
      <div
        style={{
          background: "linear-gradient(135deg, #012167, #6692f9)",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.08em",
            color: "#ffffff",
          }}
        >
          BIZOSTO
        </span>
        <button
          onClick={() => router.push("/dashboard")}
          className="btn ghost"
          style={{ color: "#ffffff", borderColor: "rgba(255,255,255,0.3)", fontSize: 13 }}
        >
          Skip for now
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Welcome */}
        <div className="mb-8 text-center">
          <h1 className="page-title">Welcome to Bizosto 🎉</h1>
          <p className="page-subtitle mt-2">
            Complete these steps to get the most out of your workspace.
          </p>
        </div>

        {/* Progress bar */}
        <div className="card mb-8 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {completed} of {total} steps completed
            </span>
            <span className="text-sm font-bold text-[var(--erp-blue)]">
              {progress}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #012167, #6692f9)",
              }}
            />
          </div>
          {allDone && (
            <p className="mt-3 text-center text-sm font-semibold text-emerald-600">
              🎉 All done! Your workspace is ready.
            </p>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`card p-5 transition-all ${
                  step.completed ? "opacity-60" : "hover:border-[var(--erp-blue)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: step.completed
                        ? "var(--surface-muted)"
                        : "linear-gradient(135deg, #012167, #6692f9)",
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: step.completed ? "var(--text-muted)" : "#ffffff" }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--text-soft)]">
                        Step {index + 1}
                      </span>
                      {step.completed && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <h3 className="mt-0.5 font-semibold text-[var(--text-primary)]">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {step.description}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {!step.completed && (
                      <button
                        onClick={() => markComplete(step.id)}
                        className="text-xs text-[var(--text-soft)] hover:text-[var(--erp-blue)] transition-colors"
                      >
                        Mark done
                      </button>
                    )}
                    {step.completed ? (
                      <CheckCircle className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <button
                        onClick={() => router.push(step.href)}
                        className="btn"
                        style={{ padding: "8px 14px", fontSize: 13 }}
                      >
                        Start <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Go to dashboard */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="btn ghost"
          >
            Go to Dashboard →
          </button>
          <p className="helper-text mt-3">
            You can always complete these steps later from the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
