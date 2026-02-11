import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance, serverTimestamp } from "@/app/api/finance/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

const updateTaxRateSchema = z.object({
  taxRateId: z.string().min(1),
  name: z.string().optional(),
  rate: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const body = await req.json();
    const validated = updateTaxRateSchema.parse(body);

    const docRef = adminDb.collection("tax_rates").doc(validated.taxRateId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError({ message: "Tax rate not found", code: "NOT_FOUND", status: 404 });
    }

    const existing = docSnap.data();
    if (!existing || existing.tenantId !== auth.user.tenantId) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    if (validated.effectiveFrom && validated.effectiveTo) {
      const effectiveFrom = new Date(validated.effectiveFrom);
      const effectiveTo = new Date(validated.effectiveTo);
      if (Number.isNaN(effectiveFrom.getTime()) || Number.isNaN(effectiveTo.getTime()) || effectiveFrom > effectiveTo) {
        throw new AppError({
          message: "effectiveFrom must be less than or equal to effectiveTo",
          code: "VALIDATION_ERROR",
          status: 400,
        });
      }
    }

    if (validated.isDefault && !existing.isDefault) {
      const existingDefaults = await adminDb
        .collection("tax_rates")
        .where("tenantId", "==", auth.user.tenantId)
        .where("isDefault", "==", true)
        .get();

      const batch = adminDb.batch();
      existingDefaults.docs.forEach((doc) => {
        if (doc.id !== validated.taxRateId) {
          batch.update(doc.ref, { isDefault: false, updatedAt: serverTimestamp() });
        }
      });
      await batch.commit();
    }

    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.rate !== undefined) updates.rate = validated.rate;
    if (validated.description !== undefined) updates.description = validated.description;
    if (validated.isActive !== undefined) updates.isActive = validated.isActive;
    if (validated.isDefault !== undefined) updates.isDefault = validated.isDefault;
    if (validated.effectiveFrom !== undefined) {
      updates.effectiveFrom = validated.effectiveFrom ? new Date(validated.effectiveFrom) : null;
    }
    if (validated.effectiveTo !== undefined) {
      updates.effectiveTo = validated.effectiveTo ? new Date(validated.effectiveTo) : null;
    }

    await docRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "POST /api/finance/tax-rates/update" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to update tax rate",
    });
    return NextResponse.json(body, { status });
  }
}
