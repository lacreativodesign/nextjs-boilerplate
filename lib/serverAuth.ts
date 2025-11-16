import { db } from "@/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";

export async function fetchUserRole(uid: string): Promise<string | null> {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    return data.role || null;
  } catch (err) {
    console.error("fetchUserRole ERROR:", err);
    return null;
  }
}
