import { adminDb } from "@/lib/firebaseAdmin";

export type DirectReport = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

export async function getDirectReports(params: {
  tenantId: string;
  managerUid: string;
  reportRole?: string;
}): Promise<DirectReport[]> {
  const { tenantId, managerUid, reportRole } = params;

  let query: FirebaseFirestore.Query = adminDb
    .collection("users")
    .where("tenantId", "==", tenantId)
    .where("managerId", "==", managerUid);

  if (reportRole) {
    query = query.where("role", "==", reportRole);
  }

  const snap = await query.get();

  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: doc.id,
      name: String(data.name || data.fullName || data.email || "User"),
      email: String(data.email || ""),
      role: String(data.role || ""),
    };
  });
}
