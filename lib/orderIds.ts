import { adminDb } from "@/lib/firebaseAdmin";

export async function generateNextOrderId(tenantId: string): Promise<string> {
  const counterRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("counters")
    .doc("orders");
  const next = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = Number((snap.data() || {})?.seq ?? 0);
    const newSeq = current + 1;
    tx.set(counterRef, { seq: newSeq }, { merge: true });
    return newSeq;
  });
  const padded = String(next).padStart(4, "0");
  return `LC-${padded}`;
}
