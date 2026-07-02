import type { Timestamp } from "firebase-admin/firestore";

export type TeamType = "department" | "project" | "working_group" | "custom";

export interface Team {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  avatar?: string;
  color?: string;
  type: TeamType;
  parentTeamId?: string;
  memberIds: string[];
  memberCount: number;
  leaderId?: string;
  isPrivate: boolean;
  allowMemberInvites: boolean;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
}

export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface UserInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  teamIds?: string[];
  invitedBy: string;
  invitedByEmail: string;
  status: InvitationStatus;
  tokenHash: string;
  expiresAt: Timestamp;
  acceptedAt?: Timestamp;
  acceptedByUserId?: string;
  emailSentAt?: Timestamp;
  reminderSentAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserThemePreference = "light" | "dark" | "auto";

export interface UserProfile {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  title?: string;
  department?: string;
  avatar?: string;
  bio?: string;
  phoneNumber?: string;
  timezone?: string;
  language?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  teamIds: string[];
  primaryTeamId?: string;
  preferences: {
    emailNotifications: boolean;
    desktopNotifications: boolean;
    weeklyDigest: boolean;
    theme?: UserThemePreference;
  };
  skills?: string[];
  certifications?: string[];
  linkedIn?: string;
  github?: string;
  onboardingCompleted: boolean;
  onboardingSteps?: {
    profileSetup: boolean;
    teamJoined: boolean;
    firstLogin: boolean;
    tourCompleted: boolean;
  };
  lastLoginAt?: Timestamp;
  loginCount: number;
  lastActiveAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ActivityType =
  | "login"
  | "logout"
  | "create"
  | "update"
  | "delete"
  | "view"
  | "download"
  | "share"
  | "settings_change"
  | "profile_update"
  | "team_join"
  | "team_leave";

export interface UserActivity {
  id: string;
  tenantId: string;
  userId: string;
  type: ActivityType;
  action: string;
  description?: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Timestamp;
}
