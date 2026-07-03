import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { NotificationService } from '@/lib/notifications/notification-service';
import {
  Activity,
  ActivityType,
  Customer,
  CustomerNote,
  CustomerStatus,
  CustomerType,
} from '@/types/crm';
import { autoSyncCustomerIfEnabled } from '@/lib/integrations/mailchimp';

export class CustomerService {
  static async createCustomer(params: {
    tenantId: string;
    type: CustomerType;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    companyName?: string;
    jobTitle?: string;
    industry?: string;
    leadSource?: string;
    ownerId: string;
    ownerName: string;
    stage?: string;
    stageName?: string;
  }): Promise<string> {
    const existingCustomer = await this.getCustomerByEmail(params.email, params.tenantId);
    if (existingCustomer) {
      throw new Error('Customer with this email already exists');
    }

    const customer: Omit<Customer, 'id'> = {
      tenantId: params.tenantId,
      type: params.type,
      firstName: params.firstName,
      lastName: params.lastName,
      fullName: `${params.firstName} ${params.lastName}`.trim(),
      email: params.email.toLowerCase(),
      phone: params.phone,
      companyName: params.companyName,
      jobTitle: params.jobTitle,
      industry: params.industry,
      leadSource: params.leadSource,
      status: 'new',
      stage: params.stage || 'new',
      stageName: params.stageName || 'New',
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      leadScore: 0,
      priority: 'medium',
      tags: [],
      totalDeals: 0,
      totalRevenue: 0,
      openDeals: 0,
      emailOptIn: true,
      doNotCall: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection('customers').add(customer);

    await autoSyncCustomerIfEnabled({
      tenantId: params.tenantId,
      userUid: params.ownerId,
      customerId: docRef.id,
    }).catch(() => undefined);

    await this.logActivity({
      tenantId: params.tenantId,
      customerId: docRef.id,
      customerName: customer.fullName,
      type: 'note',
      subject: 'Customer created',
      description: `New ${params.type} added to CRM`,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      status: 'completed',
    });

    return docRef.id;
  }

  static async updateCustomerStatus(params: {
    customerId: string;
    status: CustomerStatus;
    userId: string;
    userName: string;
  }): Promise<void> {
    const customerDoc = await adminDb.collection('customers').doc(params.customerId).get();

    if (!customerDoc.exists) {
      throw new Error('Customer not found');
    }

    const customer = customerDoc.data() as Customer;

    await customerDoc.ref.update({
      status: params.status,
      updatedAt: Timestamp.now(),
      ...(params.status === 'won' && !customer.convertedAt
        ? {
            convertedAt: Timestamp.now(),
            type: 'customer',
          }
        : {}),
    });

    await this.logActivity({
      tenantId: customer.tenantId,
      customerId: params.customerId,
      customerName: customer.fullName,
      type: 'note',
      subject: 'Status changed',
      description: `Status changed from ${customer.status} to ${params.status}`,
      ownerId: params.userId,
      ownerName: params.userName,
      status: 'completed',
    });
  }

  static async updateLeadScore(customerId: string): Promise<void> {
    const customerDoc = await adminDb.collection('customers').doc(customerId).get();

    if (!customerDoc.exists) {
      return;
    }

    const customer = customerDoc.data() as Customer;
    let score = 0;

    if (customer.companySize === '500+') score += 20;
    else if (customer.companySize === '201-500') score += 15;
    else if (customer.companySize === '51-200') score += 10;

    if (customer.lastActivityAt) {
      const daysSinceActivity = Math.floor(
        (Date.now() - customer.lastActivityAt.toMillis()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceActivity < 7) score += 20;
      else if (daysSinceActivity < 30) score += 10;
    }

    if (customer.openDeals > 0) score += 15;
    if (customer.companyName && customer.industry && customer.website) score += 10;
    if (customer.emailOptIn) score += 5;

    score = Math.min(score, 100);

    let priority: Customer['priority'] = 'medium';
    if (score >= 80) priority = 'hot';
    else if (score >= 60) priority = 'high';
    else if (score < 30) priority = 'low';

    await customerDoc.ref.update({
      leadScore: score,
      priority,
      updatedAt: Timestamp.now(),
    });
  }

  static async getCustomerByEmail(
    email: string,
    tenantId: string,
  ): Promise<(Customer & { id: string }) | null> {
    const snapshot = await adminDb
      .collection('customers')
      .where('tenantId', '==', tenantId)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return {
      id: snapshot.docs[0].id,
      ...(snapshot.docs[0].data() as Omit<Customer, 'id'>),
    };
  }

  static async logActivity(params: {
    tenantId: string;
    customerId?: string;
    customerName?: string;
    dealId?: string;
    dealName?: string;
    type: ActivityType;
    subject: string;
    description?: string;
    ownerId: string;
    ownerName: string;
    status: 'scheduled' | 'completed' | 'cancelled';
    scheduledAt?: Date;
    dueDate?: Date;
    duration?: number;
    outcome?: string;
  }): Promise<string> {
    const activity: Omit<Activity, 'id'> = {
      tenantId: params.tenantId,
      customerId: params.customerId,
      customerName: params.customerName,
      dealId: params.dealId,
      dealName: params.dealName,
      type: params.type,
      subject: params.subject,
      description: params.description,
      status: params.status,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      scheduledAt: params.scheduledAt ? Timestamp.fromDate(params.scheduledAt) : undefined,
      dueDate: params.dueDate ? Timestamp.fromDate(params.dueDate) : undefined,
      duration: params.duration,
      outcome: params.outcome,
      hasFollowUp: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...(params.status === 'completed' ? { completedAt: Timestamp.now() } : {}),
    };

    const docRef = await adminDb.collection('activities').add(activity);

    if (params.customerId) {
      await adminDb.collection('customers').doc(params.customerId).update({
        lastActivityAt: Timestamp.now(),
      });
    }

    return docRef.id;
  }

  static async addNote(params: {
    tenantId: string;
    customerId: string;
    dealId?: string;
    content: string;
    authorId: string;
    authorName: string;
    isPinned?: boolean;
  }): Promise<string> {
    const note: Omit<CustomerNote, 'id'> = {
      tenantId: params.tenantId,
      customerId: params.customerId,
      dealId: params.dealId,
      content: params.content,
      isPinned: params.isPinned || false,
      authorId: params.authorId,
      authorName: params.authorName,
      createdAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection('customer_notes').add(note);

    await adminDb.collection('customers').doc(params.customerId).update({
      lastActivityAt: Timestamp.now(),
    });

    return docRef.id;
  }

  static async assignCustomer(params: {
    customerId: string;
    newOwnerId: string;
    newOwnerName: string;
    assignedBy: string;
    assignedByName: string;
  }): Promise<void> {
    const customerDoc = await adminDb.collection('customers').doc(params.customerId).get();

    if (!customerDoc.exists) {
      throw new Error('Customer not found');
    }

    const customer = customerDoc.data() as Customer;

    await customerDoc.ref.update({
      ownerId: params.newOwnerId,
      ownerName: params.newOwnerName,
      updatedAt: Timestamp.now(),
    });

    await NotificationService.send({
      tenantId: customer.tenantId,
      userId: params.newOwnerId,
      userEmail: '',
      type: 'action_required',
      title: 'New customer assigned',
      message: `${params.assignedByName} assigned ${customer.fullName} to you`,
      category: 'sales',
      actionUrl: `/dashboard/crm/customers/${params.customerId}`,
    });

    await this.logActivity({
      tenantId: customer.tenantId,
      customerId: params.customerId,
      customerName: customer.fullName,
      type: 'note',
      subject: 'Customer reassigned',
      description: `Assigned from ${customer.ownerName} to ${params.newOwnerName}`,
      ownerId: params.assignedBy,
      ownerName: params.assignedByName,
      status: 'completed',
    });
  }
}
