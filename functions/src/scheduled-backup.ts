import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "bizosto-backups";

const COLLECTIONS_TO_BACKUP = ["users", "clients", "invoices", "projects", "products", "payments", "documents"] as const;

function buildBackupPrefix(tenantId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${tenantId}/${timestamp}`;
}

async function backupCollection(tenantId: string, backupPath: string, collectionName: string) {
  const docsSnap = await firestore.collection("tenants").doc(tenantId).collection(collectionName).get();
  const data = docsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const file = admin.storage().bucket(storageBucket).file(`${backupPath}/${collectionName}.json`);
  await file.save(JSON.stringify(data), {
    contentType: "application/json",
    metadata: {
      metadata: {
        tenantId,
        collection: collectionName,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return { collectionName, count: data.length };
}

export const scheduledBackup = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const tenantsSnap = await firestore.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      const backupPath = buildBackupPrefix(tenantId);

      try {
        const collectionResults = await Promise.all(
          COLLECTIONS_TO_BACKUP.map((collectionName) => backupCollection(tenantId, backupPath, collectionName))
        );

        await firestore.collection("backups").add({
          tenantId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          storagePath: backupPath,
          collections: COLLECTIONS_TO_BACKUP,
          status: "completed",
          counts: Object.fromEntries(collectionResults.map((result) => [result.collectionName, result.count])),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error(`[scheduledBackup] Backup failed for tenant ${tenantId}:`, error);

        await firestore.collection("backups").add({
          tenantId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          storagePath: backupPath,
          collections: COLLECTIONS_TO_BACKUP,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown backup error",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    console.log("[scheduledBackup] Backup job completed.");
    return null;
  });
