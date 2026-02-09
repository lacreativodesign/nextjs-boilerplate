import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";
import type { SearchModule } from "@/types/search";

export const runtime = "nodejs";

const createSavedSearchSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  module: z.enum(["invoices", "customers", "products", "users", "audit_logs", "payments", "expenses", "clients"]),
  filters: z.array(
    z.object({
      field: z.string().min(1),
      operator: z.string().min(1),
      value: z.any(),
    })
  ),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  isShared: z.boolean().default(false),
});

function isAdminOrOwner(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner";
}

// GET - List saved searches
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const module = searchParams.get("module") as SearchModule | null;

    let query = adminDb.collection("saved_searches").where("tenantId", "==", session.tenantId);
    if (module) {
      query = query.where("module", "==", module);
    }

    const userSearchesSnapshot = await query.where("userId", "==", session.uid).get();

    let sharedQuery = adminDb
      .collection("saved_searches")
      .where("tenantId", "==", session.tenantId)
      .where("isShared", "==", true);

    if (module) {
      sharedQuery = sharedQuery.where("module", "==", module);
    }

    const sharedSearchesSnapshot = await sharedQuery.get();

    const allSearches = [
      ...userSearchesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...sharedSearchesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ];

    const uniqueSearches = Array.from(new Map(allSearches.map((entry) => [entry.id, entry])).values());

    return NextResponse.json({ searches: uniqueSearches });
  } catch (error) {
    console.error("Error fetching saved searches:", error);
    return NextResponse.json({ error: "Failed to fetch saved searches" }, { status: 500 });
  }
}

// POST - Create saved search
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createSavedSearchSchema.parse(body);

    if (data.isShared && !isAdminOrOwner(session.role)) {
      return NextResponse.json({ error: "Only admins can create shared searches" }, { status: 403 });
    }

    const savedSearch = {
      tenantId: session.tenantId,
      userId: session.uid,
      ...data,
      usageCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("saved_searches").add(savedSearch);

    return NextResponse.json({
      id: docRef.id,
      ...savedSearch,
    });
  } catch (error) {
    console.error("Error creating saved search:", error);
    return NextResponse.json({ error: "Failed to create saved search" }, { status: 500 });
  }
}
