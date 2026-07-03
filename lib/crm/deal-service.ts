import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { CustomerService } from '@/lib/crm/customer-service';
import { NotificationService } from '@/lib/notifications/notification-service';
import { Deal } from '@/types/crm';

export class DealService {
  static async createDeal(params: {
    tenantId: string;
    name: string;
    description?: string;
    customerId: string;
    customerName: string;
    value: number;
    currency: string;
    pipelineId: string;
    pipelineName: string;
    stage: string;
    stageName: string;
    stageOrder: number;
    probability: number;
    ownerId: string;
    ownerName: string;
    expectedCloseDate: Date;
    source?: string;
  }): Promise<string> {
    const deal: Omit<Deal, 'id'> = {
      tenantId: params.tenantId,
      name: params.name,
      description: params.description,
      customerId: params.customerId,
      customerName: params.customerName,
      value: params.value,
      currency: params.currency,
      probability: params.probability,
      expectedRevenue: params.value * (params.probability / 100),
      pipelineId: params.pipelineId,
      pipelineName: params.pipelineName,
      stage: params.stage,
      stageName: params.stageName,
      stageOrder: params.stageOrder,
      status: 'open',
      priority: 'medium',
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      expectedCloseDate: Timestamp.fromDate(params.expectedCloseDate),
      source: params.source,
      activitiesCount: 0,
      notesCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection('deals').add(deal);

    await adminDb
      .collection('customers')
      .doc(params.customerId)
      .update({
        totalDeals: admin.firestore.FieldValue.increment(1),
        openDeals: admin.firestore.FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

    await adminDb
      .collection('pipelines')
      .doc(params.pipelineId)
      .update({
        dealsCount: admin.firestore.FieldValue.increment(1),
        totalValue: admin.firestore.FieldValue.increment(params.value),
        updatedAt: Timestamp.now(),
      });

    await CustomerService.logActivity({
      tenantId: params.tenantId,
      customerId: params.customerId,
      customerName: params.customerName,
      dealId: docRef.id,
      dealName: params.name,
      type: 'note',
      subject: 'Deal created',
      description: `New deal created: ${params.name}`,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      status: 'completed',
    });

    return docRef.id;
  }

  static async moveDealToStage(params: {
    dealId: string;
    newStage: string;
    newStageName: string;
    newStageOrder: number;
    probability: number;
    userId: string;
    userName: string;
  }): Promise<void> {
    const dealDoc = await adminDb.collection('deals').doc(params.dealId).get();

    if (!dealDoc.exists) {
      throw new Error('Deal not found');
    }

    const deal = dealDoc.data() as Deal;

    await dealDoc.ref.update({
      stage: params.newStage,
      stageName: params.newStageName,
      stageOrder: params.newStageOrder,
      probability: params.probability,
      expectedRevenue: deal.value * (params.probability / 100),
      updatedAt: Timestamp.now(),
    });

    await CustomerService.logActivity({
      tenantId: deal.tenantId,
      customerId: deal.customerId,
      customerName: deal.customerName,
      dealId: params.dealId,
      dealName: deal.name,
      type: 'note',
      subject: 'Deal stage changed',
      description: `Moved from ${deal.stageName} to ${params.newStageName}`,
      ownerId: params.userId,
      ownerName: params.userName,
      status: 'completed',
    });
  }

  static async winDeal(params: {
    dealId: string;
    actualCloseDate?: Date;
    userId: string;
    userName: string;
  }): Promise<void> {
    const dealDoc = await adminDb.collection('deals').doc(params.dealId).get();

    if (!dealDoc.exists) {
      throw new Error('Deal not found');
    }

    const deal = dealDoc.data() as Deal;
    const closeDate = params.actualCloseDate
      ? Timestamp.fromDate(params.actualCloseDate)
      : Timestamp.now();

    await dealDoc.ref.update({
      status: 'won',
      actualCloseDate: closeDate,
      wonAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await adminDb
      .collection('customers')
      .doc(deal.customerId)
      .update({
        totalRevenue: admin.firestore.FieldValue.increment(deal.value),
        openDeals: admin.firestore.FieldValue.increment(-1),
        status: 'won',
        updatedAt: Timestamp.now(),
      });

    await CustomerService.logActivity({
      tenantId: deal.tenantId,
      customerId: deal.customerId,
      customerName: deal.customerName,
      dealId: params.dealId,
      dealName: deal.name,
      type: 'note',
      subject: 'Deal won! 🎉',
      description: `Deal closed successfully: ${deal.currency} ${deal.value}`,
      ownerId: params.userId,
      ownerName: params.userName,
      status: 'completed',
    });

    if (deal.ownerId !== params.userId) {
      await NotificationService.send({
        tenantId: deal.tenantId,
        userId: deal.ownerId,
        userEmail: '',
        type: 'success',
        title: 'Deal won!',
        message: `${params.userName} marked "${deal.name}" as won`,
        category: 'sales',
        priority: 'high',
        actionUrl: `/dashboard/crm/deals/${params.dealId}`,
      });
    }
  }

  static async loseDeal(params: {
    dealId: string;
    lostReason: string;
    lostNotes?: string;
    userId: string;
    userName: string;
  }): Promise<void> {
    const dealDoc = await adminDb.collection('deals').doc(params.dealId).get();

    if (!dealDoc.exists) {
      throw new Error('Deal not found');
    }

    const deal = dealDoc.data() as Deal;

    await dealDoc.ref.update({
      status: 'lost',
      lostReason: params.lostReason,
      lostNotes: params.lostNotes,
      lostAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await adminDb
      .collection('customers')
      .doc(deal.customerId)
      .update({
        openDeals: admin.firestore.FieldValue.increment(-1),
        updatedAt: Timestamp.now(),
      });

    await CustomerService.logActivity({
      tenantId: deal.tenantId,
      customerId: deal.customerId,
      customerName: deal.customerName,
      dealId: params.dealId,
      dealName: deal.name,
      type: 'note',
      subject: 'Deal lost',
      description: `Deal lost. Reason: ${params.lostReason}`,
      ownerId: params.userId,
      ownerName: params.userName,
      status: 'completed',
    });
  }
}
