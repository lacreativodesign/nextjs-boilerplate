export type RecurrenceFrequency =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type TemplateStatus = 'draft' | 'active' | 'paused' | 'cancelled';

export interface RecurringInvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  clientId: string;
  clientName: string;
  status: TemplateStatus;
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
  customDays?: number;
  startDate: Date;
  endDate?: Date;
  lastGeneratedDate?: Date;
  nextGenerationDate: Date;
  generatedCount: number;
  currency: string;
  taxRateId?: string;
  taxRateName?: string;
  taxRate?: number;
  lineItems: RecurringLineItem[];
  notes?: string;
  autoSend: boolean;
  generateDaysBefore: number;
  dueDaysAfter: number;
  ownerId: string;
  ownerName: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface GeneratedInvoiceRecord {
  id: string;
  templateId: string;
  invoiceId: string;
  generatedDate: Date;
  status: 'generated' | 'sent' | 'paid' | 'failed';
  tenantId: string;
}

export function calculateNextGenerationDate(
  lastDate: Date,
  frequency: RecurrenceFrequency,
  interval: number,
  dayOfMonth?: number,
  dayOfWeek?: number,
  customDays?: number,
): Date {
  const next = new Date(lastDate);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;

    case 'weekly':
      next.setDate(next.getDate() + 7 * interval);
      if (dayOfWeek !== undefined) {
        const currentDay = next.getDay();
        const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysToAdd);
      }
      break;

    case 'monthly':
      next.setMonth(next.getMonth() + interval);
      if (dayOfMonth !== undefined) {
        next.setDate(Math.min(dayOfMonth, getDaysInMonth(next)));
      }
      break;

    case 'quarterly':
      next.setMonth(next.getMonth() + 3 * interval);
      if (dayOfMonth !== undefined) {
        next.setDate(Math.min(dayOfMonth, getDaysInMonth(next)));
      }
      break;

    case 'yearly':
      next.setFullYear(next.getFullYear() + interval);
      if (dayOfMonth !== undefined) {
        next.setDate(Math.min(dayOfMonth, getDaysInMonth(next)));
      }
      break;

    case 'custom':
      if (customDays !== undefined) {
        next.setDate(next.getDate() + customDays);
      }
      break;
  }

  return next;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function shouldGenerateInvoice(template: RecurringInvoiceTemplate): boolean {
  if (template.status !== 'active') {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextGen = new Date(template.nextGenerationDate);
  nextGen.setHours(0, 0, 0, 0);

  if (today >= nextGen) {
    if (template.endDate) {
      const endDate = new Date(template.endDate);
      endDate.setHours(0, 0, 0, 0);
      return today <= endDate;
    }

    return true;
  }

  return false;
}

export function getFrequencyDescription(
  frequency: RecurrenceFrequency,
  interval: number,
  dayOfMonth?: number,
  dayOfWeek?: number,
): string {
  switch (frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;

    case 'weekly': {
      const dayName =
        dayOfWeek !== undefined
          ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              dayOfWeek
            ]
          : '';

      return interval === 1
        ? `Weekly${dayName ? ` on ${dayName}` : ''}`
        : `Every ${interval} weeks${dayName ? ` on ${dayName}` : ''}`;
    }

    case 'monthly': {
      const dayText = dayOfMonth ? ` on day ${dayOfMonth}` : '';
      return interval === 1 ? `Monthly${dayText}` : `Every ${interval} months${dayText}`;
    }

    case 'quarterly':
      return interval === 1 ? 'Quarterly' : `Every ${interval} quarters`;

    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;

    case 'custom':
      return 'Custom schedule';

    default:
      return 'Unknown';
  }
}
