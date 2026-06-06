import { doc, getDoc } from "firebase/firestore";
import { getDb } from "./firebase";

export async function getUserRole(uid: string) {
  try {
    const ref = doc(getDb(), "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data().role;
  } catch (err) {
    console.error("Error fetching user role:", err);
    return null;
  }
}
