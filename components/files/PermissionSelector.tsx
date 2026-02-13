"use client";

export function PermissionSelector({ value, onChange }: { value: "private" | "team" | "public"; onChange: (v: "private" | "team" | "public") => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as "private" | "team" | "public")}> 
      <option value="private">Private</option>
      <option value="team">Team</option>
      <option value="public">Public</option>
    </select>
  );
}
