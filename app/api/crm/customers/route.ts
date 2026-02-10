import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCrmUser } from "@/lib/crm";
import { CustomerService } from "@/lib/crm/customer-service";
import { adminDb } from "@/lib/firebaseAdmin";

const createCustomerSchema = z.object({
  type: z.enum(["lead", "prospect", "customer", "partner"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  leadSource: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data = createCustomerSchema.parse(body);

    const customerId = await CustomerService.createCustomer({
      tenantId: auth.tenantId,
      ...data,
      ownerId: auth.user.uid,
      ownerName: auth.user.name || auth.user.email || "Unknown",
    });

    return NextResponse.json({ customerId });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create customer" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const ownerId = searchParams.get("ownerId");

    let query: FirebaseFirestore.Query = adminDb.collection("customers").where("tenantId", "==", auth.tenantId);

    if (type) {
      query = query.where("type", "==", type);
    }

    if (status) {
      query = query.where("status", "==", status);
    }

    if (ownerId) {
      query = query.where("ownerId", "==", ownerId);
    }

    const snapshot = await query.orderBy("createdAt", "desc").limit(200).get();
    const customers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}
