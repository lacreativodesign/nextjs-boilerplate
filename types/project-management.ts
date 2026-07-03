import type { Timestamp } from 'firebase-admin/firestore';

export type ProjectStatus =
  'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived';

export type ProjectCategory =
  | 'internal'
  | 'client_project'
  | 'product_development'
  | 'marketing'
  | 'sales'
  | 'operations'
  | 'other';

export interface ProjectLink {
  title: string;
  url: string;
  type: 'figma' | 'github' | 'drive' | 'other';
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  category: ProjectCategory;
  tags: string[];
  budget?: number;
  budgetCurrency: string;
  hourlyRate?: number;
  billable: boolean;
  startDate: Timestamp;
  endDate?: Timestamp;
  estimatedHours?: number;
  status: ProjectStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  managerId: string;
  managerName: string;
  teamMemberIds: string[];
  visibility: 'private' | 'team' | 'organization';
  totalTasks: number;
  completedTasks: number;
  totalHoursLogged: number;
  totalCost: number;
  attachments: string[];
  links?: ProjectLink[];
  settings: {
    allowTimeTracking: boolean;
    requireApproval: boolean;
    notifyOnStatusChange: boolean;
    autoArchive: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
  completedAt?: Timestamp;
}

export type TaskStatus =
  'todo' | 'in_progress' | 'in_review' | 'blocked' | 'completed' | 'cancelled';

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  title: string;
  description?: string;
  code?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  assignedToName?: string;
  assignedBy: string;
  assignedByName: string;
  startDate?: Timestamp;
  dueDate?: Timestamp;
  estimatedHours?: number;
  progress: number;
  actualHours?: number;
  milestoneId?: string;
  milestoneName?: string;
  tags: string[];
  dependsOn: string[];
  blockedBy: string[];
  hasSubtasks: boolean;
  parentTaskId?: string;
  subtaskCount?: number;
  completedSubtaskCount?: number;
  checklist?: TaskChecklistItem[];
  attachments: string[];
  commentCount: number;
  lastActivityAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface Milestone {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  name: string;
  description?: string;
  dueDate: Timestamp;
  status: 'upcoming' | 'in_progress' | 'completed' | 'overdue';
  progress: number;
  taskIds: string[];
  totalTasks: number;
  completedTasks: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface TimeEntry {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  taskId?: string;
  taskTitle?: string;
  userId: string;
  userName: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  duration: number;
  billable: boolean;
  hourlyRate?: number;
  cost?: number;
  description?: string;
  tags: string[];
  isRunning: boolean;
  approved: boolean;
  invoiced: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TaskComment {
  id: string;
  tenantId: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  attachments?: string[];
  type: 'comment' | 'status_change' | 'assignment' | 'mention';
  metadata?: Record<string, any>;
  mentions: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp;
}

export interface TemplateTask {
  title: string;
  description?: string;
  estimatedHours?: number;
  priority: string;
  dayOffset: number;
}

export interface TemplateMilestone {
  name: string;
  description?: string;
  dayOffset: number;
}

export interface ProjectTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: ProjectCategory;
  defaultBudget?: number;
  defaultDuration?: number;
  defaultTasks: TemplateTask[];
  defaultMilestones: TemplateMilestone[];
  isPublic: boolean;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
