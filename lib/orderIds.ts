import { adminDb } from "@/lib/firebaseAdmin";

export async function generateNextOrderId(): Promise<string> {
  const counterRef = adminDb.collection("Order IDs").doc("counter");

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
