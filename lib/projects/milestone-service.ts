import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendBizostoEventNotification } from "@/lib/integrations/slack";
import type { Milestone } from "@/types/project-management";

export class MilestoneService {
  static async createMilestone(params: {
    tenantId: string;
    projectId: string;
    projectName: string;
    name: string;
    description?: string;
    dueDate: Date;
  }): Promise<string> {
    const now = Timestamp.now();
    const milestone: Omit<Milestone, "id"> = {
      tenantId: params.tenantId,
      projectId: params.projectId,
      projectName: params.projectName,
      name: params.name,
      description: params.description,
      dueDate: Timestamp.fromDate(params.dueDate),
      status: "upcoming",
      progress: 0,
      taskIds: [],
      totalTasks: 0,
      completedTasks: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection("milestones").add(milestone);
    return docRef.id;
  }

  static async updateMilestoneProgress(milestoneId: string): Promise<void> {
    const milestoneRef = adminDb.collection("milestones").doc(milestoneId);
    const milestoneDoc = await milestoneRef.get();
    if (!milestoneDoc.exists) {
      throw new Error("Milestone not found");
    }

    const milestone = milestoneDoc.data() as Milestone;
    const tasksSnapshot = await adminDb
      .collection("tasks")
      .where("milestoneId", "==", milestoneId)
      .where("tenantId", "==", milestone.tenantId)
      .get();

    const totalTasks = tasksSnapshot.size;
    const completedTasks = tasksSnapshot.docs.filter((doc) => doc.data().status === "completed").length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const dueDateMs = milestone.dueDate?.toMillis?.() ?? 0;
    const isOverdue = dueDateMs > 0 && dueDateMs < Date.now() && progress < 100;
    const status = progress === 100 ? "completed" : isOverdue ? "overdue" : progress > 0 ? "in_progress" : "upcoming";

    const wasCompleted = milestone.status === "completed";

    await milestoneRef.update({
      totalTasks,
      completedTasks,
      progress,
      status,
      completedAt: status === "completed" ? Timestamp.now() : null,
      updatedAt: Timestamp.now(),
    });

    if (!wasCompleted && status === "completed") {
      await sendBizostoEventNotification({
        type: "project_milestone",
        tenantId: milestone.tenantId,
        projectName: milestone.projectName,
        milestoneName: milestone.name,
      }).catch((error) => {
        console.error("slack milestone notification failed:", error);
      });
    }
  }
}
