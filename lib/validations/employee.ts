import { z } from "zod";
import { dateStringSchema } from "./common";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(0, "Salary must be at least 0")
);

export const createEmployeeSchema = z.object({
  userId: z
    .string({ required_error: "User id is required" })
    .trim()
    .min(1, "User id is required"),
  department: z
    .string({ required_error: "Department is required" })
    .trim()
    .min(1, "Department is required"),
  position: z
    .string({ required_error: "Position is required" })
    .trim()
    .min(2, "Position must be at least 2 characters")
    .max(100, "Position must be at most 100 characters"),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"], {
    required_error: "Employment type is required",
  }),
  startDate: dateStringSchema,
  salary: optionalNumber.optional(),
  manager: z.string().trim().min(1, "Manager id is required").optional(),
  tenantId: z
    .string({ required_error: "Tenant id is required" })
    .trim()
    .min(1, "Tenant id is required"),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
