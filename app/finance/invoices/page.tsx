"use client";

import { useState } from "react";

const dummyInvoices = [
  {
    id: "INV-1001",
    client: "BluePeak Technologies",
    amount: 1450,
    status: "Paid",
    issueDate: "2025-01-04",
    dueDate: "2025-01-14",
  },
  {
    id: "INV-1002",
    client: "Harbor Media",
    amount: 980,
    status: "Pending",
    issueDate: "2025-01-08",
    dueDate: "2025-01-18",
  },
  {
    id: "INV-1003",
    client: "Arcline Logistics",
    amount: 1725,
    status: "Overdue",
    issueDate: "2024-12-20",
    dueDate: "2024-12-30",
  },
  {
    id: "INV-1004",
    client: "Nova Retail Group",
    amount: 2300,
    status: "Paid",
    issueDate: "2025-01-10",
    dueDate: "2025-01-20",
  },
];

const statusColors: any = {
  Paid: "text-green-600 dark:text-green-400",
  Pending: "text-yellow-600 dark:text-yellow-400",
  Overdue: "text-red-600 dark:text-red-400",
};

export default function FinanceInvoicesPage() {
  const [filter, setFilter] = useState("All");

  const filtered =
    filter === "All"
      ? dummyInvoices
      : dummyInvoices.filter((inv) => inv.status === filter);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Track all invoices across the business.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {["All", "Paid", "Pending", "Overdue"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg border text-sm transition ${
              filter === s
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-800 text-gray-700 dark:text-neutral-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 text-left">
              <th className="p-3">Invoice ID</th>
              <th className="p-3">Client</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Issued</th>
              <th className="p-3">Due</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-gray-100">
            {filtered.map((inv, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-neutral-800"
              >
                <td className="p-3">{inv.id}</td>
                <td className="p-3">{inv.client}</td>
                <td className="p-3">${inv.amount}</td>
                <td className={`p-3 font-semibold ${statusColors[inv.status]}`}>
                  {inv.status}
                </td>
                <td className="p-3">{inv.issueDate}</td>
                <td className="p-3">{inv.dueDate}</td>
                <td className="p-3 text-right">
                  <button className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-6 text-center text-gray-500 dark:text-neutral-400"
                >
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
        }
