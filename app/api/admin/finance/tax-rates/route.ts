import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, serverTimestamp } from "../_utils";
import { TaxRate } from "@/lib/tax/taxCalculator";

export const dynamic = "force-dynamic";

function normalizeTaxRate(data: Partial<TaxRate>): Omit<TaxRate, "id"> {
  return {
    name: String(data.name || "").trim(),
    rate: Number(data.rate || 0),
    type: data.type === "compound" ? "compound" : "simple",
    applies_to: data.applies_to === "subtotal_plus_other_taxes" ? "subtotal_plus_other_taxes" : "subtotal",
    enabled: Boolean(data.enabled),
    description: data.description ? String(data.description).trim() : undefined,
  };
}

function validateTaxRate(taxRate: Omit<TaxRate, "id">): string | null {
  if (!taxRate.name) return "name is required";
  if (!Number.isFinite(taxRate.rate) || taxRate.rate < 0 || taxRate.rate > 100) {
    return "rate must be between 0 and 100";
  }
  return null;
}

async function getTenantId() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  }

  const tenantId = auth.user.tenantId;
  if (!tenantId) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Tenant context required." }, { status: 400 }),
    };
  }

  return { ok: true as const, tenantId, auth };
}

export async function GET() {
  try {
    const tenantResult = await getTenantId();
    if (!tenantResult.ok) return tenantResult.response;

    const snapshot = await adminDb
      .collection("tenants")
      .doc(tenantResult.tenantId)
      .collection("taxRates")
      .orderBy("name", "asc")
      .get();

    const taxRates = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ ok: true, taxRates });
  } catch (error: any) {
    console.error("Error fetching tax rates:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch tax rates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantResult = await getTenantId();
    if (!tenantResult.ok) return tenantResult.response;

    const body = await request.json();
    const taxRate = normalizeTaxRate(body);
    const validationError = validateTaxRate(taxRate);

    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const docRef = await adminDb.collection("tenants").doc(tenantResult.tenantId).collection("taxRates").add({
      ...taxRate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: tenantResult.auth.user.uid,
    });

    return NextResponse.json({ ok: true, id: docRef.id, taxRate: { id: docRef.id, ...taxRate } });
  } catch (error: any) {
    console.error("Error creating tax rate:", error);
    return NextResponse.json({ ok: false, error: "Failed to create tax rate" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tenantResult = await getTenantId();
    if (!tenantResult.ok) return tenantResult.response;

    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.rate === "number") updates.rate = body.rate;
    if (body.type === "simple" || body.type === "compound") updates.type = body.type;
    if (body.applies_to === "subtotal" || body.applies_to === "subtotal_plus_other_taxes") updates.applies_to = body.applies_to;
    if (typeof body.description === "string") updates.description = body.description.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
    }

    updates.updatedAt = serverTimestamp();

    await adminDb.collection("tenants").doc(tenantResult.tenantId).collection("taxRates").doc(id).update(updates);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating tax rate:", error);
    return NextResponse.json({ ok: false, error: "Failed to update tax rate" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantResult = await getTenantId();
    if (!tenantResult.ok) return tenantResult.response;

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    await adminDb.collection("tenants").doc(tenantResult.tenantId).collection("taxRates").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error deleting tax rate:", error);
    return NextResponse.json({ ok: false, error: "Failed to delete tax rate" }, { status: 500 });
  }
}
