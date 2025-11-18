"use client";

import { useState } from "react";

export default function FinanceSettingsPage() {
  const [financeEmail, setFinanceEmail] = useState("finance@lacreativo.com");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState(8.5);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(true);

  return (
    <div className="p-6 space-y-10">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Finance Settings</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Configure billing, invoicing preferences, currency format, and tax rules.
        </p>
      </div>

      {/* SETTINGS CARD */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm space-y-8">

        {/* Finance Email */}
        <div>
          <label className="block text-sm font-medium mb-2">Finance Email</label>
          <input
            type="email"
            value={financeEmail}
            onChange={(e) => setFinanceEmail(e.target.value)}
            className="w-full p-2 rounded-md border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
          />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium mb-2">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full p-2 rounded-md border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
          >
            <option value="USD">USD ($)</option>
            <option value="PKR">PKR (₨)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="AED">AED (د.إ)</option>
          </select>
        </div>

        {/* TAX RATE */}
        <div>
          <label className="block text-sm font-medium mb-2">Tax Rate (%)</label>
          <input
            type="number"
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value))}
            className="w-full p-2 rounded-md border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
          />
        </div>

        {/* AUTO INVOICE */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-generate invoices</span>
          <button
            onClick={() => setAutoInvoice(!autoInvoice)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              autoInvoice ? "bg-blue-600" : "bg-gray-400"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                autoInvoice ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* PAYMENT REMINDERS */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Send payment reminders</span>
          <button
            onClick={() => setPaymentReminders(!paymentReminders)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              paymentReminders ? "bg-blue-600" : "bg-gray-400"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                paymentReminders ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* SAVE (FAKE) */}
        <button className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
          Save Settings
        </button>
      </div>
    </div>
  );
      }
