import { z, ZodSchema, ZodTypeAny } from "zod";
import { AppError } from "@/lib/errors";

const formatZodErrors = (error: z.ZodError) =>
  error.errors.map((err) => ({
    field: err.path.join(".") || "root",
    message: err.message,
  }));

// Helper function to validate request body against a Zod schema.
// On success: returns parsed/cleaned data (Zod strips unknown fields).
// On failure: throws ValidationError (AppError with code VALIDATION_ERROR).
export function validateRequest<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    throw new AppError({
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      status: 400,
      cause: { fields: fieldErrors },
    });
  }
  return result.data;
}

// Helper for validating query params (GET requests).
export function validateQuery<T>(schema: ZodSchema<T>, params: URLSearchParams): T {
  const data = Object.fromEntries(params.entries());
  return validateRequest(schema, data);
}

// Helper for partial validation (PATCH requests).
export function validatePartial<T extends ZodTypeAny>(schema: T, data: unknown): Partial<z.infer<T>> {
  const partialSchema = schema instanceof z.ZodObject ? schema.partial() : schema;
  const result = partialSchema.safeParse(data);
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    throw new AppError({
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      status: 400,
      cause: { fields: fieldErrors },
    });
  }
  return result.data as Partial<z.infer<T>>;
}
