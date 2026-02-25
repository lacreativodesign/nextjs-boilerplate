"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onDone: () => void;
  duration?: number;
};

export default function BizostoSplash({ onDone, duration = 1500 }: Props) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const exitTimer = setTimeout(() => setLeaving(true), duration - 300);
    const doneTimer = setTimeout(() => onDone(), duration);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [duration, onDone]);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes biz-enter {
          0%   { opacity: 0; transform: scale(0.65); }
          65%  { opacity: 1; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes biz-pulse {
          0%, 100% { box-shadow: 0 0 0 0px rgba(37,99,235,0.55); }
          50%       { box-shadow: 0 0 0 18px rgba(37,99,235,0); }
        }
        @keyframes biz-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
          40%            { opacity: 1;    transform: scale(1); }
        }
        @keyframes biz-overlay-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes biz-overlay-out { from { opacity: 1; } to { opacity: 0; } }
        .biz-overlay {
          position: fixed; inset: 0; z-index: 99999;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 28px;
          background: var(--app-bg, #f5f6f8);
          animation: biz-overlay-in 0.2s ease forwards;
        }
        .biz-overlay.leaving { animation: biz-overlay-out 0.3s ease forwards; }
        .biz-logo {
          width: 88px; height: 88px; border-radius: 20px;
          background: linear-gradient(135deg, #1e3a8a 0%, var(--erp-blue, #2563eb) 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-weight: 900; font-size: 56px; color: #ffffff; user-select: none;
          animation:
            biz-enter 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both,
            biz-pulse 1.8s ease-in-out 0.6s infinite;
        }
        .biz-name {
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 700; font-size: 15px; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--text-muted, #64748b);
          opacity: 0; animation: biz-overlay-in 0.3s ease 0.5s forwards;
        }
        .biz-dots {
          display: flex; gap: 7px;
          opacity: 0; animation: biz-overlay-in 0.3s ease 0.6s forwards;
        }
        .biz-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--erp-blue, #2563eb);
        }
        .biz-dot:nth-child(1) { animation: biz-dot 1.1s ease-in-out 0.7s infinite; }
        .biz-dot:nth-child(2) { animation: biz-dot 1.1s ease-in-out 0.9s infinite; }
        .biz-dot:nth-child(3) { animation: biz-dot 1.1s ease-in-out 1.1s infinite; }
      `}</style>
      <div className={`biz-overlay${leaving ? " leaving" : ""}`}>
        <div className="biz-logo">B</div>
        <span className="biz-name">Bizosto</span>
        <div className="biz-dots">
          <div className="biz-dot" />
          <div className="biz-dot" />
          <div className="biz-dot" />
        </div>
      </div>
    </>,
    document.body
  );
}
