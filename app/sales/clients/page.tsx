"use client";

export default function SalesClientsPage() {
  // Placeholder demo client list until Firebase is connected
  const clients = [
    {
      id: "C-1001",
      name: "John Carter",
      company: "Carter Studios",
      email: "john@carterstudios.com",
      phone: "+1 555 234 8899",
      status: "Active",
    },
    {
      id: "C-1002",
      name: "Amelia Lopez",
      company: "Silver Peak Retail",
      email: "amelia@silverpeak.com",
      phone: "+1 555 991 2200",
      status: "Pending",
    },
    {
      id: "C-1003",
      name: "Jacob Williams",
      company: "BlueBrick Tech",
      email: "jacob@bluebrick.io",
      phone: "+1 555 776 1011",
      status: "Inactive",
    },
  ];

  const statusColor = (status: string) => {
    if (status === "Active") return "text-green-600 dark:text-green-400";
    if (status === "Pending") return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Clients</h1>

      <div className="table-shell">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <th className="py-3 px-4">Client ID</th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Phone</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[var(--border-subtle)] hover:bg-[var(--table-row-hover)] transition"
              >
                <td className="py-3 px-4 text-[var(--text-muted)]">{c.id}</td>
                <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{c.name}</td>
                <td className="py-3 px-4 text-[var(--text-primary)]">{c.company}</td>
                <td className="py-3 px-4 text-[var(--text-primary)]">{c.email}</td>
                <td className="py-3 px-4 text-[var(--text-primary)]">{c.phone}</td>
                <td className="py-3 px-4 font-semibold">
                  <span className={statusColor(c.status)}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="helper-text px-4 py-3">
          These are demo clients. Once Firebase is connected, this page will
          automatically load all client records assigned to the logged-in sales
          user (or all clients for admins / sales managers).
        </p>
      </div>
    </div>
  );
}
