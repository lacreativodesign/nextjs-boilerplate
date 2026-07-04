'use client';

import { useState } from 'react';

export default function SalesReportsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dealType, setDealType] = useState('all');

  // Dummy deal data
  const deals = [
    {
      id: 'D001',
      client: 'John Carter',
      amount: 4500,
      type: 'website',
      date: '2025-01-12',
    },
    {
      id: 'D002',
      client: 'Blue Sparrow LLC',
      amount: 8000,
      type: 'branding',
      date: '2025-01-15',
    },
    {
      id: 'D003',
      client: 'Sarah Parker',
      amount: 2000,
      type: 'smm',
      date: '2025-01-20',
    },
  ];

  // Apply filters
  const filteredDeals = deals.filter((deal) => {
    const dealDate = new Date(deal.date);

    if (startDate && dealDate < new Date(startDate)) return false;
    if (endDate && dealDate > new Date(endDate)) return false;
    if (dealType !== 'all' && deal.type !== dealType) return false;

    return true;
  });

  // Export CSV
  const exportCSV = () => {
    const headers = ['ID', 'Client', 'Amount', 'Type', 'Date'];
    const rows = filteredDeals.map((d) => [d.id, d.client, d.amount, d.type, d.date]);

    let csvContent =
      'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encodedUri;
    link.download = 'sales_reports.csv';
    link.click();
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Sales Reports</h1>

      <div className="card p-6 space-y-6">
        <h2 className="section-title">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="field-label text-sm">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input mt-2"
            />
          </div>
          <div>
            <label className="field-label text-sm">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input mt-2"
            />
          </div>
          <div>
            <label className="field-label text-sm">Deal Type</label>
            <select
              value={dealType}
              onChange={(e) => setDealType(e.target.value)}
              className="input mt-2"
            >
              <option value="all">All</option>
              <option value="website">Website</option>
              <option value="branding">Branding</option>
              <option value="smm">SMM</option>
            </select>
          </div>
        </div>
        <button onClick={exportCSV} className="btn">
          Export CSV
        </button>
      </div>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[var(--table-header-bg)]">
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  ID
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Client
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Amount
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Type
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <tr
                  key={deal.id}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--table-row-hover)] transition"
                >
                  <td className="p-3 text-[var(--text-primary)]">{deal.id}</td>
                  <td className="p-3 text-[var(--text-primary)]">{deal.client}</td>
                  <td className="p-3 text-[var(--text-primary)]">
                    ${deal.amount.toLocaleString()}
                  </td>
                  <td className="p-3 capitalize text-[var(--text-primary)]">{deal.type}</td>
                  <td className="p-3 text-[var(--text-primary)]">{deal.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredDeals.length === 0 && (
          <p className="p-8 text-center text-[var(--text-muted)]">
            No deals found for this filter.
          </p>
        )}
      </div>
    </div>
  );
}
