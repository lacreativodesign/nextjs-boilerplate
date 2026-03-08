import {
  getCurrentUser as baseGetCurrentUser,
  isAdminRole as baseIsAdminRole,
  isSuperAdmin as baseIsSuperAdmin,
  CurrentUser as BaseCurrentUser,
} from "../_utils";

export type CurrentUser = BaseCurrentUser;

export const getCurrentUser = baseGetCurrentUser;
export const isAdminRole = baseIsAdminRole;
export const isSuperAdmin = baseIsSuperAdmin;
