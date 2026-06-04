import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Returns all team member UIDs for teams led by managerUid within tenantId.
 * Always includes the manager's own UID.
 * Returns an empty array when the manager leads no teams (caller decides fallback behavior).
 */
export async function getTeamMemberIds(managerUid: string, tenantId: string): Promise<string[]> {
  const snap = await adminDb
    .collection("teams")
    .where("tenantId", "==", tenantId)
    .where("leaderId", "==", managerUid)
    .get();

  if (snap.empty) return [];

  const memberIds = new Set<string>([managerUid]);
  snap.docs.forEach((doc) => {
    const team = doc.data();
    (team.memberIds || []).forEach((id: string) => memberIds.add(id));
  });

  return Array.from(memberIds);
}
