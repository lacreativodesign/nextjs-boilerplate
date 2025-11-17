"use client";

import { useState } from "react";

export default function SalesReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dealType, setDealType] = useState("all");

  // Dummy deal data
  const deals = [
    {
      id: "D001",
      client: "John Carter",
      amount: 4500,
      type: "website",
      date: "2025-01-12",
    },
    {
      id: "D002",
      client: "Blue Sparrow LLC",
      amount: 8000,
      type: "branding",
      date: "2025-01-15",
    },
    {
      id: "D003",
      client: "Sarah Parker",
      amount: 2000,
      type: "smm",
      date: "2025-01-20",
    },
  ];

  // Apply filters
  const filteredDeals = deals.filter((deal) => {
    const dealDate = new Date(deal.date);

    if (startDate && dealDate < new Date(startDate)) return false;
    if (endDate && dealDate > new Date(endDate)) return false;
    if (dealType !== "all" && deal.type !== dealType) return false;

    return true;
  });

  // Export CSV
  const exportCSV = () => {
    const headers = ["ID", "Client", "Amount", "Type", "Date"];
    const rows = filteredDeals.map((d) => [
      d.id,
      d.client,
      d.amount,
      d.type,
      d.date,
    ]);

    let csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map((e) => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = "sales_reports.csv";
    link.click();
  };

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-2xl font-bold">Sales Reports</h1>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800 space-y-6">
        <h2 className="text-lg font-semibold">Filters</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Start */}
          <div>
            <label className="text-sm font-medium">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />
          </div>

          {/* Date End */}
          <div>
            <label className="text-sm font-medium">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />
          </div>

          {/* Deal Type */}
          <div>
            <label className="text-sm font-medium">Deal Type</label>
            <select
              value={dealType}
              onChange={(e) => setDealType(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              <option value="all">All</option>
              <option value="website">Website</option>
              <option value="branding">Branding</option>
              <option value="smm">SMM</option>
            </select>
          </div>
        </div>

        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Export CSV
        </button>
      </div>

      {/* Report Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-4">Deals Report</h2>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-neutral-800">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Client</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>

          <tbody>
            {filteredDeals.map((deal) => (
              <tr
                key={deal.id}
                className="border-b border-gray-200 dark:border-neutral-800"
              >
                <td className="p-3">{deal.id}</td>
                <td className="p-3">{deal.client}</td>
                <td className="p-3">${deal.amount.toLocaleString()}</td>
                <td className="p-3 capitalize">{deal.type}</td>
                <td className="p-3">{deal.date}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredDeals.length === 0 && (
          <p className="text-center text-gray-500 mt-6">
            No deals found for this filter.
          </p>
        )}
      </div>
    </div>
  );
                                     }
