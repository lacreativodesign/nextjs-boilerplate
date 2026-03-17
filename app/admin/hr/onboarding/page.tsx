"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { useIsSystemDark, formatDate } from "@/components/finance/financeUtils";
import { INTERNAL_ROLE_OPTIONS } from "@/lib/userOptions";

const STATUS_OPTIONS = [
  { label: "All Status", value: "all" },
  { label: "Not Started", value: "Not Started" },
  { label: "In Progress", value: "In Progress" },
  { label: "Completed", value: "Completed" },
];

const ROLE_OPTIONS = [
  { label: "All Roles", value: "all" },
  ...INTERNAL_ROLE_OPTIONS.map((role) => ({ label: formatRole(role), value: role })),
];

type UserRecord = {
  uid: string;
  name?: string;
  role?: string;
  email?: string;
};

type TemplateRecord = {
  id: string;
  name: string;
  role: string;
  steps: { title: string; description: string; required: boolean }[];
  isActive: boolean;
};

type TaskRecord = {
  id: string;
  userId: string;
  templateId: string;
  status: "Not Started" | "In Progress" | "Completed";
  steps: { title: string; description: string; required: boolean; isDone: boolean; doneAt?: string | null }[];
  dueDate?: string | null;
};

type TabKey = "templates" | "assign" | "tasks";

function formatRole(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Am", "AM");
}

export default function HrOnboardingPage() {
  const isDark = useIsSystemDark();
  const [tab, setTab] = useState<TabKey>("templates");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templateForm, setTemplateForm] = useState({
    id: "",
    name: "",
    role: "all",
    isActive: true,
    steps: [{ title: "", description: "", required: true }],
  });

  const [assignUserId, setAssignUserId] = useState("");
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  const [taskFilterStatus, setTaskFilterStatus] = useState("all");
  const [taskFilterUser, setTaskFilterUser] = useState("all");
  const [taskFilterRole, setTaskFilterRole] = useState("all");

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [usersRes, templatesRes, tasksRes] = await Promise.all([
          fetch("/api/admin/hr/employees/list", { cache: "no-store", credentials: "include" }),
          fetch("/api/admin/hr/onboarding/templates/list", { cache: "no-store", credentials: "include" }),
          fetch("/api/admin/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" }),
        ]);
        const usersJson = await usersRes.json();
        const templatesJson = await templatesRes.json();
        const tasksJson = await tasksRes.json();
        if (!usersRes.ok || !usersJson.ok) throw new Error(usersJson?.error || "Unable to load users.");
        if (!templatesRes.ok || !templatesJson.ok) throw new Error(templatesJson?.error || "Unable to load templates.");
        if (!tasksRes.ok || !tasksJson.ok) throw new Error(tasksJson?.error || "Unable to load tasks.");
        if (!alive) return;
        setUsers(usersJson.users || []);
        setTemplates(templatesJson.templates || []);
        setTasks(tasksJson.tasks || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load onboarding data.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const templateOptions = useMemo(() => templates.map((t) => ({ label: t.name, value: t.id })), [templates]);
  const userOptions = useMemo(
    () => users.map((u) => ({ label: `${u.name || "Employee"} (${formatRole(String(u.role || ""))})`, value: u.uid })),
    [users]
  );

  const taskRows = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = taskFilterStatus === "all" ? true : task.status === taskFilterStatus;
      const matchesUser = taskFilterUser === "all" ? true : task.userId === taskFilterUser;
      const user = users.find((u) => u.uid === task.userId);
      const role = String(user?.role || "").toLowerCase();
      const matchesRole = taskFilterRole === "all" ? true : role === taskFilterRole;
      return matchesStatus && matchesUser && matchesRole;
    });
  }, [tasks, taskFilterStatus, taskFilterUser, taskFilterRole, users]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  async function saveTemplate() {
    try {
      const endpoint = templateForm.id
        ? "/api/admin/hr/onboarding/templates/update"
        : "/api/admin/hr/onboarding/templates/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(templateForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to save template.");
      const refresh = await fetch("/api/admin/hr/onboarding/templates/list", {
        cache: "no-store",
        credentials: "include",
      });
      const refreshData = await refresh.json();
      setTemplates(refreshData.templates || []);
      setTemplateForm({ id: "", name: "", role: "all", isActive: true, steps: [{ title: "", description: "", required: true }] });
    } catch (err: any) {
      alert(err?.message || "Unable to save template.");
    }
  }

  async function assignTemplate() {
    try {
      setSavingAssign(true);
      const res = await fetch("/api/admin/hr/onboarding/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: assignUserId,
          templateId: assignTemplateId,
          dueDate: assignDueDate ? new Date(`${assignDueDate}T00:00:00.000Z`).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to assign onboarding.");
      const refresh = await fetch("/api/admin/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" });
      const refreshData = await refresh.json();
      setTasks(refreshData.tasks || []);
      setAssignUserId("");
      setAssignTemplateId("");
      setAssignDueDate("");
      setTab("tasks");
    } catch (err: any) {
      alert(err?.message || "Unable to assign onboarding.");
    } finally {
      setSavingAssign(false);
    }
  }

  async function updateTask(task: TaskRecord) {
    try {
      setTaskSaving(true);
      const res = await fetch("/api/admin/hr/onboarding/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId: task.id, status: task.status, steps: task.steps }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to update task.");
      const refresh = await fetch("/api/admin/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" });
      const refreshData = await refresh.json();
      setTasks(refreshData.tasks || []);
      setTaskDrawerOpen(false);
      setSelectedTaskId(null);
    } catch (err: any) {
      alert(err?.message || "Unable to update task.");
    } finally {
      setTaskSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card" style={{ padding: 18, borderRadius: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Onboarding</div>
        <div style={{ color: "var(--sidebar-text)", fontSize: 14 }}>
          Templates, assignments, and task tracking for new hires.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["templates", "assign", "tasks"] as TabKey[]).map((key) => (
            <button
              key={key}
              className={tab === key ? "btn" : "btn ghost"}
              onClick={() => setTab(key)}
              style={{ borderRadius: 999 }}
            >
              {key === "templates" ? "Templates" : key === "assign" ? "Assign" : "Tasks"}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="card" style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(248,113,113,0.35)" }}>
          {error}
        </div>
      )}

      {tab === "templates" && (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              {templateForm.id ? "Edit Template" : "Create Template"}
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">Template name</label>
                <input
                  className="input"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">Role</label>
                <MasterSelect
                  value={templateForm.role}
                  onChange={(value) => setTemplateForm((prev) => ({ ...prev, role: value }))}
                  options={[{ label: "All roles", value: "all" }, ...ROLE_OPTIONS.slice(1)]}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">Steps</label>
                <div className="space-y-3">
                  {templateForm.steps.map((step, idx) => (
                    <div key={`${step.title}-${idx}`} className="grid gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                      <input
                        className="input"
                        placeholder="Step title"
                        value={step.title}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            steps: prev.steps.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s)),
                          }))
                        }
                      />
                      <textarea
                        className="input"
                        placeholder="Step description"
                        value={step.description}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            steps: prev.steps.map((s, i) => (i === idx ? { ...s, description: e.target.value } : s)),
                          }))
                        }
                      />
                      <label className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={step.required}
                          onChange={(e) =>
                            setTemplateForm((prev) => ({
                              ...prev,
                              steps: prev.steps.map((s, i) => (i === idx ? { ...s, required: e.target.checked } : s)),
                            }))
                          }
                        />
                        Required step
                      </label>
                      <button
                        className="btn ghost"
                        onClick={() =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            steps: prev.steps.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Remove Step
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn ghost"
                    onClick={() =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        steps: [...prev.steps, { title: "", description: "", required: false }],
                      }))
                    }
                  >
                    Add Step
                  </button>
                </div>
              </div>
              <label className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={templateForm.isActive}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Template is active
              </label>
              <div className="flex justify-end gap-2">
                {templateForm.id && (
                  <button
                    className="btn ghost"
                    onClick={() =>
                      setTemplateForm({ id: "", name: "", role: "all", isActive: true, steps: [{ title: "", description: "", required: true }] })
                    }
                  >
                    Cancel
                  </button>
                )}
                <button className="btn" onClick={saveTemplate} disabled={loading}>
                  {templateForm.id ? "Update Template" : "Create Template"}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Templates</div>
            {loading ? (
              <div>Loading templates…</div>
            ) : templates.length === 0 ? (
              <div style={{ color: "var(--sidebar-text)" }}>No templates created yet.</div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: "var(--border)", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.02)" }}
                  >
                    <div style={{ fontWeight: 600 }}>{template.name}</div>
                    <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>
                      Role: {formatRole(template.role)} · {template.steps.length} steps · {template.isActive ? "Active" : "Inactive"}
                    </div>
                    <button
                      className="btn ghost"
                      style={{ marginTop: 8 }}
                      onClick={() =>
                        setTemplateForm({
                          id: template.id,
                          name: template.name,
                          role: template.role || "all",
                          isActive: template.isActive,
                          steps: template.steps.length ? template.steps : [{ title: "", description: "", required: true }],
                        })
                      }
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "assign" && (
        <section className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Assign Onboarding</div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Employee</label>
              <MasterSelect value={assignUserId} onChange={setAssignUserId} options={userOptions} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Template</label>
              <MasterSelect value={assignTemplateId} onChange={setAssignTemplateId} options={templateOptions} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Due date</label>
              <input className="input" type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn" onClick={assignTemplate} disabled={savingAssign || !assignUserId || !assignTemplateId}>
              {savingAssign ? "Assigning..." : "Assign"}
            </button>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
          <div className="p-4 flex flex-wrap gap-2">
            <MasterSelect value={taskFilterStatus} onChange={setTaskFilterStatus} options={STATUS_OPTIONS} />
            <MasterSelect
              value={taskFilterUser}
              onChange={setTaskFilterUser}
              options={[{ label: "All Employees", value: "all" }, ...userOptions]}
            />
            <MasterSelect value={taskFilterRole} onChange={setTaskFilterRole} options={ROLE_OPTIONS} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
              <thead>
                <tr style={{ background: isDark ? "rgba(30,30,30,0.9)" : "rgba(248,250,252,0.9)" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Employee</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>Template</th>
                  <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>Progress</th>
                  <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>Status</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>Due</th>
                  <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      Loading tasks…
                    </td>
                  </tr>
                ) : taskRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      No onboarding tasks found.
                    </td>
                  </tr>
                ) : (
                  taskRows.map((task, idx) => {
                    const user = users.find((u) => u.uid === task.userId);
                    const template = templates.find((t) => t.id === task.templateId);
                    const totalSteps = task.steps.length || 1;
                    const doneSteps = task.steps.filter((s) => s.isDone).length;
                    const progress = Math.round((doneSteps / totalSteps) * 100);
                    const rowBg = idx % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)") : "transparent";
                    return (
                      <tr
                        key={task.id}
                        style={{ background: rowBg, cursor: "pointer" }}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setTaskDrawerOpen(true);
                        }}
                      >
                        <td style={{ textAlign: "left", padding: "12px 16px" }}>{user?.name || "Employee"}</td>
                        <td style={{ textAlign: "left", padding: "12px 16px" }}>{template?.name || "Template"}</td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>{progress}%</td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>{task.status}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px" }}>{formatDate(task.dueDate || "")}</td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>
                          <button className="btn ghost" style={{ padding: "6px 12px", borderRadius: 999 }}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {taskDrawerOpen && selectedTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => {
            setTaskDrawerOpen(false);
            setSelectedTaskId(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(480px, 92vw)",
              height: "100%",
              padding: 20,
              background: "var(--card-bg)",
              borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Onboarding Checklist</div>
                <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>
                  {users.find((u) => u.uid === selectedTask.userId)?.name || "Employee"}
                </div>
              </div>
              <button
                className="btn ghost"
                onClick={() => {
                  setTaskDrawerOpen(false);
                  setSelectedTaskId(null);
                }}
              >
                Close
              </button>
            </div>
            <div style={{ height: 16 }} />
            <div className="space-y-3">
              {selectedTask.steps.map((step, idx) => (
                <label
                  key={`${step.title}-${idx}`}
                  className="flex gap-3 rounded-xl border p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={step.isDone}
                    onChange={(e) => {
                      const nextSteps = selectedTask.steps.map((s, i) =>
                        i === idx ? { ...s, isDone: e.target.checked } : s
                      );
                      setTasks((prev) => prev.map((task) => (task.id === selectedTask.id ? { ...task, steps: nextSteps } : task)));
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{step.title || "Untitled step"}</div>
                    <div style={{ fontSize: 12, color: "var(--sidebar-text)" }}>{step.description || "-"}</div>
                    {step.required && <div style={{ fontSize: 11, color: "#38bdf8" }}>Required</div>}
                  </div>
                </label>
              ))}
            </div>
            <div style={{ height: 16 }} />
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">Status</label>
              <MasterSelect
                value={selectedTask.status}
                onChange={(value) =>
                  setTasks((prev) => prev.map((task) => (task.id === selectedTask.id ? { ...task, status: value } : task)))
                }
                options={STATUS_OPTIONS.filter((opt) => opt.value !== "all")}
              />
            </div>
            <div style={{ height: 16 }} />
            <div className="flex justify-end gap-2">
              <button
                className="btn"
                onClick={() => updateTask({ ...selectedTask })}
                disabled={taskSaving}
              >
                {taskSaving ? "Saving..." : "Save Updates"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
