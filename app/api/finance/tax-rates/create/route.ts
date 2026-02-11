import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance, serverTimestamp } from "@/app/api/finance/_utils";
import { resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

const createTaxRateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["sales_tax", "vat", "gst", "hst", "pst", "qst", "custom"]),
  rate: z.number().min(0).max(100, "Rate must be between 0 and 100"),
  country: z.string().min(2, "Country code is required"),
  region: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
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
    const validated = createTaxRateSchema.parse(body);

    if (validated.effectiveFrom && validated.effectiveTo) {
      const effectiveFrom = new Date(validated.effectiveFrom);
      const effectiveTo = new Date(validated.effectiveTo);
      if (Number.isNaN(effectiveFrom.getTime()) || Number.isNaN(effectiveTo.getTime()) || effectiveFrom > effectiveTo) {
        return NextResponse.json(
          { ok: false, error: "effectiveFrom must be less than or equal to effectiveTo" },
          { status: 400 },
        );
      }
    }

    const tenantId = auth.user.tenantId;

    if (validated.isDefault) {
      const existingDefaults = await adminDb
        .collection("tax_rates")
        .where("tenantId", "==", tenantId)
        .where("isDefault", "==", true)
        .get();

      const batch = adminDb.batch();
      existingDefaults.docs.forEach((doc) => {
        batch.update(doc.ref, { isDefault: false, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    const docRef = adminDb.collection("tax_rates").doc();
    await docRef.set({
      name: validated.name,
      type: validated.type,
      rate: validated.rate,
      country: validated.country.toUpperCase(),
      region: validated.region?.toUpperCase() || null,
      description: validated.description || null,
      isActive: validated.isActive,
      isDefault: validated.isDefault,
      effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
      effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
      tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, taxRateId: docRef.id });
  } catch (err) {
    logError(err, { route: "POST /api/finance/tax-rates/create" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to create tax rate",
    });
    return NextResponse.json(body, { status });
  }
}
