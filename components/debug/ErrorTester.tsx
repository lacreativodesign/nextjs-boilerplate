"use client";

import { useState } from "react";

export function ErrorTester() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  if (shouldThrow) {
    throw new Error("Test error from ErrorTester component");
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-yellow-100 p-4 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-yellow-900">Dev Tools: Test Error Boundary</p>
      <button
        onClick={() => setShouldThrow(true)}
        className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
      >
        Trigger Error
      </button>
    </div>
  );
}
