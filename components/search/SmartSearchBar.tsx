"use client";

import { Search, X } from "lucide-react";

interface SmartSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Reusable, fully controlled smart search bar.
 *
 * - Theme-aware (uses --surface-card / --border-subtle / --text-muted).
 * - Matches across multiple fields at once (filtering lives on the page).
 * - Built-in clear (×) button replaces any external "Reset" button.
 * - No internal value state, no filter logic — purely presentational.
 */
export function SmartSearchBar({
  value,
  onChange,
  placeholder = "Search by name, email, ID, phone…",
  className,
}: SmartSearchBarProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
      }}
    >
      <Search
        size={18}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 12,
          color: "var(--text-muted)",
          pointerEvents: "none",
        }}
      />

      <input
        className="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          background: "transparent",
          border: "none",
          paddingLeft: 40,
          paddingRight: value ? 40 : 12,
        }}
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          style={{
            position: "absolute",
            right: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            minHeight: 0,
            padding: 0,
            border: "none",
            borderRadius: 999,
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default SmartSearchBar;
