import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, normalizeRole } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

type CreateTaxRateBody = {
  name?: string;
  rate?: number;
  country?: string;
  state?: string | null;
  description?: string | null;
  isDefault?: boolean;
  inclusive?: boolean;
  taxIdNumber?: string | null;
};

const nowIso = () => new Date().toISOString();

function canManageTax(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return normalized === "finance" || isAdminRole(normalized);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = String(user.tenantId || "").trim();
    if (!tenantId) return NextResponse.json({ ok: false, error: "Tenant context missing" }, { status: 400 });

    const snapshot = await adminDb
      .collection("tax_rates")
      .where("tenantId", "==", tenantId)
      .orderBy("isDefault", "desc")
      .orderBy("createdAt", "asc")
      .get();

    const taxRates = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => item.isDeleted !== true);

    return NextResponse.json({ ok: true, taxRates });
  } catch (error) {
    console.error("[TAX_RATES_GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch tax rates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!canManageTax(user.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const tenantId = String(user.tenantId || "").trim();
    if (!tenantId) return NextResponse.json({ ok: false, error: "Tenant context missing" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as CreateTaxRateBody;
    const name = String(body.name || "").trim();
    const rate = Number(body.rate);
    const country = String(body.country || "").trim();

    if (name.length < 2 || name.length > 50) {
      return NextResponse.json({ ok: false, error: "name must be between 2 and 50 characters" }, { status: 400 });
    }
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
      return NextResponse.json({ ok: false, error: "rate must be a number between 0 and 100" }, { status: 400 });
    }
    if (!country) {
      return NextResponse.json({ ok: false, error: "country is required" }, { status: 400 });
    }

    const isDefault = Boolean(body.isDefault);
    if (isDefault) {
      const existing = await adminDb.collection("tax_rates").where("tenantId", "==", tenantId).get();
      const batch = adminDb.batch();
      existing.docs.forEach((doc) => {
        if (doc.data().isDefault === true && doc.data().isDeleted !== true) {
          batch.update(doc.ref, { isDefault: false, updatedAt: nowIso() });
        }
      });
      await batch.commit();
    }

    const docRef = adminDb.collection("tax_rates").doc();
    const taxRate = {
      id: docRef.id,
      tenantId,
      name,
      rate: parseFloat(rate.toFixed(2)),
      country,
      state: body.state ? String(body.state).trim() : null,
      description: body.description ? String(body.description).trim() : null,
      isDefault,
      isActive: true,
      taxIdNumber: body.taxIdNumber ? String(body.taxIdNumber).trim() : null,
      inclusive: Boolean(body.inclusive),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      isDeleted: false,
    };

    await docRef.set(taxRate);

    return NextResponse.json({ ok: true, taxRate });
  } catch (error) {
    console.error("[TAX_RATES_POST]", error);
    return NextResponse.json({ ok: false, error: "Failed to create tax rate" }, { status: 500 });
  }
}
