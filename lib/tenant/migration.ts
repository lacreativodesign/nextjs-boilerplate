import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

const MIGRATION_COLLECTIONS = [
  "users",
  "clients",
  "projects",
  "files",
  "changeRequests",
  "change_requests",
  "events",
  "eventsQueue",
  "notifications",
  "emails",
  "email_events",
  "invoices",
  "payments",
  "expenses",
  "payroll",
  "leads",
  "deals",
  "sales_targets",
  "activity_logs",
  "employees",
  "attendance",
  "attendance_logs",
  "onboardingTasks",
  "onboardingTemplates",
  "performanceReviews",
  "employeeDocuments",
  "hrSettings",
];

export async function migrateMissingTenantIds(tenantId = DEFAULT_TENANT_ID) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const collectionName of MIGRATION_COLLECTIONS) {
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let updatedCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = adminDb.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(300);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snap = await query.get();
      if (snap.empty) break;

      const batch = adminDb.batch();
      let hasUpdates = false;

      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        if (data.tenantId === undefined || data.tenantId === null || data.tenantId === "") {
          batch.set(
            doc.ref,
            {
              tenantId,
              updatedAt: now,
            },
            { merge: true }
          );
          hasUpdates = true;
          updatedCount += 1;
        }
      });

      if (hasUpdates) {
        await batch.commit();
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 300) break;
    }

    if (updatedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[tenant-migration] ${collectionName}: updated ${updatedCount} docs`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[tenant-migration] ${collectionName}: no updates needed`);
    }
  }
}
