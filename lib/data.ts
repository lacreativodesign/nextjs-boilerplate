// /lib/data.ts
"use client";
import { db } from "@/lib/firebaseClient";
import {
  collection, query, orderBy, onSnapshot, DocumentData
} from "firebase/firestore";

export function watchProjects(cb: (rows: DocumentData[]) => void) {
  const q = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(rows);
  });
  return unsub;
}
