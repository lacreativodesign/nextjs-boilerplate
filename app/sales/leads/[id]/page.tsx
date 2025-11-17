"use client";

import React, { useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type LeadStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

const statusOptions: LeadStatus[] = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
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
    <ERPLayout pageTitle={`Lead • ${lead.fullName}`}>
      <div className="flex flex-col gap-6">
        {/* TITLE + META */}
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
            {lead.fullName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lead ID: {lead.id} • Created:{" "}
            {new Date(lead.createdOn).toLocaleDateString()}
          </p>
        </div>

        {/* LEAD SUMMARY PANEL */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Contact Details
              </h2>
              <p className="text-sm mt-1 text-slate-900 dark:text-slate-50">
                {lead.fullName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lead.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lead.phone}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Service Type
              </h2>
              <p className="text-sm mt-1 text-slate-900 dark:text-slate-50">
                {lead.service}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Assigned To
              </h2>
              <p className="text-sm mt-1 text-slate-900 dark:text-slate-50">
                {lead.assignedTo}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Status
              </h2>
              <select
                value={lead.status}
                onChange={(e) =>
                  setLead({ ...lead, status: e.target.value as LeadStatus })
                }
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {statusOptions.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* NOTES — iMessage Style */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Notes (Internal)
          </h2>

          {/* INPUT BOX */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Write a note..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              onClick={addNote}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm"
            >
              Add
            </button>
          </div>

          {/* NOTES LIST */}
          <div className="flex flex-col gap-4 mt-2">
            {notes.map((n) => (
              <div
                key={n.id}
                className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm ${
                  n.sender === "me"
                    ? "ml-auto bg-indigo-600 text-white"
                    : n.sender === "system"
                    ? "mx-auto bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    : "mr-auto bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                }`}
              >
                <p>{n.message}</p>
                <p className="mt-1 text-[10px] opacity-70">{n.time}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TIMELINE / ACTIVITY */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Activity Timeline
          </h2>

          <div className="flex flex-col gap-4 text-sm">
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-indigo-500"></div>
              <p>
                Status changed to <strong>{lead.status}</strong> by You —{" "}
                {new Date().toLocaleString()}
              </p>
            </div>

            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500"></div>
              <p>
                Lead created —{" "}
                {new Date(lead.createdOn).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* FILES (DUMMY) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Files (coming soon)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            File upload will be connected after database integration.
          </p>
        </div>
      </div>
    </ERPLayout>
  );
  }
