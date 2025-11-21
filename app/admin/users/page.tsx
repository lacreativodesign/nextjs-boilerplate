export default function UsersPage() {
  const tabs = [
    { label: "All Users", path: "/admin/users" },
    { label: "Create User", path: "/admin/users/create" },
    { label: "View Users", path: "/admin/users/view" },
    { label: "Activity Log", path: "/admin/users/activity" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
        User Management
      </h2>

      <div
        style={{
          display: "flex",
          gap: 20,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
          paddingBottom: 10,
        }}
      >
        {tabs.map((tab) => (
          <a
            key={tab.path}
            href={tab.path}
            style={{
              fontSize: 16,
              paddingBottom: 8,
              borderBottom:
                tab.path === "/admin/users"
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
              fontWeight: tab.path === "/admin/users" ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <p style={{ color: "var(--sidebar-text)" }}>Select a tab above.</p>
    </div>
  );
            }
