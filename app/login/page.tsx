"use client";

import React, { useState } from "react";

export default function LoginPage() {
  const [view, setView] = useState<"login" | "forgot">("login");

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black p-6"
    >
      <div
        className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20 text-white"
      >
        {/* Dark/Light Toggle Placeholder */}
        <div className="flex justify-end mb-6">
          <div className="flex items-center gap-2 text-gray-300 text-sm">
            <span>Light</span>
            <div className="w-12 h-6 bg-gray-700 rounded-full flex items-center px-1 cursor-pointer">
              <div className="w-5 h-5 bg-white rounded-full shadow"></div>
            </div>
            <span>Dark</span>
          </div>
        </div>

        {/* LOGIN VIEW */}
        {view === "login" && (
          <>
            <h1 className="text-3xl font-bold mb-2 text-center">
              LA CREATIVO
            </h1>
            <p className="text-center text-gray-300 mb-8">
              Unified Portal • 2025 Edition
            </p>

            <label className="block mb-4">
              <span className="text-sm text-gray-300">Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full mt-1 p-3 rounded-lg bg-black/30 border border-white/20 text-white outline-none focus:border-teal-400"
              />
            </label>

            <label className="block mb-6">
              <span className="text-sm text-gray-300">Password</span>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full mt-1 p-3 rounded-lg bg-black/30 border border-white/20 text-white outline-none focus:border-teal-400"
              />
            </label>

            <button
              className="w-full p-3 rounded-lg bg-teal-500 hover:bg-teal-600 text-black font-semibold transition"
            >
              Login
            </button>

            <p
              className="text-center text-sm text-gray-400 mt-4 cursor-pointer hover:text-teal-300"
              onClick={() => setView("forgot")}
            >
              Forgot Password?
            </p>
          </>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === "forgot" && (
          <>
            <h2 className="text-2xl font-bold mb-2 text-center">
              Reset Password
            </h2>
            <p className="text-center text-gray-300 mb-6">
              Enter your email and we’ll send you reset instructions.
            </p>

            <label className="block mb-6">
              <span className="text-sm text-gray-300">Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full mt-1 p-3 rounded-lg bg-black/30 border border-white/20 text-white outline-none focus:border-teal-400"
              />
            </label>

            <button
              className="w-full p-3 rounded-lg bg-teal-500 hover:bg-teal-600 text-black font-semibold transition"
            >
              Send Reset Link
            </button>

            <p
              className="text-center text-sm text-gray-400 mt-4 cursor-pointer hover:text-teal-300"
              onClick={() => setView("login")}
            >
              Back to Login
            </p>
          </>
        )}
      </div>
    </div>
  );
}
