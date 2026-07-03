import { adminDb } from '@/lib/firebaseAdmin';
import {
  CACHE_TTL_SECONDS,
  cacheKeys,
  deleteCached,
  getCached,
  setCached,
} from '@/lib/cache/redis-client';
import type {
  FieldAccess,
  PermissionAction,
  PermissionCheckInput,
  PermissionCheckResult,
  PermissionSet,
  RoleAssignmentDocument,
  RoleDocument,
  UserPermissionSnapshot,
} from '@/lib/permissions/types';

const MEMORY_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS.userPermissions;
const memoryCache = new Map<string, { expiresAt: number; value: UserPermissionSnapshot }>();
const FIELD_ACCESS_WEIGHT: Record<FieldAccess, number> = { hidden: 0, read: 1, write: 2 };

function normalizeString(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function matchesScope(permission: PermissionSet, module: string, entity: string) {
  const permissionModule = normalizeString(permission.module);
  const permissionEntity = normalizeString(permission.entity);
  const inputModule = normalizeString(module);
  const inputEntity = normalizeString(entity);

  const moduleMatch = permissionModule === inputModule || permissionModule === '*';
  const entityMatch = permissionEntity === inputEntity || permissionEntity === '*';

  return moduleMatch && entityMatch;
}

function mergePermissionSets(permissionSets: PermissionSet[]) {
  const mergedByScope = new Map<string, PermissionSet>();

  for (const set of permissionSets) {
    const scopeKey = `${normalizeString(set.module)}:${normalizeString(set.entity)}`;
    const existing = mergedByScope.get(scopeKey);
    if (!existing) {
      mergedByScope.set(scopeKey, {
        module: normalizeString(set.module),
        entity: normalizeString(set.entity),
        actions: [
          ...new Set(set.actions.map((action) => normalizeString(action) as PermissionAction)),
        ],
        ownOnly: !!set.ownOnly,
        fields: set.fields ? { ...set.fields } : undefined,
      });
      continue;
    }

    existing.actions = [
      ...new Set([
        ...existing.actions,
        ...set.actions.map((action) => normalizeString(action) as PermissionAction),
      ]),
    ];
    existing.ownOnly = !!existing.ownOnly || !!set.ownOnly;

    if (set.fields) {
      existing.fields = existing.fields || {};
      for (const [field, level] of Object.entries(set.fields)) {
        const current = existing.fields[field] || 'hidden';
        existing.fields[field] =
          FIELD_ACCESS_WEIGHT[level] >= FIELD_ACCESS_WEIGHT[current] ? level : current;
      }
    }
  }

  return Array.from(mergedByScope.values());
}

async function fetchAssignedRoles(tenantId: string, userId: string): Promise<RoleDocument[]> {
  const assignmentsSnap = await adminDb
    .collection('permission_role_assignments')
    .where('tenantId', '==', tenantId)
    .where('userId', '==', userId)
    .get();

  const assignments = assignmentsSnap.docs.map((doc) => doc.data() as RoleAssignmentDocument);
  if (!assignments.length) return [];

  const roleDocPromises = assignments.map((assignment) =>
    adminDb.collection('permission_roles').doc(assignment.roleId).get(),
  );
  const roleDocs = await Promise.all(roleDocPromises);

  return roleDocs
    .filter((doc) => doc.exists)
    .map((doc) => {
      const data = doc.data() as Omit<RoleDocument, 'id'>;
      return {
        id: doc.id,
        ...data,
      };
    })
    .filter((role) => role.tenantId === tenantId);
}

async function resolveRoleHierarchy(tenantId: string, startingRoles: RoleDocument[]) {
  const resolved = new Map<string, RoleDocument>();
  const queue = [...startingRoles];

  while (queue.length) {
    const current = queue.shift();
    if (!current || resolved.has(current.id)) continue;
    resolved.set(current.id, current);

    if (current.parentRoleId) {
      const parentDoc = await adminDb
        .collection('permission_roles')
        .doc(current.parentRoleId)
        .get();
      if (parentDoc.exists) {
        const data = parentDoc.data() as Omit<RoleDocument, 'id'>;
        if (data.tenantId === tenantId) {
          queue.push({ id: parentDoc.id, ...data });
        }
      }
    }
  }

  return Array.from(resolved.values());
}

export async function invalidateUserPermissionCache(tenantId: string, userId: string) {
  const key = cacheKeys.userPermissions(tenantId, userId);
  memoryCache.delete(key);

  await deleteCached(key);
}

export async function buildUserPermissionSnapshot(
  tenantId: string,
  userId: string,
): Promise<UserPermissionSnapshot> {
  const key = cacheKeys.userPermissions(tenantId, userId);
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
    return memoryEntry.value;
  }

  const redisEntry = await getCached<UserPermissionSnapshot>(key);
  if (redisEntry) {
    memoryCache.set(key, {
      expiresAt: Date.now() + MEMORY_CACHE_TTL_SECONDS * 1000,
      value: redisEntry,
    });
    return redisEntry;
  }

  const directRoles = await fetchAssignedRoles(tenantId, userId);
  const allRoles = await resolveRoleHierarchy(tenantId, directRoles);
  const mergedPermissions = mergePermissionSets(allRoles.flatMap((role) => role.permissions || []));

  const snapshot: UserPermissionSnapshot = {
    tenantId,
    userId,
    roleIds: allRoles.map((role) => role.id),
    roles: allRoles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      parentRoleId: role.parentRoleId || null,
    })),
    permissions: mergedPermissions,
  };

  memoryCache.set(key, {
    expiresAt: Date.now() + MEMORY_CACHE_TTL_SECONDS * 1000,
    value: snapshot,
  });
  await setCached(key, snapshot, CACHE_TTL_SECONDS.userPermissions, [
    `tenant:${tenantId}:permissions`,
    `user:${userId}:permissions`,
  ]);

  return snapshot;
}

function evaluateFieldAccess(permission: PermissionSet, field?: string): FieldAccess {
  if (!field) return 'write';
  if (!permission.fields || !(field in permission.fields)) return 'write';
  return permission.fields[field] || 'hidden';
}

export async function checkPermission(input: PermissionCheckInput): Promise<PermissionCheckResult> {
  const snapshot = await buildUserPermissionSnapshot(input.tenantId, input.userId);

  const candidatePermissions = snapshot.permissions.filter((permission) =>
    matchesScope(permission, input.module, input.entity),
  );
  if (!candidatePermissions.length) {
    return {
      allowed: false,
      fieldAccess: 'hidden',
      reason: 'No permission set found for module/entity.',
    };
  }

  const allowedByAction = candidatePermissions.filter((permission) =>
    permission.actions.includes(input.action),
  );
  if (!allowedByAction.length) {
    return {
      allowed: false,
      fieldAccess: 'hidden',
      reason: `Action ${input.action} is not allowed.`,
    };
  }

  const ownershipRestricted = allowedByAction.some((permission) => permission.ownOnly);
  if (ownershipRestricted && input.ownerId && input.ownerId !== input.userId) {
    return {
      allowed: false,
      fieldAccess: 'hidden',
      reason: 'Permission is limited to owned records.',
    };
  }

  const fieldAccess = allowedByAction.reduce<FieldAccess>((access, permission) => {
    const candidate = evaluateFieldAccess(permission, input.field);
    return FIELD_ACCESS_WEIGHT[candidate] > FIELD_ACCESS_WEIGHT[access] ? candidate : access;
  }, 'hidden');

  if (input.field && fieldAccess === 'hidden') {
    return { allowed: false, fieldAccess: 'hidden', reason: 'Field is hidden by role policy.' };
  }

  return { allowed: true, fieldAccess };
}

export async function assignRolesToUser(params: {
  tenantId: string;
  userId: string;
  roleIds: string[];
  actorUserId: string;
}) {
  const now = Date.now();
  const existingAssignments = await adminDb
    .collection('permission_role_assignments')
    .where('tenantId', '==', params.tenantId)
    .where('userId', '==', params.userId)
    .get();

  const batch = adminDb.batch();
  existingAssignments.docs.forEach((doc) => batch.delete(doc.ref));

  for (const roleId of params.roleIds) {
    const ref = adminDb.collection('permission_role_assignments').doc();
    const assignment: RoleAssignmentDocument = {
      id: ref.id,
      tenantId: params.tenantId,
      userId: params.userId,
      roleId,
      assignedBy: params.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, assignment);
  }

  await batch.commit();
  await invalidateUserPermissionCache(params.tenantId, params.userId);
}
