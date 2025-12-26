import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

type EmailEventInput = {
  templateId: "payment_confirmation" | "welcome_client" | "account_activation" | string;
  to: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sequence?: number;
};

export async function queueEmailEvent({ templateId, to, data, metadata, sequence }: EmailEventInput) {
  const ref = adminDb.collection("email_events").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Template IDs are placeholders until the final email templates are wired in.
  await ref.set({
    templateId,
    to,
    data,
    metadata: metadata || {},
    sequence: sequence ?? null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  return { id: ref.id };
}
