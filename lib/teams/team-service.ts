import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { Team, UserProfile } from "@/types/user-management";

export class TeamService {
  static async createTeam(params: {
    tenantId: string;
    name: string;
    description?: string;
    type: "department" | "project" | "working_group" | "custom";
    leaderId?: string;
    createdBy: string;
    parentTeamId?: string;
    color?: string;
    avatar?: string;
    isPrivate?: boolean;
    allowMemberInvites?: boolean;
    tags?: string[];
  }): Promise<string> {
    const team: Omit<Team, "id"> = {
      tenantId: params.tenantId,
      name: params.name,
      description: params.description,
      type: params.type,
      leaderId: params.leaderId,
      parentTeamId: params.parentTeamId,
      color: params.color,
      avatar: params.avatar,
      memberIds: [params.createdBy],
      memberCount: 1,
      isPrivate: params.isPrivate ?? false,
      allowMemberInvites: params.allowMemberInvites ?? true,
      tags: params.tags ?? [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      archivedAt: null,
    };

    const docRef = await adminDb.collection("teams").add(team);

    await adminDb
      .collection("user_profiles")
      .doc(params.createdBy)
      .set(
        {
          teamIds: admin.firestore.FieldValue.arrayUnion(docRef.id),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

    return docRef.id;
  }

  static async getTeamMembers(teamId: string): Promise<UserProfile[]> {
    const teamDoc = await adminDb.collection("teams").doc(teamId).get();

    if (!teamDoc.exists) {
      throw new Error("Team not found");
    }

    const team = teamDoc.data() as Team;
    const memberIds = team.memberIds || [];

    if (memberIds.length === 0) {
      return [];
    }

    const profiles: UserProfile[] = [];
    const batchSize = 10;
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      const snapshot = await adminDb
        .collection("user_profiles")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();

      profiles.push(
        ...snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as UserProfile
        )
      );
    }

    return profiles;
  }

  static async archiveTeam(teamId: string): Promise<void> {
    await adminDb.collection("teams").doc(teamId).update({
      archivedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Returns the set of user IDs belonging to the manager's team(s).
   * Returns null when the manager belongs to no team (caller should show all tenant data).
   */
  static async getManagerTeamMemberIds(
    uid: string,
    tenantId: string
  ): Promise<string[] | null> {
    const [leaderSnap, memberSnap] = await Promise.all([
      adminDb
        .collection("teams")
        .where("tenantId", "==", tenantId)
        .where("leaderId", "==", uid)
        .get(),
      adminDb
        .collection("teams")
        .where("tenantId", "==", tenantId)
        .where("memberIds", "array-contains", uid)
        .get(),
    ]);

    const teamDocs = new Map<string, any>();
    leaderSnap.docs.forEach((doc: any) => teamDocs.set(doc.id, doc.data()));
    memberSnap.docs.forEach((doc: any) => teamDocs.set(doc.id, doc.data()));

    if (teamDocs.size === 0) return null;

    const memberIds = new Set<string>([uid]);
    teamDocs.forEach((team) => {
      (team.memberIds || []).forEach((id: string) => memberIds.add(id));
      if (team.leaderId) memberIds.add(team.leaderId);
    });

    return Array.from(memberIds);
  }

  /**
   * Runs batched Firestore "in" queries (max 30 values per query) filtering
   * `baseQuery` by `field` matching any value in `memberIds`.
   */
  static async queryWithTeamFilter(
    baseQuery: any,
    field: string,
    memberIds: string[]
  ): Promise<any[]> {
    if (memberIds.length === 0) return [];
    const BATCH_SIZE = 30;
    const results = new Map<string, any>();
    for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
      const batch = memberIds.slice(i, i + BATCH_SIZE);
      const snap = await baseQuery.where(field, "in", batch).get();
      snap.docs.forEach((doc: any) => results.set(doc.id, doc));
    }
    return Array.from(results.values());
  }
}
