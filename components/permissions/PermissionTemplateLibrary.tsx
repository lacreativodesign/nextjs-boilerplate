"use client";

import { PERMISSION_TEMPLATES } from "@/lib/permissions/templates";

type Props = {
  onApply: (templateKey: string) => Promise<void>;
};

export function PermissionTemplateLibrary({ onApply }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="mb-3 text-sm font-semibold">Permission Template Library</h3>
      <div className="space-y-2">
        {PERMISSION_TEMPLATES.map((template) => (
          <div key={template.key} className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="text-sm font-medium">{template.name}</div>
              <div className="text-xs opacity-70">{template.description}</div>
            </div>
            <button className="rounded border px-3 py-1 text-xs" onClick={() => onApply(template.key)}>
              Apply
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
