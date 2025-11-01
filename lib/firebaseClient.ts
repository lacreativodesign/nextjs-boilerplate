import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAH5t2K94zX8RSDvUXumB7rIN9-IcrM8_M",
  authDomain: "la-creativo-erp.firebaseapp.com",
  projectId: "la-creativo-erp",
  storageBucket: "la-creativo-erp.firebasestorage.app",
  messagingSenderId: "1091518426177",
  appId: "1:1091518426177:web:bb2fc01c76a63507742ac0"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
