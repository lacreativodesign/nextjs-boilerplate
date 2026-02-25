"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  onDone: () => void;
  duration?: number;
};

export default function BizostoSplash({ onDone, duration = 2000 }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const doneTimer = setTimeout(() => onDone(), duration);
    return () => clearTimeout(doneTimer);
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
          50%       { box-shadow: 0 0 0 20px rgba(37,99,235,0); }
        }
        @keyframes biz-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
          40%            { opacity: 1;    transform: scale(1); }
        }
        @keyframes biz-in { from { opacity: 0; } to { opacity: 1; } }

        .biz-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          background:
            radial-gradient(1400px circle at 10% 15%, #ffffff 0%, #eef2ff 38%, transparent 70%),
            linear-gradient(135deg, #f4f6fb, #dde6f6);
          animation: biz-in 0.25s ease forwards;
        }
        @media (prefers-color-scheme: dark) {
          .biz-overlay {
            background:
              radial-gradient(1200px circle at 18% 22%, rgba(255,255,255,0.035) 0%, transparent 55%),
              linear-gradient(135deg, #1b1d20, #101215);
          }
        }
        .biz-logo {
          width: 88px;
          height: 88px;
          border-radius: 20px;
          background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-weight: 900;
          font-size: 56px;
          color: #ffffff;
          user-select: none;
          animation:
            biz-enter 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both,
            biz-pulse 1.8s ease-in-out 0.6s infinite;
        }
        .biz-name {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #475569;
          opacity: 0;
          animation: biz-in 0.3s ease 0.5s forwards;
        }
        @media (prefers-color-scheme: dark) {
          .biz-name { color: #a6adb7; }
        }
        .biz-dots {
          display: flex;
          gap: 7px;
          opacity: 0;
          animation: biz-in 0.3s ease 0.65s forwards;
        }
        .biz-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #2563eb;
        }
        .biz-dot:nth-child(1) { animation: biz-dot 1.1s ease-in-out 0.8s  infinite; }
        .biz-dot:nth-child(2) { animation: biz-dot 1.1s ease-in-out 1.0s  infinite; }
        .biz-dot:nth-child(3) { animation: biz-dot 1.1s ease-in-out 1.2s  infinite; }
      `}</style>

      <div className="biz-overlay">
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
