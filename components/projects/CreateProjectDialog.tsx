"use client";

import { FormEvent, useState } from "react";

export function CreateProjectDialog({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("internal");
  const [startDate, setStartDate] = useState("");
  const [billable, setBillable] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          startDate,
          teamMemberIds: [],
          billable,
        }),
      });
      setOpen(false);
      setName("");
      setCategory("internal");
      setStartDate("");
      setBillable(false);
      await onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => setOpen(true)}>
        Create Project
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <form className="w-full max-w-lg rounded bg-white p-6 shadow" onSubmit={handleSubmit}>
            <h2 className="mb-4 text-lg font-semibold">Create Project</h2>
            <div className="space-y-4">
              <input
                required
                className="w-full rounded border px-3 py-2"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select className="w-full rounded border px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
                {["internal", "client_project", "product_development", "marketing", "sales", "operations", "other"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <input
                required
                type="date"
                className="w-full rounded border px-3 py-2"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded border px-4 py-2" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60">
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
