import type { z } from 'zod';

export type ImportValidationError = {
  row: number;
  field: string;
  error: string;
};

export async function validateRows<TSchema extends z.ZodTypeAny>(
  rows: Record<string, unknown>[],
  schema: TSchema,
  mapping: Record<string, string>,
) {
  const errors: ImportValidationError[] = [];
  const validRows: Array<z.infer<TSchema>> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const sourceRow = rows[i];
    const mapped: Record<string, unknown> = {};

    for (const [systemField, fileField] of Object.entries(mapping)) {
      if (!fileField) continue;
      mapped[systemField] = sourceRow[fileField];
    }

    const result = schema.safeParse(mapped);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 1,
          field: issue.path.join('.'),
          error: issue.message,
        });
      }
      continue;
    }

    validRows.push(result.data);
  }

  return { validRows, errors };
}
