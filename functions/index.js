const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createUserByAdmin = functions.https.onCall(async (data, context) => {
  // Only admin can create users
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Not logged in");
  }

  const uid = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(uid).get();

  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admins only");
  }

  const { email, password, role, name } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Missing fields");
  }

  // create Firebase Auth user
  const newUser = await admin.auth().createUser({
    email,
    password,
    displayName: name || "",
  });

  // create Firestore user doc
  await admin.firestore().collection("users").doc(newUser.uid).set({
    name: name || "",
    email,
    role,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { uid: newUser.uid, message: "User created successfully" };
});
