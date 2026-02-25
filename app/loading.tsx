export default function Loading() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');

        @keyframes biz-enter {
          0%   { opacity: 0; transform: scale(0.6); }
          65%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes biz-pulse {
          0%, 100% { box-shadow: 0 0 0 0px rgba(59,130,246,0.6); }
          50%       { box-shadow: 0 0 0 20px rgba(59,130,246,0); }
        }
        @keyframes biz-dots {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1); }
        }
        .biz-wrap {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 32px;
          background: #0f172a;
          z-index: 9999;
        }
        .biz-logo {
          width: 96px;
          height: 96px;
          border-radius: 22px;
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          font-weight: 900;
          font-size: 62px;
          color: white;
          user-select: none;
          animation:
            biz-enter 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
            biz-pulse 2s ease-in-out 0.55s infinite;
        }
        .biz-dots {
          display: flex;
          gap: 8px;
          opacity: 0;
          animation: biz-enter 0.3s ease 0.4s forwards;
        }
        .biz-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #3b82f6;
        }
        .biz-dot:nth-child(1) { animation: biz-dots 1.2s ease-in-out 0.7s infinite; }
        .biz-dot:nth-child(2) { animation: biz-dots 1.2s ease-in-out 0.9s infinite; }
        .biz-dot:nth-child(3) { animation: biz-dots 1.2s ease-in-out 1.1s infinite; }
      `}</style>

      <div className="biz-wrap">
        <div className="biz-logo">B</div>
        <div className="biz-dots">
          <div className="biz-dot" />
          <div className="biz-dot" />
          <div className="biz-dot" />
        </div>
      </div>
    </>
  );
}
