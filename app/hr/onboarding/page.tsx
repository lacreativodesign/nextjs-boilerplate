"use client";

import { useEffect, useMemo, useState } from "react";
import MasterSelect from "@/components/ui/MasterSelect";
import { formatDate } from "@/components/finance/financeUtils";
import { INTERNAL_ROLE_OPTIONS } from "@/lib/userOptions";
import { showToast } from "@/lib/utils/toast";

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
  updatedAt?: string | null;
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

type TemplateSortKey = "name" | "role" | "steps" | "status" | "updated";

type TaskSortKey = "employee" | "template" | "progress" | "status" | "due";

type SortDir = "asc" | "desc";

function formatRole(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Am", "AM");
}

const sortIndicator = (active: boolean, dir: SortDir) => (
  <span style={{ width: 18, display: "inline-block", textAlign: "center", opacity: active ? 1 : 0.35 }}>
    {active ? (dir === "asc" ? "↑" : "↓") : "•"}
  </span>
);

export default function HrOnboardingPage() {
    const [tab, setTab] = useState<TabKey>("templates");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templateSearch, setTemplateSearch] = useState("");
  const [templateSortKey, setTemplateSortKey] = useState<TemplateSortKey>("name");
  const [templateSortDir, setTemplateSortDir] = useState<SortDir>("asc");

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
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSortKey, setTaskSortKey] = useState<TaskSortKey>("employee");
  const [taskSortDir, setTaskSortDir] = useState<SortDir>("asc");

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [usersRes, templatesRes, tasksRes] = await Promise.all([
          fetch("/api/hr/employees/list", { cache: "no-store", credentials: "include" }),
          fetch("/api/hr/onboarding/templates/list", { cache: "no-store", credentials: "include" }),
          fetch("/api/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" }),
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

  const filteredTemplates = useMemo(() => {
    const term = templateSearch.trim().toLowerCase();
    const list = templates.filter((template) => {
      if (!term) return true;
      return [template.name, template.role].some((value) => String(value || "").toLowerCase().includes(term));
    });

    const sorted = [...list].sort((a, b) => {
      const dir = templateSortDir === "asc" ? 1 : -1;
      const aVal = getTemplateSortValue(a, templateSortKey);
      const bVal = getTemplateSortValue(b, templateSortKey);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return sorted;
  }, [templates, templateSearch, templateSortKey, templateSortDir]);

  const taskRows = useMemo(() => {
    const term = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = taskFilterStatus === "all" ? true : task.status === taskFilterStatus;
      const matchesUser = taskFilterUser === "all" ? true : task.userId === taskFilterUser;
      const user = users.find((u) => u.uid === task.userId);
      const role = String(user?.role || "").toLowerCase();
      const template = templates.find((t) => t.id === task.templateId);
      const matchesRole = taskFilterRole === "all" ? true : role === taskFilterRole;
      const matchesSearch = !term
        ? true
        : [user?.name, template?.name, task.status]
            .filter(Boolean)
            .some((value) => String(value || "").toLowerCase().includes(term));
      return matchesStatus && matchesUser && matchesRole && matchesSearch;
    });
  }, [tasks, taskFilterStatus, taskFilterUser, taskFilterRole, taskSearch, users, templates]);

  const sortedTasks = useMemo(() => {
    const list = [...taskRows].sort((a, b) => {
      const dir = taskSortDir === "asc" ? 1 : -1;
      const aVal = getTaskSortValue(a, taskSortKey, users, templates);
      const bVal = getTaskSortValue(b, taskSortKey, users, templates);
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
    return list;
  }, [taskRows, taskSortDir, taskSortKey, users, templates]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  async function saveTemplate() {
    try {
      const endpoint = templateForm.id
        ? "/api/hr/onboarding/templates/update"
        : "/api/hr/onboarding/templates/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(templateForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to save template.");
      const refresh = await fetch("/api/hr/onboarding/templates/list", {
        cache: "no-store",
        credentials: "include",
      });
      const refreshData = await refresh.json();
      setTemplates(refreshData.templates || []);
      setTemplateForm({ id: "", name: "", role: "all", isActive: true, steps: [{ title: "", description: "", required: true }] });
    } catch (err: any) {
      showToast.error(err?.message || "Unable to save template.");
    }
  }

  async function assignTemplate() {
    try {
      setSavingAssign(true);
      const res = await fetch("/api/hr/onboarding/assign", {
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
      const refresh = await fetch("/api/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" });
      const refreshData = await refresh.json();
      setTasks(refreshData.tasks || []);
      setAssignUserId("");
      setAssignTemplateId("");
      setAssignDueDate("");
      setTab("tasks");
    } catch (err: any) {
      showToast.error(err?.message || "Unable to assign onboarding.");
    } finally {
      setSavingAssign(false);
    }
  }

  async function updateTask(task: TaskRecord) {
    try {
      setTaskSaving(true);
      const res = await fetch("/api/hr/onboarding/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId: task.id, status: task.status, steps: task.steps }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Unable to update task.");
      const refresh = await fetch("/api/hr/onboarding/tasks/list", { cache: "no-store", credentials: "include" });
      const refreshData = await refresh.json();
      setTasks(refreshData.tasks || []);
      setTaskDrawerOpen(false);
      setSelectedTaskId(null);
    } catch (err: any) {
      showToast.error(err?.message || "Unable to update task.");
    } finally {
      setTaskSaving(false);
    }
  }

  function toggleTemplateSort(key: TemplateSortKey) {
    if (templateSortKey === key) {
      setTemplateSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTemplateSortKey(key);
    setTemplateSortDir("asc");
  }

  function toggleTaskSort(key: TaskSortKey) {
    if (taskSortKey === key) {
      setTaskSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTaskSortKey(key);
    setTaskSortDir("asc");
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
        <section className="space-y-4">
          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div className="grid gap-3 md:grid-cols-2">
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
                <MasterSelect value={templateForm.role} onChange={(value) => setTemplateForm((prev) => ({ ...prev, role: value }))} options={ROLE_OPTIONS} />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {templateForm.steps.map((step, idx) => (
                <div key={`${step.title}-${idx}`} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
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
                  <input
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
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
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
                    Required
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn ghost"
                onClick={() =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    steps: [...prev.steps, { title: "", description: "", required: true }],
                  }))
                }
              >
                Add Step
              </button>
              <button className="btn" onClick={saveTemplate}>
                {templateForm.id ? "Update Template" : "Save Template"}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
            <div className="p-4">
              <input
                className="input"
                placeholder="Search keyword"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
              />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr style={{ background: "var(--table-header-bg)" }}>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort" onClick={() => toggleTemplateSort("name")}>
                        Template
                        {sortIndicator(templateSortKey === "name", templateSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort" onClick={() => toggleTemplateSort("role")}>
                        Role
                        {sortIndicator(templateSortKey === "role", templateSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--right" onClick={() => toggleTemplateSort("steps")}>
                        Steps
                        {sortIndicator(templateSortKey === "steps", templateSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--center" onClick={() => toggleTemplateSort("status")}>
                        Status
                        {sortIndicator(templateSortKey === "status", templateSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--right" onClick={() => toggleTemplateSort("updated")}>
                        Updated
                        {sortIndicator(templateSortKey === "updated", templateSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                        Loading templates…
                      </td>
                    </tr>
                  ) : filteredTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                        No templates yet.
                      </td>
                    </tr>
                  ) : (
                    filteredTemplates.map((template) => {
                                            return (
                        <tr key={template.id}>
                          <td style={{ textAlign: "left", padding: "12px 16px" }}>{template.name}</td>
                          <td style={{ textAlign: "left", padding: "12px 16px" }}>{formatRole(template.role || "all")}</td>
                          <td style={{ textAlign: "right", padding: "12px 16px" }}>{template.steps?.length || 0}</td>
                          <td style={{ textAlign: "center", padding: "12px 16px" }}>{template.isActive ? "Active" : "Paused"}</td>
                          <td style={{ textAlign: "right", padding: "12px 16px" }}>{formatDate(template.updatedAt || "")}</td>
                          <td style={{ textAlign: "center", padding: "12px 16px" }}>
                            <button
                              className="btn ghost"
                              onClick={() =>
                                setTemplateForm({
                                  id: template.id,
                                  name: template.name,
                                  role: template.role,
                                  isActive: template.isActive,
                                  steps: template.steps || [{ title: "", description: "", required: true }],
                                })
                              }
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "assign" && (
        <section className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div className="grid gap-3 md:grid-cols-3">
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
          <div className="mt-4 flex justify-end">
            <button className="btn" onClick={assignTemplate} disabled={savingAssign || !assignUserId || !assignTemplateId}>
              {savingAssign ? "Assigning..." : "Assign"}
            </button>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section className="space-y-4">
          <div className="card" style={{ padding: 18, borderRadius: 18 }}>
            <div className="filter-bar filter-bar--search">
              <input
                className="input"
                placeholder="Search keyword"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
              />
              <MasterSelect value={taskFilterUser} onChange={setTaskFilterUser} options={[{ label: "All Employees", value: "all" }, ...userOptions]} />
              <MasterSelect value={taskFilterRole} onChange={setTaskFilterRole} options={ROLE_OPTIONS} />
              <MasterSelect value={taskFilterStatus} onChange={setTaskFilterStatus} options={STATUS_OPTIONS} />
            </div>
          </div>

          <section className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                <thead>
                  <tr style={{ background: "var(--table-header-bg)" }}>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort" onClick={() => toggleTaskSort("employee")}>
                        Employee
                        {sortIndicator(taskSortKey === "employee", taskSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort" onClick={() => toggleTaskSort("template")}>
                        Template
                        {sortIndicator(taskSortKey === "template", taskSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--center" onClick={() => toggleTaskSort("progress")}>
                        Progress
                        {sortIndicator(taskSortKey === "progress", taskSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--center" onClick={() => toggleTaskSort("status")}>
                        Status
                        {sortIndicator(taskSortKey === "status", taskSortDir)}
                      </button>
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 700 }}>
                      <button type="button" className="table-sort table-sort--right" onClick={() => toggleTaskSort("due")}>
                        Due
                        {sortIndicator(taskSortKey === "due", taskSortDir)}
                      </button>
                    </th>
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
                  ) : sortedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                        No onboarding tasks.
                      </td>
                    </tr>
                  ) : (
                    sortedTasks.map((task, idx) => {
                      const user = users.find((u) => u.uid === task.userId);
                      const template = templates.find((t) => t.id === task.templateId);
                      const totalSteps = task.steps.length || 1;
                      const doneSteps = task.steps.filter((s) => s.isDone).length;
                      const progress = Math.round((doneSteps / totalSteps) * 100);
                                            return (
                        <tr
                          key={task.id}
                          style={{ cursor: "pointer" }}
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
        </section>
      )}

      {taskDrawerOpen && selectedTask && (
        <div
          className="drawer-overlay"
          onClick={() => {
            setTaskDrawerOpen(false);
            setSelectedTaskId(null);
          }}
        >
          <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
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
              <button className="btn" onClick={() => updateTask({ ...selectedTask })} disabled={taskSaving}>
                {taskSaving ? "Saving..." : "Save Updates"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTemplateSortValue(template: TemplateRecord, key: TemplateSortKey) {
  switch (key) {
    case "name":
      return template.name.toLowerCase();
    case "role":
      return String(template.role || "").toLowerCase();
    case "steps":
      return template.steps?.length || 0;
    case "status":
      return template.isActive ? 1 : 0;
    case "updated":
      return template.updatedAt ? new Date(template.updatedAt).getTime() : 0;
    default:
      return "";
  }
}

function getTaskSortValue(task: TaskRecord, key: TaskSortKey, users: UserRecord[], templates: TemplateRecord[]) {
  const user = users.find((u) => u.uid === task.userId);
  const template = templates.find((t) => t.id === task.templateId);
  const totalSteps = task.steps.length || 1;
  const doneSteps = task.steps.filter((s) => s.isDone).length;
  const progress = Math.round((doneSteps / totalSteps) * 100);

  switch (key) {
    case "employee":
      return String(user?.name || "").toLowerCase();
    case "template":
      return String(template?.name || "").toLowerCase();
    case "progress":
      return progress;
    case "status":
      return String(task.status || "").toLowerCase();
    case "due":
      return task.dueDate ? new Date(task.dueDate).getTime() : 0;
    default:
      return "";
  }
}
