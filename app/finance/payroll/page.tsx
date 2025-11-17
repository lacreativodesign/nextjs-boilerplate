"use client";

const payrollSummary = [
  {
    label: "Total Employees",
    value: 14,
  },
  {
    label: "Monthly Payroll Cost",
    value: "$21,800",
  },
  {
    label: "Pending Approvals",
    value: 3,
  },
];

const payrollData = [
  {
    id: "EMP-001",
    name: "Ayesha Khan",
    role: "Project Manager",
    salary: 3200,
    status: "Paid",
    date: "2025-01-28",
  },
  {
    id: "EMP-002",
    name: "Hassan Raza",
    role: "Frontend Developer",
    salary: 2500,
    status: "Pending",
    date: "2025-01-28",
  },
  {
    id: "EMP-003",
    name: "Maria Ahmed",
    role: "UI/UX Designer",
    salary: 2100,
    status: "Paid",
    date: "2025-01-28",
  },
  {
    id: "EMP-004",
    name: "Bilal Sheikh",
    role: "Backend Developer",
    salary: 2700,
    status: "Processing",
    date: "2025-01-28",
  },
];

const statusColors: any = {
  Paid: "text-green-600 dark:text-green-400",
  Pending: "text-yellow-600 dark:text-yellow-400",
  Processing: "text-blue-600 dark:text-blue-400",
};

export default function FinancePayrollPage() {
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Payroll</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Manage salaries, approvals, and employee payout records.
        </p>
      </div>

      {/* Payroll Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {payrollSummary.map((item, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {item.label}
            </p>
            <p className="text-2xl font-bold mt-2">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-neutral-400 text-left">
              <th className="p-3">Employee ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Salary</th>
              <th className="p-3">Status</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>

          <tbody className="text-gray-900 dark:text-gray-100">
            {payrollData.map((emp, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-neutral-800"
              >
                <td className="p-3">{emp.id}</td>
                <td className="p-3">{emp.name}</td>
                <td className="p-3">{emp.role}</td>
                <td className="p-3">${emp.salary}</td>
                <td className={`p-3 font-medium ${statusColors[emp.status]}`}>
                  {emp.status}
                </td>
                <td className="p-3">{emp.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
      }
