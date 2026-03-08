"use client";

import type { ImportTemplate } from "@/types/import-export";

type Props = {
  templates: ImportTemplate[];
  selectedTemplateId?: string | null;
  onSelect: (templateId: string | null) => void;
};

export default function ImportTemplateSelector({ templates, selectedTemplateId, onSelect }: Props) {
  return (
    <div className="rounded border p-3">
      <label className="mb-2 block text-sm font-semibold">Import template</label>
      <select
        className="w-full rounded border p-2 text-sm"
        value={selectedTemplateId || ""}
        onChange={(event) => onSelect(event.target.value || null)}
      >
        <option value="">No template</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </div>
  );
}
