import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { hashInviteToken } from '@/lib/clientInvites';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import type {
  ActivityType,
  UserActivity,
  UserInvitation,
  UserProfile,
} from '@/types/user-management';

const INVITE_EXPIRY_DAYS = 7;

export class UserService {
  static async inviteUser(params: {
    tenantId: string;
    email: string;
    role: string;
    teamIds?: string[];
    invitedBy: string;
    invitedByEmail: string;
  }): Promise<string> {
    const normalizedEmail = params.email.toLowerCase();

    const existingUser = await this.getUserByEmail(normalizedEmail, params.tenantId);
    if (existingUser) {
      throw new Error('User already exists in this tenant');
    }

    const existingInvite = await adminDb
      .collection('user_invitations')
      .where('tenantId', '==', params.tenantId)
      .where('email', '==', normalizedEmail)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingInvite.empty) {
      throw new Error('Pending invitation already exists for this email');
    }

    if (params.teamIds && params.teamIds.length > 0) {
      const teamIds = Array.from(new Set(params.teamIds));
      const fetchedTeamIds = new Set<string>();

      for (let i = 0; i < teamIds.length; i += 10) {
        const batchIds = teamIds.slice(i, i + 10);
        const teamSnapshot = await adminDb
          .collection('teams')
          .where(admin.firestore.FieldPath.documentId(), 'in', batchIds)
          .get();

        for (const doc of teamSnapshot.docs) {
          fetchedTeamIds.add(doc.id);
          const teamTenantId = doc.data()?.tenantId as string | undefined;
          if (teamTenantId !== params.tenantId) {
            throw new Error('One or more teams belong to a different tenant');
          }
        }
      }

      const invalidTeamIds = teamIds.filter((teamId) => !fetchedTeamIds.has(teamId));
      if (invalidTeamIds.length > 0) {
        throw new Error('One or more teams do not exist');
      }
    }

    const token = crypto.randomBytes(32).toString('hex');

    const invitation: Omit<UserInvitation, 'id'> = {
      tenantId: params.tenantId,
      email: normalizedEmail,
      role: params.role,
      teamIds: params.teamIds,
      invitedBy: params.invitedBy,
      invitedByEmail: params.invitedByEmail,
      status: 'pending',
      tokenHash: hashInviteToken(token),
      expiresAt: Timestamp.fromDate(
        new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      ),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection('user_invitations').add(invitation);

    await this.sendInvitationEmail({
      email: normalizedEmail,
      token,
      invitedByEmail: params.invitedByEmail,
    });

    await docRef.update({
      emailSentAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await this.logActivity({
      tenantId: params.tenantId,
      userId: params.invitedBy,
      type: 'create',
      action: 'invited user',
      description: `Invitation sent to ${normalizedEmail}.`,
      resourceType: 'user_invitation',
      resourceId: docRef.id,
      resourceName: normalizedEmail,
    });

    return docRef.id;
  }

  static async acceptInvitation(params: {
    token: string;
    name: string;
    password: string;
  }): Promise<string> {
    const inviteSnapshot = await adminDb
      .collection('user_invitations')
      .where('tokenHash', '==', hashInviteToken(params.token))
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (inviteSnapshot.empty) {
      throw new Error('Invalid or expired invitation');
    }

    const inviteDoc = inviteSnapshot.docs[0];
    const invitation = inviteDoc.data() as UserInvitation;

    if (invitation.expiresAt.toDate() < new Date()) {
      await inviteDoc.ref.update({ status: 'expired', updatedAt: Timestamp.now() });
      throw new Error('Invitation has expired');
    }

    const userRecord = await adminAuth.createUser({
      email: invitation.email,
      password: params.password,
      displayName: params.name,
      emailVerified: true,
    });

    try {
      const userDoc = {
        email: invitation.email,
        name: params.name,
        role: invitation.role,
        tenantId: invitation.tenantId,
        isActive: true,
        mfaEnabled: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const profile: Omit<UserProfile, 'id'> = {
        tenantId: invitation.tenantId,
        email: invitation.email,
        name: params.name,
        role: invitation.role,
        teamIds: invitation.teamIds || [],
        preferences: {
          emailNotifications: true,
          desktopNotifications: true,
          weeklyDigest: true,
        },
        onboardingCompleted: false,
        onboardingSteps: {
          profileSetup: false,
          teamJoined: (invitation.teamIds || []).length > 0,
          firstLogin: false,
          tourCompleted: false,
        },
        loginCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const batch = adminDb.batch();
      batch.set(adminDb.collection('users').doc(userRecord.uid), userDoc);
      batch.set(adminDb.collection('user_profiles').doc(userRecord.uid), profile);
      batch.update(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        acceptedByUserId: userRecord.uid,
        updatedAt: Timestamp.now(),
      });

      if (invitation.teamIds && invitation.teamIds.length > 0) {
        for (const teamId of invitation.teamIds) {
          const teamRef = adminDb.collection('teams').doc(teamId);
          batch.update(teamRef, {
            memberIds: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
            memberCount: admin.firestore.FieldValue.increment(1),
            updatedAt: Timestamp.now(),
          });
        }
      }

      await batch.commit();

      await this.logActivity({
        tenantId: invitation.tenantId,
        userId: userRecord.uid,
        type: 'create',
        action: 'accepted invitation',
        description: 'Invitation accepted and user account created.',
        resourceType: 'user',
        resourceId: userRecord.uid,
        resourceName: params.name,
      });

      return userRecord.uid;
    } catch (error) {
      await adminAuth.deleteUser(userRecord.uid);
      throw error;
    }
  }

  static async createUserProfile(params: {
    userId: string;
    tenantId: string;
    email: string;
    name: string;
    role: string;
    teamIds: string[];
  }): Promise<void> {
    const profile: Omit<UserProfile, 'id'> = {
      tenantId: params.tenantId,
      email: params.email,
      name: params.name,
      role: params.role,
      teamIds: params.teamIds,
      preferences: {
        emailNotifications: true,
        desktopNotifications: true,
        weeklyDigest: true,
      },
      onboardingCompleted: false,
      onboardingSteps: {
        profileSetup: false,
        teamJoined: params.teamIds.length > 0,
        firstLogin: false,
        tourCompleted: false,
      },
      loginCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb.collection('user_profiles').doc(params.userId).set(profile);
  }

  static async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    await adminDb
      .collection('user_profiles')
      .doc(userId)
      .update({
        ...updates,
        updatedAt: Timestamp.now(),
      });
  }

  static async getUserByEmail(email: string, tenantId: string): Promise<any> {
    const snapshot = await adminDb
      .collection('users')
      .where('email', '==', email.toLowerCase())
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  static async addUserToTeams(userId: string, teamIds: string[]): Promise<void> {
    const batch = adminDb.batch();

    for (const teamId of teamIds) {
      const teamRef = adminDb.collection('teams').doc(teamId);
      batch.update(teamRef, {
        memberIds: admin.firestore.FieldValue.arrayUnion(userId),
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    }

    const profileRef = adminDb.collection('user_profiles').doc(userId);
    batch.set(
      profileRef,
      {
        teamIds: admin.firestore.FieldValue.arrayUnion(...teamIds),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    await batch.commit();
  }

  static async removeUserFromTeam(userId: string, teamId: string): Promise<void> {
    const batch = adminDb.batch();

    const teamRef = adminDb.collection('teams').doc(teamId);
    batch.update(teamRef, {
      memberIds: admin.firestore.FieldValue.arrayRemove(userId),
      memberCount: admin.firestore.FieldValue.increment(-1),
      updatedAt: Timestamp.now(),
    });

    const profileRef = adminDb.collection('user_profiles').doc(userId);
    batch.update(profileRef, {
      teamIds: admin.firestore.FieldValue.arrayRemove(teamId),
      updatedAt: Timestamp.now(),
    });

    await batch.commit();
  }

  static async deactivateUser(userId: string): Promise<void> {
    await adminAuth.updateUser(userId, { disabled: true });

    await adminDb.collection('users').doc(userId).update({
      isActive: false,
      deactivatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  static async reactivateUser(userId: string): Promise<void> {
    await adminAuth.updateUser(userId, { disabled: false });

    await adminDb.collection('users').doc(userId).update({
      isActive: true,
      deactivatedAt: admin.firestore.FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
  }

  static async logActivity(params: {
    tenantId: string;
    userId: string;
    type: ActivityType;
    action: string;
    description?: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const activity: Omit<UserActivity, 'id'> = {
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      action: params.action,
      description: params.description,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: Timestamp.now(),
    };

    await adminDb.collection('user_activity').add(activity);

    await adminDb.collection('user_profiles').doc(params.userId).set(
      {
        lastActiveAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }

  private static async sendInvitationEmail(params: {
    email: string;
    token: string;
    invitedByEmail: string;
  }): Promise<void> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    if (!appUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL is not configured.');
    }

    const inviteUrl = `${appUrl}/invite/${params.token}`;

    await sendEmail({
      to: params.email,
      subject: "You've been invited to join our team",
      html: `
        <h2>You've been invited!</h2>
        <p>${params.invitedByEmail} has invited you to join their team.</p>
        <p>Click the link below to accept the invitation and create your account:</p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          Accept Invitation
        </a>
        <p>This invitation expires in ${INVITE_EXPIRY_DAYS} days.</p>
      `,
      text: `You've been invited by ${params.invitedByEmail}. Accept at: ${inviteUrl}`,
    });
  }

  static async updateLoginStats(userId: string): Promise<void> {
    await adminDb
      .collection('user_profiles')
      .doc(userId)
      .update({
        lastLoginAt: Timestamp.now(),
        loginCount: admin.firestore.FieldValue.increment(1),
        'onboardingSteps.firstLogin': true,
        updatedAt: Timestamp.now(),
      });
  }
}
