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
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Clients</h1>

      {/* TABLE */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm text-gray-500 dark:text-neutral-400 border-b border-gray-200 dark:border-neutral-800">
              <th className="py-3">Client ID</th>
              <th className="py-3">Name</th>
              <th className="py-3">Company</th>
              <th className="py-3">Email</th>
              <th className="py-3">Phone</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
              >
                <td className="py-3">{c.id}</td>
                <td className="py-3 font-medium">{c.name}</td>
                <td className="py-3">{c.company}</td>
                <td className="py-3">{c.email}</td>
                <td className="py-3">{c.phone}</td>
                <td className="py-3 font-semibold">
                  <span className={statusColor(c.status)}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-4">
          These are demo clients. Once Firebase is connected, this page will
          automatically load all client records assigned to the logged-in sales
          user (or all clients for admins / sales managers).
        </p>
      </div>
    </div>
  );
      }
