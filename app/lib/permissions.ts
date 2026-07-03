export type Role =
  | 'super_admin'
  | 'admin'
  | 'sales_manager'
  | 'sales'
  | 'am_manager'
  | 'am'
  | 'production_manager'
  | 'production'
  | 'finance'
  | 'hr'
  | 'client';

export enum Permission {
  ViewClients = 'view_clients',
  EditClients = 'edit_clients',
  CreateProjects = 'create_projects',
  MoveProjectStage = 'move_project_stage',
  AssignProject = 'assign_project',
  MarkPaymentPaid = 'mark_payment_paid',
  ViewFinance = 'view_finance',
  EditFinance = 'edit_finance',
  ManageUsers = 'manage_users',
  ManageRoles = 'manage_roles',
  ViewReports = 'view_reports',
  ManageTenant = 'manage_tenant',
}

const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  sales_manager: [Permission.ViewClients, Permission.EditClients, Permission.ViewReports],
  sales: [Permission.ViewClients],
  am_manager: [Permission.CreateProjects, Permission.MoveProjectStage, Permission.AssignProject],
  am: [Permission.MoveProjectStage],
  production_manager: [Permission.MoveProjectStage, Permission.AssignProject],
  production: [Permission.MoveProjectStage],
  finance: [Permission.ViewFinance, Permission.EditFinance, Permission.MarkPaymentPaid],
  hr: [Permission.ManageUsers],
  client: [],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const normalized = String(role || '').toLowerCase() as Role;
  const allowed = ROLE_PERMISSIONS[normalized];
  if (!allowed) return false;
  return allowed.includes(permission);
}

export function assertPermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error('Permission denied');
  }
}
