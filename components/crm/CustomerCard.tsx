"use client";

type CustomerCardProps = {
  customer: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    companyName?: string;
    status?: string;
    type?: string;
    leadScore?: number;
    ownerName?: string;
  };
  onUpdate?: () => Promise<void> | void;
};

export function CustomerCard({ customer }: CustomerCardProps) {
  const name = customer.fullName || `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unnamed";

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{name}</h3>
          <p className="text-sm text-gray-600">{customer.companyName || "No company"}</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">{customer.type || "lead"}</span>
      </div>
      <div className="space-y-1 text-sm text-gray-700">
        <p>{customer.email || "No email"}</p>
        <p>Status: {customer.status || "new"}</p>
        <p>Lead Score: {customer.leadScore ?? 0}</p>
        <p>Owner: {customer.ownerName || "Unassigned"}</p>
      </div>
    </article>
  );
}
