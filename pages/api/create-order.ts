import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "../../lib/firebaseAdmin";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST") return res.status(405).end();
  const { clientUid, projectId, amount } = req.body;

  const ref = adminDb.collection("counters").doc("orders");
  const orderId = await adminDb.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data()!.seq || 0) : 0;
    const next = current + 1;
    tx.set(ref, { seq: next }, { merge: true });
    return `LC-${String(next).padStart(4,"0")}`;
  });

  await adminDb.collection("payments").add({
    orderId, clientUid, projectId, amount,
    status: "Pending", createdAt: new Date()
  });

  return res.json({ orderId });
}
