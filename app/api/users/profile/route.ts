import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { UserService } from '@/lib/users/user-service';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * S20: user preferences had nowhere to be stored.
 *
 * The preferences screen collected a timezone, a date format and three notification
 * toggles, then "saved" them by setting a local `saved` flag and showing a success
 * message. Nothing was ever sent to the server: the user's choices were discarded the
 * moment they navigated away, while the UI told them it had worked.
 *
 * Preferences are validated here rather than accepted as an arbitrary blob, so a caller
 * cannot write unbounded keys onto their own user document.
 */
const preferencesSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
  emailNotifications: z.boolean().optional(),
  browserNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

const profileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional().nullable(),
  jobTitle: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  preferences: preferencesSchema.optional(),
});

export async function PATCH(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid data', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Update the users collection (displayName, phone, jobTitle, department, bio)
    const userUpdates: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.displayName !== undefined) userUpdates.displayName = data.displayName;
    if (data.displayName !== undefined) userUpdates.name = data.displayName;
    if (data.phone !== undefined) userUpdates.phone = data.phone;
    if (data.jobTitle !== undefined) userUpdates.jobTitle = data.jobTitle;
    if (data.department !== undefined) userUpdates.department = data.department;
    if (data.bio !== undefined) userUpdates.bio = data.bio;

    // S20: merge rather than replace, so updating one toggle does not wipe the others.
    if (data.preferences !== undefined) {
      Object.entries(data.preferences).forEach(([key, value]) => {
        if (value !== undefined) userUpdates[`preferences.${key}`] = value;
      });
    }

    await adminDb.collection('users').doc(me.uid).update(userUpdates);

    // Also update user_profiles if it exists
    const profileRef = adminDb.collection('user_profiles').doc(me.uid);
    const profileSnap = await profileRef.get();
    const profileUpdates: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.displayName !== undefined) profileUpdates.name = data.displayName;
    if (data.phone !== undefined) profileUpdates.phoneNumber = data.phone;
    if (data.jobTitle !== undefined) profileUpdates.title = data.jobTitle;
    if (data.department !== undefined) profileUpdates.department = data.department;
    if (data.bio !== undefined) profileUpdates.bio = data.bio;
    profileUpdates['onboardingSteps.profileSetup'] = true;

    if (profileSnap.exists) {
      await profileRef.update(profileUpdates);
    } else {
      await profileRef.set({
        ...profileUpdates,
        tenantId: me.tenantId,
        userId: me.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log activity
    try {
      await UserService.logActivity({
        tenantId: me.tenantId,
        userId: me.uid,
        type: 'profile_update',
        action: 'updated own profile',
        resourceType: 'user_profile',
        resourceId: me.uid,
        resourceName: data.displayName || me.uid,
      });
    } catch {
      // Activity log failure should not block the response
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[PROFILE_PATCH]', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to update profile' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userDoc = await adminDb.collection('users').doc(me.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const data = userDoc.data() || {};

    return NextResponse.json({
      ok: true,
      profile: {
        uid: me.uid,
        email: data.email || '',
        displayName: data.displayName || data.name || '',
        phone: data.phone || '',
        jobTitle: data.jobTitle || data.title || '',
        department: data.department || '',
        bio: data.bio || '',
        avatarUrl: data.avatarUrl || data.photoURL || '',
        role: data.role || '',
        tenantId: data.tenantId || '',
        preferences: {
          timezone: data.preferences?.timezone || 'UTC',
          dateFormat: data.preferences?.dateFormat || 'DD/MM/YYYY',
          emailNotifications: data.preferences?.emailNotifications ?? true,
          browserNotifications: data.preferences?.browserNotifications ?? false,
          weeklyDigest: data.preferences?.weeklyDigest ?? true,
        },
      },
    });
  } catch (error: any) {
    console.error('[PROFILE_GET]', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load profile' },
      { status: 500 },
    );
  }
}
