"use client";

import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [showForgot, setShowForgot] = useState(false);

  return (
    <div
      className={
        mode === "light"
          ? "min-h-screen bg-gray-100 text-black flex items-center justify-center p-6"
          : "min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6"
      }
    >
      {/* Toggle */}
      <button
        onClick={() => setMode(mode === "light" ? "dark" : "light")}
        className="absolute top-5 right-5 text-sm opacity-70 hover:opacity-100"
      >
        {mode === "light" ? "Dark" : "Light"} Mode
      </button>

      {/* Card */}
      <div
        className={`w-full max-w-md rounded-2xl p-8 border
        ${
          mode === "light"
            ? "bg-white/70 backdrop-blur-xl border-gray-300 shadow-xl"
            : "bg-white/5 backdrop-blur-xl border-white/10"
        }`}
      >
        <h1 className="text-3xl font-black tracking-tight">LA CREATIVO</h1>
        <p className="mt-1 text-sm opacity-70">Unified Portal • 2025 Edition</p>

        {/* LOGIN VIEW */}
        {!showForgot && (
          <form className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full mt-1 p-3 rounded-lg border border-gray-300 bg-white/80
                focus:outline-none focus:ring-2 focus:ring-black text-gray-800"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                className="w-full mt-1 p-3 rounded-lg border border-gray-300 bg-white/80
                focus:outline-none focus:ring-2 focus:ring-black text-gray-800"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-black text-white font-medium hover:bg-gray-700 transition"
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="block text-sm mx-auto opacity-70 hover:opacity-100"
            >
              Forgot Password?
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {showForgot && (
          <form className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-medium">Enter Your Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full mt-1 p-3 rounded-lg border border-gray-300 bg-white/80
                focus:outline-none focus:ring-2 focus:ring-black text-gray-800"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-black text-white font-medium hover:bg-gray-700 transition"
            >
              Send Reset Link
            </button>

            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="block text-sm mx-auto opacity-70 hover:opacity-100"
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
