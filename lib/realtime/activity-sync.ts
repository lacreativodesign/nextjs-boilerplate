import { db } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

export interface Activity {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export async function publishActivity(activity: Omit<Activity, 'id' | 'timestamp'>) {
  const docRef = await db.collection('activities').add({
    ...activity,
    timestamp: Timestamp.now(),
    createdAt: Timestamp.now()
  });
  return docRef.id;
}

export async function getActivities(tenantId: string, limit = 50) {
  const snapshot = await db
    .collection('activities')
    .where('tenantId', '==', tenantId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp.toDate()
  })) as Activity[];
}
