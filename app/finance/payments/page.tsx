"use client";

const paymentSummary = [
  {
    label: "Total Payments Received",
    value: "$12,480",
  },
  {
    label: "Pending Payments",
    value: "$3,920",
  },
  {
    label: "Failed Transactions",
    value: "$540",
  },
];

const recentTransactions = [
  {
    id: "TXN-00121",
    client: "BluePeak Technologies",
    amount: 1450,
    status: "Success",
    date: "2025-01-14",
    method: "Credit Card",
  },
  {
    id: "TXN-00122",
    client: "Harbor Media",
    amount: 980,
    status: "Pending",
    date: "2025-01-15",
    method: "Bank Transfer",
  },
  {
    id: "TXN-00123",
    client: "Arcline Logistics",
    amount: 1725,
    status: "Failed",
    date: "2025-01-16",
    method: "Stripe",
  },
  {
    id: "TXN-00124",
    client: "Nova Retail Group",
    amount: 2300,
    status: "Success",
    date: "2025-01-17",
    method: "Credit Card",
  },
];

const statusColors: any = {
  Success: "text-green-600 dark:text-green-400",
  Pending: "text-yellow-600 dark:text-yellow-400",
  Failed: "text-red-600 dark:text-red-400",
};

export default function FinancePaymentsPage() {
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Track payment activity, settlement status, and transaction logs.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {paymentSummary.map((item, index) => (
          <div
            key={index}
            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {item.label}
            </p>
            <p className="text-2xl font-bold mt-2">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 text-left">
              <th className="p-3">Txn ID</th>
              <th className="p-3">Client</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Method</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody className="text-gray-900 dark:text-gray-100">
            {recentTransactions.map((t, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-neutral-800"
              >
                <td className="p-3">{t.id}</td>
                <td className="p-3">{t.client}</td>
                <td className="p-3">${t.amount}</td>
                <td className={`p-3 font-medium ${statusColors[t.status]}`}>
                  {t.status}
                </td>
                <td className="p-3">{t.method}</td>
                <td className="p-3">{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  }
