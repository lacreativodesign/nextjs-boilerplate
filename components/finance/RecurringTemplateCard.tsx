"use client";

import { formatCurrency, CurrencyCode } from "@/lib/finance/currencies";
import { getFrequencyDescription, RecurrenceFrequency, TemplateStatus } from "@/lib/finance/recurring";

interface RecurringTemplateCardProps {
  template: {
    id: string;
    name: string;
    clientName: string;
    status: TemplateStatus;
    frequency: RecurrenceFrequency;
    interval: number;
    dayOfMonth?: number;
    dayOfWeek?: number;
    currency: CurrencyCode;
    lineItems: Array<{ quantity: number; unitPrice: number }>;
    nextGenerationDate: Date | string | number;
    generatedCount: number;
  };
  onEdit?: () => void;
  onActivate?: () => void;
  onPause?: () => void;
  onDelete?: () => void;
}

const statusColors: Record<TemplateStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
};

export function RecurringTemplateCard({ template, onEdit, onActivate, onPause, onDelete }: RecurringTemplateCardProps) {
  const totalAmount = template.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const frequencyText = getFrequencyDescription(template.frequency, template.interval, template.dayOfMonth, template.dayOfWeek);

  const nextGenDate = new Date(template.nextGenerationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextGenDateCompare = new Date(nextGenDate);
  nextGenDateCompare.setHours(0, 0, 0, 0);
  const isOverdue = template.status === "active" && nextGenDateCompare < today;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{template.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{template.clientName}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[template.status]}`}>{template.status}</span>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Frequency</span>
          <span className="font-medium text-gray-900 dark:text-white">{frequencyText}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Amount</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(totalAmount, template.currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Next Invoice</span>
          <span className={`font-medium ${isOverdue ? "text-red-600" : "text-gray-900 dark:text-white"}`}>
            {nextGenDate.toLocaleDateString()}
            {isOverdue ? <span className="ml-2 text-xs">(Overdue)</span> : null}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Generated</span>
          <span className="font-medium text-gray-900 dark:text-white">{template.generatedCount} invoices</span>
        </div>
      </div>

      <div className="flex gap-2">
        {onEdit ? (
          <button
            onClick={onEdit}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit
          </button>
        ) : null}

        {template.status === "active" && onPause ? (
          <button
            onClick={onPause}
            className="flex-1 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
          >
            Pause
          </button>
        ) : null}

        {(template.status === "draft" || template.status === "paused") && onActivate ? (
          <button
            onClick={onActivate}
            className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Activate
          </button>
        ) : null}

        {onDelete ? (
          <button onClick={onDelete} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
