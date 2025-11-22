"use client";

import SubTabs from "@/components/ui/SubTabs";

const tabs = [
  { label: "Invoices", path: "/admin/finance/invoices" },
  { label: "Payments", path: "/admin/finance/payments" },
  { label: "AR Aging", path: "/admin/finance/ar" },
  { label: "Estimates", path: "/admin/finance/estimates" },
  { label: "Retainers", path: "/admin/finance/retainers" },
];

export default function FinanceHome() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Finance & Billing</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Manage invoices, payments, AR aging, and retainers.
      </p>

      <SubTabs tabs={tabs} />

      <div className="text-gray-500 dark:text-gray-400">
        Select a tab above to continue.
      </div>
    </div>
  );
}
