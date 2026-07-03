import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { NotificationService } from '@/lib/notifications/notification-service';
import { MilestoneService } from '@/lib/projects/milestone-service';
import { TaskService } from '@/lib/projects/task-service';
import type { Project, ProjectCategory, ProjectTemplate } from '@/types/project-management';

export class ProjectService {
  static async createProject(params: {
    tenantId: string;
    name: string;
    code: string;
    description?: string;
    clientId?: string;
    clientName?: string;
    category: ProjectCategory;
    budget?: number;
    startDate: Date;
    endDate?: Date;
    managerId: string;
    managerName: string;
    teamMemberIds: string[];
    billable: boolean;
  }): Promise<string> {
    const existingProject = await this.getProjectByCode(params.code, params.tenantId);
    if (existingProject) {
      throw new Error('Project code already exists');
    }

    const now = Timestamp.now();
    const project: Omit<Project, 'id'> = {
      tenantId: params.tenantId,
      name: params.name,
      code: params.code,
      description: params.description,
      clientId: params.clientId,
      clientName: params.clientName,
      category: params.category,
      tags: [],
      budget: params.budget,
      budgetCurrency: 'USD',
      billable: params.billable,
      startDate: Timestamp.fromDate(params.startDate),
      endDate: params.endDate ? Timestamp.fromDate(params.endDate) : undefined,
      status: 'planning',
      priority: 'medium',
      progress: 0,
      managerId: params.managerId,
      managerName: params.managerName,
      teamMemberIds: Array.from(new Set([params.managerId, ...params.teamMemberIds])),
      visibility: 'team',
      totalTasks: 0,
      completedTasks: 0,
      totalHoursLogged: 0,
      totalCost: 0,
      attachments: [],
      settings: {
        allowTimeTracking: true,
        requireApproval: false,
        notifyOnStatusChange: true,
        autoArchive: false,
      },
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection('projects').add(project);

    await Promise.all(
      project.teamMemberIds.map((memberId) =>
        NotificationService.send({
          tenantId: params.tenantId,
          userId: memberId,
          userEmail: '',
          type: 'info',
          title: 'Added to project',
          message: `You've been added to project: ${params.name}`,
          category: 'team',
          actionUrl: `/dashboard/projects/${docRef.id}`,
        }),
      ),
    );

    return docRef.id;
  }

  static async updateProjectProgress(projectId: string): Promise<void> {
    const tasksSnapshot = await adminDb
      .collection('tasks')
      .where('projectId', '==', projectId)
      .where('parentTaskId', '==', null)
      .get();

    const totalTasks = tasksSnapshot.size;
    const completedTasks = tasksSnapshot.docs.filter(
      (doc) => doc.data().status === 'completed',
    ).length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const updates: Record<string, unknown> = {
      totalTasks,
      completedTasks,
      progress,
      updatedAt: Timestamp.now(),
    };

    if (progress === 100) {
      updates.status = 'completed';
      updates.completedAt = Timestamp.now();
    }

    await adminDb.collection('projects').doc(projectId).update(updates);
  }

  static async getProjectByCode(
    code: string,
    tenantId: string,
  ): Promise<(Project & { id: string }) | null> {
    const snapshot = await adminDb
      .collection('projects')
      .where('tenantId', '==', tenantId)
      .where('code', '==', code)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as Omit<Project, 'id'>) };
  }

  static async generateProjectCode(tenantId: string): Promise<string> {
    const snapshot = await adminDb
      .collection('projects')
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return 'PRJ-001';
    }

    const lastCode = String(snapshot.docs[0].data().code || 'PRJ-000');
    const codeParts = lastCode.split('-');
    const numericPart = Number.parseInt(codeParts[1] || '0', 10);
    const nextNumber = Number.isFinite(numericPart) ? numericPart + 1 : 1;

    return `PRJ-${String(nextNumber).padStart(3, '0')}`;
  }

  static async createFromTemplate(params: {
    tenantId: string;
    templateId: string;
    name: string;
    managerId: string;
    managerName: string;
    startDate: Date;
  }): Promise<string> {
    const templateDoc = await adminDb.collection('project_templates').doc(params.templateId).get();
    if (!templateDoc.exists) {
      throw new Error('Template not found');
    }

    const template = templateDoc.data() as ProjectTemplate;
    const code = await this.generateProjectCode(params.tenantId);

    const projectId = await this.createProject({
      tenantId: params.tenantId,
      name: params.name,
      code,
      description: template.description,
      category: template.category,
      budget: template.defaultBudget,
      startDate: params.startDate,
      managerId: params.managerId,
      managerName: params.managerName,
      teamMemberIds: [params.managerId],
      billable: false,
    });

    for (const taskTemplate of template.defaultTasks || []) {
      const dueDate = new Date(params.startDate);
      dueDate.setDate(dueDate.getDate() + taskTemplate.dayOffset);

      await TaskService.createTask({
        tenantId: params.tenantId,
        projectId,
        projectName: params.name,
        title: taskTemplate.title,
        description: taskTemplate.description,
        priority: (taskTemplate.priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium',
        estimatedHours: taskTemplate.estimatedHours,
        dueDate,
        assignedBy: params.managerId,
        assignedByName: params.managerName,
      });
    }

    for (const milestoneTemplate of template.defaultMilestones || []) {
      const dueDate = new Date(params.startDate);
      dueDate.setDate(dueDate.getDate() + milestoneTemplate.dayOffset);

      await MilestoneService.createMilestone({
        tenantId: params.tenantId,
        projectId,
        projectName: params.name,
        name: milestoneTemplate.name,
        description: milestoneTemplate.description,
        dueDate,
      });
    }

    await templateDoc.ref.update({
      usageCount: admin.firestore.FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });

    return projectId;
  }

  static async archiveProject(projectId: string): Promise<void> {
    await adminDb.collection('projects').doc(projectId).update({
      status: 'archived',
      archivedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}
