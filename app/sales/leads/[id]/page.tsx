"use client";

import React, { useState } from "react";

type LeadStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

const statusOptions: LeadStatus[] = [
  "New", "Contacted", "Qualified", "Proposal Sent",
  "Negotiation", "Closed Won", "Closed Lost",
];

const mockLead = {
  id: "LD-001",
  fullName: "John Matthews",
  email: "john.m@example.com",
  phone: "+1 443-221-9954",
  service: "Website Design",
  assignedTo: "Zain Ahmed",
  createdOn: "2025-11-16T14:00:00.000Z",
  status: "New" as LeadStatus,
  source: "Website Form",
};

const initialNotes = [
  {
    id: "n1",
    author: "Zain Ahmed",
    role: "Sales Executive",
    message: "Initial call done. Lead seems interested.",
    time: "2025-11-16 14:33",
    sender: "me",
  },
  {
    id: "n2",
    author: "System",
    role: "",
    message: "Lead created and assigned.",
    time: "2025-11-16 14:00",
    sender: "system",
  },
];

export default function LeadDetailPage() {
  const [lead, setLead] = useState(mockLead);
  const [notes, setNotes] = useState(initialNotes);
  const [noteInput, setNoteInput] = useState("");

  function addNote() {
    if (!noteInput.trim()) return;
    const newNote = {
      id: Math.random().toString(),
      author: "You",
      role: "Sales Executive",
      message: noteInput,
      time: new Date().toLocaleString(),
      sender: "me",
    };
    setNotes([newNote, ...notes]);
    setNoteInput("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">

        {/* TITLE + META */}
        <div>
          <h1 className="page-title">{lead.fullName}</h1>
          <p className="page-subtitle">
            Lead ID: {lead.id} · Created:{" "}
            {new Date(lead.createdOn).toLocaleDateString()}
          </p>
        </div>

        {/* LEAD SUMMARY PANEL */}
        <div className="card p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Contact Details</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{lead.fullName}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{lead.email}</p>
              <p className="text-xs text-[var(--text-muted)]">{lead.phone}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Service Type</p>
              <p className="text-sm text-[var(--text-primary)]">{lead.service}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Assigned To</p>
              <p className="text-sm text-[var(--text-primary)]">{lead.assignedTo}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Status</p>
              <select
                value={lead.status}
                onChange={(e) =>
                  setLead({ ...lead, status: e.target.value as LeadStatus })
                }
                className="input mt-1 w-full"
              >
                {statusOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* NOTES */}
        <div className="card p-6 flex flex-col gap-4">
          <h2 className="section-title">Notes (Internal)</h2>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Write a note..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              className="input flex-1"
            />
            <button onClick={addNote} className="btn">Add</button>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            {notes.map((n) => (
              <div
                key={n.id}
                className={`max-w-[75%] p-3 rounded-xl text-sm ${
                  n.sender === "me"
                    ? "ml-auto bg-[var(--erp-blue)] text-white"
                    : n.sender === "system"
                    ? "mx-auto bg-[var(--surface-muted)] text-[var(--text-muted)]"
                    : "mr-auto bg-[var(--surface-muted)] text-[var(--text-primary)]"
                }`}
              >
                <p>{n.message}</p>
                <p className="mt-1 text-[10px] opacity-70">{n.time}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ACTIVITY TIMELINE */}
        <div className="card p-6">
          <h2 className="section-title mb-4">Activity Timeline</h2>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex gap-3 items-start">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-[var(--erp-blue)] flex-shrink-0" />
              <p className="text-[var(--text-primary)]">
                Status changed to <strong>{lead.status}</strong> by You —{" "}
                {new Date().toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <p className="text-[var(--text-primary)]">
                Lead created — {new Date(lead.createdOn).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* FILES */}
        <div className="card p-6">
          <h2 className="section-title mb-2">Files</h2>
          <p className="helper-text">
            File upload will be connected after database integration.
          </p>
        </div>

      </div>
    </div>
  );
}
