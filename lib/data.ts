// /lib/data.ts
"use client";
import { getFirebaseDb } from "@/lib/firebaseClient";
import { collection, query, orderBy, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";

export async function watchProjects(cb: (rows: DocumentData[]) => void): Promise<Unsubscribe> {
  const db = await getFirebaseDb();
  const q = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(rows);
  });
  return unsub;
}
