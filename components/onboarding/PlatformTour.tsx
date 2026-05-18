'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const TOUR_COMPLETED_STORAGE_KEY = 'bizosto_tour_complete';

type TourStepPosition = 'center' | 'right' | 'top';

type TourStep = {
  title: string;
  description: string;
  target: string | null;
  position: TourStepPosition;
  cta?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Bizosto! 👋',
    description:
      "You're now set up as {role} on {companyName}. Let's show you around in 60 seconds.",
    target: null,
    position: 'center',
  },
  {
    title: 'Your Dashboard',
    description:
      'This is your command center. See live KPIs, recent activity, and AI summaries here.',
    target: '#sidebar-dashboard',
    position: 'right',
  },
  {
    title: 'Navigation Sidebar',
    description: 'Access every module from here. Modules shown depend on your plan and role.',
    target: '#main-sidebar',
    position: 'right',
  },
  {
    title: 'AI Business Summary',
    description:
      'Click Generate to get a plain-English summary of your business health, powered by AI.',
    target: '#ai-summary-widget',
    position: 'top',
  },
  {
    title: "You're all set! 🚀",
    description:
      'Explore freely. Click any section in the sidebar to get started. Need help? Visit the Help Center.',
    target: null,
    position: 'center',
    cta: 'Start Exploring',
  },
];

type PlatformTourProps = {
  role: string;
  companyName: string;
  onClose?: () => void;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type CardPosition = {
  top: number;
  left: number;
  transform?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatPlaceholder(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

function calculateCardPosition(
  rect: HighlightRect | null,
  position: TourStepPosition,
): CardPosition {
  const cardWidth = Math.min(384, window.innerWidth - 32);
  const cardHeightEstimate = 280;
  const margin = 16;

  if (!rect || position === 'center') {
    return {
      top: window.innerHeight / 2,
      left: window.innerWidth / 2,
      transform: 'translate(-50%, -50%)',
    };
  }

  if (position === 'top') {
    const preferredTop = rect.top - cardHeightEstimate - margin;
    const top = preferredTop >= margin ? preferredTop : rect.top + rect.height + margin;
    return {
      top: clamp(top, margin, window.innerHeight - cardHeightEstimate - margin),
      left: clamp(
        rect.left + rect.width / 2 - cardWidth / 2,
        margin,
        window.innerWidth - cardWidth - margin,
      ),
    };
  }

  const preferredLeft = rect.left + rect.width + margin;
  const left =
    preferredLeft + cardWidth <= window.innerWidth - margin
      ? preferredLeft
      : rect.left - cardWidth - margin;

  return {
    top: clamp(
      rect.top + rect.height / 2 - cardHeightEstimate / 2,
      margin,
      window.innerHeight - cardHeightEstimate - margin,
    ),
    left: clamp(left, margin, window.innerWidth - cardWidth - margin),
  };
}

export function PlatformTour({ role, companyName, onClose }: PlatformTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;

  const description = useMemo(
    () =>
      currentStep.description
        .replace('{role}', formatPlaceholder(role, 'a team member'))
        .replace('{companyName}', formatPlaceholder(companyName, 'your workspace')),
    [companyName, currentStep.description, role],
  );

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, 'true');
    onClose?.();
  }, [onClose]);

  const updateTargetPosition = useCallback(() => {
    if (!currentStep.target) {
      setHighlightRect(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(currentStep.target);
    if (!target) {
      setHighlightRect(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 8;
    setHighlightRect({
      top: Math.max(rect.top - padding, 8),
      left: Math.max(rect.left - padding, 8),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [currentStep.target]);

  useEffect(() => {
    if (!currentStep.target) {
      setHighlightRect(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(currentStep.target);
    target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

    const frameId = window.requestAnimationFrame(updateTargetPosition);
    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition, true);
    };
  }, [currentStep.target, updateTargetPosition]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const cardPosition = calculateCardPosition(highlightRect, currentStep.position);

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platform-tour-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {highlightRect && (
        <div
          className="pointer-events-none fixed rounded-2xl border-4 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.18),0_0_32px_rgba(103,232,249,0.95)] platform-tour-highlight"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
          aria-hidden="true"
        />
      )}

      <section
        className="fixed w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-white/20 bg-white p-6 text-slate-950 shadow-2xl"
        style={cardPosition}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
            {currentStepIndex + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={completeTour}
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
          >
            Skip
          </button>
        </div>

        <h2 id="platform-tour-title" className="text-2xl font-bold tracking-tight text-slate-950">
          {currentStep.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCurrentStepIndex((step) => Math.max(step - 1, 0))}
            disabled={isFirstStep}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                completeTour();
                return;
              }
              setCurrentStepIndex((step) => Math.min(step + 1, TOUR_STEPS.length - 1));
            }}
            className="rounded-xl bg-[var(--erp-blue)] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:opacity-90"
          >
            {isLastStep ? (currentStep.cta ?? 'Finish') : 'Next'}
          </button>
        </div>
      </section>

      <style>{`
        @keyframes platformTourPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.015); opacity: 0.72; }
        }

        .platform-tour-highlight {
          animation: platformTourPulse 1.25s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export { TOUR_COMPLETED_STORAGE_KEY };
