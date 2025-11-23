<nav className="flex flex-col gap-1 px-2">
  {navItems.map((item) => {
    const normalized = pathname.replace(/\/+$/, ""); // remove trailing slash
    const itemNormalized = item.path.replace(/\/+$/, "");

    const isOverview = itemNormalized === "/admin";

    const active = isOverview
      ? normalized === "/admin"
      : normalized.startsWith(itemNormalized);

    return (
      <Link
        key={item.path}
        href={item.path}
        className={clsx(
          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
          active
            ? "bg-blue-600 text-white"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
      >
        {!collapsed && (
          <span className="flex items-center gap-3">
            {item.icon}
            {item.label}
          </span>
        )}
        {collapsed && (
          <span className="text-sm font-semibold">{item.icon}</span>
        )}
      </Link>
    );
  })}
</nav>
