import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { NotificationService } from '@/lib/notifications/notification-service';
import { MilestoneService } from '@/lib/projects/milestone-service';
import { ProjectService } from '@/lib/projects/project-service';
import { sendBizostoEventNotification } from '@/lib/integrations/slack';
import type { Project, Task, TaskComment, TaskStatus, TimeEntry } from '@/types/project-management';

export class TaskService {
  static async createTask(params: {
    tenantId: string;
    projectId: string;
    projectName: string;
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assignedTo?: string;
    assignedToName?: string;
    assignedBy: string;
    assignedByName: string;
    dueDate?: Date;
    estimatedHours?: number;
    milestoneId?: string;
    parentTaskId?: string;
  }): Promise<string> {
    const now = Timestamp.now();
    const task: Omit<Task, 'id'> = {
      tenantId: params.tenantId,
      projectId: params.projectId,
      projectName: params.projectName,
      title: params.title,
      description: params.description,
      status: 'todo',
      priority: params.priority,
      assignedTo: params.assignedTo,
      assignedToName: params.assignedToName,
      assignedBy: params.assignedBy,
      assignedByName: params.assignedByName,
      dueDate: params.dueDate ? Timestamp.fromDate(params.dueDate) : undefined,
      estimatedHours: params.estimatedHours,
      progress: 0,
      milestoneId: params.milestoneId,
      tags: [],
      dependsOn: [],
      blockedBy: [],
      hasSubtasks: false,
      parentTaskId: params.parentTaskId ?? undefined,
      attachments: [],
      commentCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection('tasks').add(task);

    await adminDb
      .collection('projects')
      .doc(params.projectId)
      .update({
        totalTasks: admin.firestore.FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

    if (params.parentTaskId) {
      await adminDb
        .collection('tasks')
        .doc(params.parentTaskId)
        .update({
          hasSubtasks: true,
          subtaskCount: admin.firestore.FieldValue.increment(1),
        });
    }

    if (params.milestoneId) {
      await MilestoneService.updateMilestoneProgress(params.milestoneId);
    }

    if (params.assignedTo) {
      await NotificationService.send({
        tenantId: params.tenantId,
        userId: params.assignedTo,
        userEmail: '',
        type: 'action_required',
        title: 'New task assigned',
        message: `${params.assignedByName} assigned you: ${params.title}`,
        category: 'team',
        priority: params.priority === 'urgent' ? 'high' : 'medium',
        actionUrl: `/dashboard/projects/${params.projectId}`,
      });

      await sendBizostoEventNotification({
        type: 'task_assigned',
        tenantId: params.tenantId,
        targetUserId: params.assignedTo,
        title: params.title,
        projectId: params.projectId,
      }).catch((error) => {
        console.error('slack task assignment notification failed:', error);
      });
    }

    await ProjectService.updateProjectProgress(params.projectId);
    return docRef.id;
  }

  static async updateTaskStatus(params: {
    taskId: string;
    status: TaskStatus;
    userId: string;
    userName: string;
  }): Promise<void> {
    const taskDoc = await adminDb.collection('tasks').doc(params.taskId).get();
    if (!taskDoc.exists) {
      throw new Error('Task not found');
    }

    const task = taskDoc.data() as Task;
    const updates: Record<string, unknown> = {
      status: params.status,
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    };

    if (params.status === 'completed') {
      updates.completedAt = Timestamp.now();
      updates.progress = 100;
    } else if (task.progress === 100) {
      updates.progress = 0;
      updates.completedAt = null;
    }

    await taskDoc.ref.update(updates);

    await this.addComment({
      tenantId: task.tenantId,
      taskId: params.taskId,
      projectId: task.projectId,
      authorId: params.userId,
      authorName: params.userName,
      content: `Status changed to ${params.status}`,
      type: 'status_change',
    });

    await ProjectService.updateProjectProgress(task.projectId);

    if (task.milestoneId) {
      await MilestoneService.updateMilestoneProgress(task.milestoneId);
    }

    const projectDoc = await adminDb.collection('projects').doc(task.projectId).get();
    if (projectDoc.exists) {
      const project = projectDoc.data() as Project;
      if (project.managerId !== params.userId) {
        await NotificationService.send({
          tenantId: task.tenantId,
          userId: project.managerId,
          userEmail: '',
          type: 'info',
          title: 'Task status updated',
          message: `${params.userName} marked \"${task.title}\" as ${params.status}`,
          category: 'team',
          actionUrl: `/dashboard/projects/${task.projectId}`,
        });
      }
    }
  }

  static async addComment(params: {
    tenantId: string;
    taskId: string;
    projectId: string;
    authorId: string;
    authorName: string;
    content: string;
    type?: 'comment' | 'status_change' | 'assignment' | 'mention';
    attachments?: string[];
  }): Promise<string> {
    const mentions = this.extractMentions(params.content);

    const comment: Omit<TaskComment, 'id'> = {
      tenantId: params.tenantId,
      taskId: params.taskId,
      projectId: params.projectId,
      authorId: params.authorId,
      authorName: params.authorName,
      content: params.content,
      attachments: params.attachments,
      type: params.type || 'comment',
      mentions,
      createdAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection('task_comments').add(comment);

    await adminDb
      .collection('tasks')
      .doc(params.taskId)
      .update({
        commentCount: admin.firestore.FieldValue.increment(1),
        lastActivityAt: Timestamp.now(),
      });

    await Promise.all(
      mentions.map((userId) =>
        NotificationService.send({
          tenantId: params.tenantId,
          userId,
          userEmail: '',
          type: 'info',
          title: 'You were mentioned',
          message: `${params.authorName} mentioned you in a task comment`,
          category: 'team',
          actionUrl: `/dashboard/projects/${params.projectId}`,
        }),
      ),
    );

    return docRef.id;
  }

  private static extractMentions(text: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }

    return Array.from(new Set(mentions));
  }

  static async startTimer(params: {
    tenantId: string;
    projectId: string;
    projectName: string;
    taskId: string;
    taskTitle: string;
    userId: string;
    userName: string;
    billable: boolean;
  }): Promise<string> {
    const runningTimer = await adminDb
      .collection('time_entries')
      .where('tenantId', '==', params.tenantId)
      .where('userId', '==', params.userId)
      .where('isRunning', '==', true)
      .limit(1)
      .get();

    if (!runningTimer.empty) {
      throw new Error('You already have a running timer');
    }

    const now = Timestamp.now();
    const entry: Omit<TimeEntry, 'id'> = {
      tenantId: params.tenantId,
      projectId: params.projectId,
      projectName: params.projectName,
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      userId: params.userId,
      userName: params.userName,
      startTime: now,
      duration: 0,
      billable: params.billable,
      isRunning: true,
      approved: false,
      invoiced: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection('time_entries').add(entry);
    return docRef.id;
  }

  static async stopTimer(entryId: string): Promise<void> {
    const entryDoc = await adminDb.collection('time_entries').doc(entryId).get();
    if (!entryDoc.exists) {
      throw new Error('Time entry not found');
    }

    const entry = entryDoc.data() as TimeEntry;
    const endTime = Timestamp.now();
    const duration = Math.max(
      1,
      Math.round((endTime.toMillis() - entry.startTime.toMillis()) / (1000 * 60)),
    );

    const updates: Record<string, unknown> = {
      endTime,
      duration,
      isRunning: false,
      updatedAt: Timestamp.now(),
    };

    if (entry.hourlyRate) {
      updates.cost = (duration / 60) * entry.hourlyRate;
    }

    await entryDoc.ref.update(updates);

    if (entry.taskId) {
      await adminDb
        .collection('tasks')
        .doc(entry.taskId)
        .update({
          actualHours: admin.firestore.FieldValue.increment(duration / 60),
        });
    }

    await adminDb
      .collection('projects')
      .doc(entry.projectId)
      .update({
        totalHoursLogged: admin.firestore.FieldValue.increment(duration / 60),
        totalCost: admin.firestore.FieldValue.increment(Number(updates.cost || 0)),
        updatedAt: Timestamp.now(),
      });
  }
}
