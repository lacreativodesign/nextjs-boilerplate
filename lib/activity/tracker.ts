import type { ActivityActionType, ActivityEntityType } from "@/types/activity-feed";

type TrackActivityInput = {
  action: ActivityActionType;
  entityType: ActivityEntityType;
  entityId: string;
  entityName?: string;
  module: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function trackActivity(input: TrackActivityInput) {
  await fetch("/api/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action,
      entity: {
        type: input.entityType,
        id: input.entityId,
        name: input.entityName,
      },
      metadata: {
        module: input.module,
        description: input.description,
        ...input.metadata,
      },
    }),
  });
}

export async function trackInvoiceCreated(invoiceId: string, invoiceNumber: string) {
  await trackActivity({
    action: "created",
    entityType: "invoice",
    entityId: invoiceId,
    entityName: invoiceNumber,
    module: "finance",
    description: `Invoice ${invoiceNumber} created`,
  });
}

export async function trackInvoiceUpdated(invoiceId: string, invoiceNumber: string) {
  await trackActivity({
    action: "updated",
    entityType: "invoice",
    entityId: invoiceId,
    entityName: invoiceNumber,
    module: "finance",
    description: `Invoice ${invoiceNumber} updated`,
  });
}

export async function trackInvoicePaid(invoiceId: string, invoiceNumber: string) {
  await trackActivity({
    action: "updated",
    entityType: "payment",
    entityId: invoiceId,
    entityName: invoiceNumber,
    module: "finance",
    description: `Invoice ${invoiceNumber} marked paid`,
  });
}

export async function trackClientAdded(clientId: string, clientName: string) {
  await trackActivity({
    action: "created",
    entityType: "client",
    entityId: clientId,
    entityName: clientName,
    module: "crm",
    description: `Client ${clientName} added`,
  });
}

export async function trackProjectStatusChanged(projectId: string, projectName: string, status: string) {
  await trackActivity({
    action: "updated",
    entityType: "project",
    entityId: projectId,
    entityName: projectName,
    module: "projects",
    description: `Project ${projectName} moved to ${status}`,
  });
}

export async function trackTaskAssigned(taskId: string, taskTitle: string, assigneeUid: string) {
  await trackActivity({
    action: "assigned",
    entityType: "task",
    entityId: taskId,
    entityName: taskTitle,
    module: "projects",
    description: `Task ${taskTitle} assigned`,
    metadata: { assigneeUid },
  });
}

export async function trackTaskCompleted(taskId: string, taskTitle: string) {
  await trackActivity({
    action: "updated",
    entityType: "task",
    entityId: taskId,
    entityName: taskTitle,
    module: "projects",
    description: `Task ${taskTitle} completed`,
    metadata: { completed: true },
  });
}

export async function trackCommentAdded(commentId: string, entityType: ActivityEntityType, entityId: string) {
  await trackActivity({
    action: "commented",
    entityType,
    entityId,
    module: "collaboration",
    description: "Comment added",
    metadata: { commentId },
  });
}

export async function trackDocumentUploaded(documentId: string, documentName: string) {
  await trackActivity({
    action: "created",
    entityType: "document",
    entityId: documentId,
    entityName: documentName,
    module: "documents",
    description: `Document ${documentName} uploaded`,
  });
}

export async function trackUserSession(uid: string, action: "logged_in" | "logged_out") {
  await trackActivity({
    action: "updated",
    entityType: "user",
    entityId: uid,
    module: "auth",
    description: action === "logged_in" ? "User logged in" : "User logged out",
    metadata: { sessionAction: action },
  });
}
