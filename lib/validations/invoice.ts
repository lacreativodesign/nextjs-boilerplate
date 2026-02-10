import { z } from "zod";
import { dateStringSchema } from "./common";
import { SUPPORTED_CURRENCIES } from "../finance/currencies";

const currencyCodes = Object.keys(SUPPORTED_CURRENCIES) as [keyof typeof SUPPORTED_CURRENCIES, ...(keyof typeof SUPPORTED_CURRENCIES)[]];

const currencySchema = z.enum(currencyCodes, {
  required_error: "Currency is required",
});

export const invoiceItemSchema = z.object({
  description: z
    .string({ required_error: "Item description is required" })
    .trim()
    .min(2, "Description must be at least 2 characters")
    .max(500, "Description must be at most 500 characters"),
  quantity: z.coerce.number().min(0.01, "Quantity must be at least 0.01"),
  unitPrice: z.coerce.number().min(0, "Unit price must be at least 0"),
  taxRate: z.coerce.number().min(0, "Tax rate must be at least 0").max(100, "Tax rate must be at most 100").default(0),
});

export const createInvoiceSchema = z.object({
  clientId: z
    .string({ required_error: "Client id is required" })
    .trim()
    .min(1, "Client id is required"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  currency: currencySchema.default("USD"),
  dueDate: dateStringSchema
    .refine((value) => new Date(value).getTime() > Date.now(), "Due date must be in the future")
    .optional(),
  notes: z.string().trim().max(2000, "Notes must be at most 2000 characters").optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
  tenantId: z
    .string({ required_error: "Tenant id is required" })
    .trim()
    .min(1, "Tenant id is required"),
  exchangeRate: z.number().positive().optional(),
  baseCurrency: currencySchema.optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  invoiceId: z.string().trim().min(1, "Invoice id is required"),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
