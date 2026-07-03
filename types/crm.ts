import type { Timestamp } from 'firebase-admin/firestore';

export type CustomerType = 'lead' | 'prospect' | 'customer' | 'partner';

export type CustomerStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'inactive'
  | 'archived';

export type CustomerPriority = 'low' | 'medium' | 'high' | 'hot';

export interface Customer {
  id: string;
  tenantId: string;
  type: CustomerType;
  companyName?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  email: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  industry?: string;
  companySize?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  annualRevenue?: number;
  status: CustomerStatus;
  stage: string;
  stageName: string;
  leadSource?: string;
  ownerId: string;
  ownerName: string;
  leadScore: number;
  priority: CustomerPriority;
  accountManagerId?: string;
  accountManagerName?: string;
  parentCustomerId?: string;
  tags: string[];
  customFields?: Record<string, unknown>;
  linkedIn?: string;
  twitter?: string;
  totalDeals: number;
  totalRevenue: number;
  openDeals: number;
  lastContactedAt?: Timestamp;
  lastActivityAt?: Timestamp;
  emailOptIn: boolean;
  doNotCall: boolean;
  unsubscribedAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  convertedAt?: Timestamp;
  archivedAt?: Timestamp;
}

export type DealStatus = 'open' | 'won' | 'lost' | 'abandoned';

export interface DealProduct {
  productId?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Deal {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  customerId: string;
  customerName: string;
  value: number;
  currency: string;
  probability: number;
  expectedRevenue: number;
  pipelineId: string;
  pipelineName: string;
  stage: string;
  stageName: string;
  stageOrder: number;
  status: DealStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  ownerId: string;
  ownerName: string;
  expectedCloseDate: Timestamp;
  actualCloseDate?: Timestamp;
  source?: string;
  products?: DealProduct[];
  customFields?: Record<string, unknown>;
  activitiesCount: number;
  notesCount: number;
  lastActivityAt?: Timestamp;
  lostReason?: string;
  lostNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  wonAt?: Timestamp;
  lostAt?: Timestamp;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  probability: number;
  color?: string;
  rottenDays?: number;
}

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: 'sales' | 'custom';
  stages: PipelineStage[];
  isDefault: boolean;
  isActive: boolean;
  dealsCount: number;
  totalValue: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'task'
  | 'demo'
  | 'proposal'
  | 'follow_up'
  | 'note';

export interface Activity {
  id: string;
  tenantId: string;
  type: ActivityType;
  customerId?: string;
  customerName?: string;
  dealId?: string;
  dealName?: string;
  subject: string;
  description?: string;
  scheduledAt?: Timestamp;
  dueDate?: Timestamp;
  duration?: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  completedAt?: Timestamp;
  ownerId: string;
  ownerName: string;
  participants?: string[];
  outcome?: string;
  notes?: string;
  hasFollowUp: boolean;
  followUpDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerNote {
  id: string;
  tenantId: string;
  customerId: string;
  dealId?: string;
  content: string;
  isPinned: boolean;
  authorId: string;
  authorName: string;
  attachments?: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp;
}

export interface EmailTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: 'follow_up' | 'proposal' | 'welcome' | 'nurture' | 'other';
  subject: string;
  body: string;
  placeholders: string[];
  isActive: boolean;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
