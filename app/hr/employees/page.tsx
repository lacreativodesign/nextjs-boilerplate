"use client";

import React, { useMemo, useState } from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

type EmploymentStatus = "Active" | "On Leave" | "Probation" | "Inactive";

type Employee = {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  joinedOn: string; // ISO
  lastLogin?: string; // ISO | undefined
  status: EmploymentStatus;
  location: string;
};

const MOCK_EMPLOYEES: Employee[] = [
  {
    id: "EMP-001",
    name: "Zain Ahmed",
    role: "Senior Sales Executive",
    department: "Sales",
    email: "zain.ahmed@example.com",
    joinedOn: "2024-03-15T09:00:00.000Z",
    lastLogin: "2025-11-17T08:30:00.000Z",
    status: "Active",
    location: "Karachi, PK",
  },
  {
    id: "EMP-002",
    name: "Hira Khan",
    role: "Account Manager",
    department: "Client Services",
    email: "hira.khan@example.com",
    joinedOn: "2024-06-01T09:00:00.000Z",
    lastLogin: "2025-11-16T16:45:00.000Z",
    status: "Active",
    location: "Lahore, PK",
  },
  {
    id: "EMP-003",
    name: "Ali Raza",
    role: "UI/UX Designer",
    department: "Production",
    email: "ali.raza@example.com",
    joinedOn: "2023-11-20T09:00:00.000Z",
    lastLogin: "2025-11-15T11:10:00.000Z",
    status: "On Leave",
    location: "Remote (PK)",
  },
  {
    id: "EMP-004",
    name: "Maria Jackson",
    role: "Finance Officer",
    department: "Finance",
    email: "maria.jackson@example.com",
    joinedOn: "2023-08-10T09:00:00.000Z",
    lastLogin: "2025-11-10T17:20:00.000Z",
    status: "Active",
    location: "Boston, USA",
  },
  {
    id: "EMP-005",
    name: "Omar Siddiqui",
    role: "HR Specialist",
    department: "HR",
    email: "omar.siddiqui@example.com",
    joinedOn: "2025-01-05T09:00:00.000Z",
    lastLogin: undefined,
    status: "Probation",
    location: "Karachi, PK",
  },
];

function formatDateShort(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function statusBadgeClasses(status: EmploymentStatus) {
  switch (status) {
    case "Active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800";
    case "On Leave":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800";
    case "Probation":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800";
    case "Inactive":
    default:
      return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700";
  }
}

export default function HREmployeesPage() {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | "All">(
    "All"
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    MOCK_EMPLOYEES.forEach((e) => set.add(e.department));
    return Array.from(set).sort();
  }, []);

  const filteredEmployees = useMemo(() => {
    let list = [...MOCK_EMPLOYEES];

    if (departmentFilter !== "All") {
      list = list.filter((e) => e.department === departmentFilter);
    }

    if (statusFilter !== "All") {
      list = list.filter((e) => e.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        return (
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.role.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q)
        );
      });
    }

    list.sort(
      (a, b) =>
        new Date(b.joinedOn).getTime() - new Date(a.joinedOn).getTime()
    );

    return list;
  }, [search, departmentFilter, statusFilter]);

  const summary = useMemo(() => {
    const total = MOCK_EMPLOYEES.length;
    const active = MOCK_EMPLOYEES.filter((e) => e.status === "Active").length;
    const probation = MOCK_EMPLOYEES.filter(
      (e) => e.status === "Probation"
    ).length;
    const onLeave = MOCK_EMPLOYEES.filter(
      (e) => e.status === "On Leave"
    ).length;

    return { total, active, probation, onLeave };
  }, []);

  return (
    <ERPLayout pageTitle="HR • Employees">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Employees directory
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Central view of all team members in La Creativo ERP. This is
              HR-side visibility, not what employees see in their dashboards.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() =>
                alert(
                  "Add Employee form will be implemented later and wired to Firestore. This is UI-only for now."
                )
              }
            >
              ＋ Add employee
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total employees
            </span>
            <span className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {summary.total}
            </span>
            <span className="text-[11px] text-slate-400">
              All active, probation, on leave & inactive.
            </span>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Active
            </span>
            <span className="text-2xl font-semibold text-emerald-900 dark:text-emerald-50">
              {summary.active}
            </span>
            <span className="text-[11px] text-emerald-700/70 dark:text-emerald-200/70">
              Logged in / working as normal.
            </span>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              On probation
            </span>
            <span className="text-2xl font-semibold text-indigo-900 dark:text-indigo-50">
              {summary.probation}
            </span>
            <span className="text-[11px] text-indigo-700/70 dark:text-indigo-200/70">
              New hires in evaluation period.
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 shadow-sm flex flex-col gap-1">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              On leave
            </span>
            <span className="text-2xl font-semibold text-amber-900 dark:text-amber-50">
              {summary.onLeave}
            </span>
            <span className="text-[11px] text-amber-700/70 dark:text-amber-200/70">
              Planned or unplanned absences.
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Search employees
            </label>
            <input
              type="text"
              placeholder="Search by name, email, role, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="w-full md:w-44">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-40">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as EmploymentStatus | "All")
              }
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Probation">Probation</option>
              <option value="On Leave">On leave</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Employees table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Employees
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Later this will connect to real Firestore employee profiles,
                payroll, and attendance. Right now it&apos;s a clean UI shell.
              </p>
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No employees match your current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-t border-slate-100 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Employee
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Role
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Department
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Joined
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Last login
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-slate-50 font-medium">
                            {emp.name}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {emp.email} • {emp.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {emp.role}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {emp.department}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                            statusBadgeClasses(emp.status)
                          }
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                        {formatDateShort(emp.joinedOn)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                        {formatDateShort(emp.lastLogin)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs">
                        {emp.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ERPLayout>
  );
    }
