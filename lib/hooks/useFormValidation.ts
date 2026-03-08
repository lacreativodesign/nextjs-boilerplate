"use client";

import { useCallback, useState } from "react";
import { z, ZodSchema } from "zod";

// Hook that takes a Zod schema and returns validation helpers for forms.
export function useFormValidation<T>(schema: ZodSchema<T>) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(
    (data: unknown) => {
      const result = schema.safeParse(data);
      if (result.success) {
        setErrors({});
        return { success: true, errors: {} } as const;
      }

      const fieldErrors = result.error.errors.reduce<Record<string, string>>((acc, err) => {
        const field = err.path.join(".") || "root";
        if (!acc[field]) {
          acc[field] = err.message;
        }
        return acc;
      }, {});

      setErrors(fieldErrors);
      return { success: false, errors: fieldErrors } as const;
    },
    [schema]
  );

  const validateField = useCallback(
    (field: string, value: unknown) => {
      if (!(schema instanceof z.ZodObject)) {
        return { success: true, error: "" } as const;
      }

      const shape = schema.shape as Record<string, z.ZodTypeAny>;
      const fieldSchema = shape[field];
      if (!fieldSchema) {
        return { success: true, error: "" } as const;
      }

      const result = fieldSchema.safeParse(value);
      if (result.success) {
        setErrors((prev) => {
          const { [field]: _removed, ...rest } = prev;
          return rest;
        });
        return { success: true, error: "" } as const;
      }

      const message = result.error.errors[0]?.message || "Invalid value";
      setErrors((prev) => ({ ...prev, [field]: message }));
      return { success: false, error: message } as const;
    },
    [schema]
  );

  const clearErrors = useCallback(() => setErrors({}), []);

  return { errors, validate, validateField, clearErrors };
}
