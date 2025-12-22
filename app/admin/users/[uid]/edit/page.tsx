"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  name: string;
  email: string; // visible but NOT editable
  phone: string;
  cnic: string;
  dob: string;
  status: "active" | "disabled";
  role: string;
  department: string;
  designation: string;
  joiningDate: string;

  salary: string; // keep as string in UI, convert to number in API
  monthlyTarget: string;
  commission: string;
};

function toISODateInput(value: any) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // yyyy-mm-dd (for <input type="date" />)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStatus(v: any): "active" | "disabled" {
  const s = String(v || "").toLowerCase();
  return s === "disabled" ? "disabled" : "active";
}

export default function EditUserPage({ params }: { params: { uid: string } }) {
  const router = useRouter();
  const uid = params?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    cnic: "",
    dob: "",
    status: "active",
    role: "",
    department: "",
    designation: "",
    joiningDate: "",
    salary: "",
    monthlyTarget: "",
    commission: "",
  });

  const canSubmit = useMemo(() => {
    // keep it strict but not stupid:
    // email is required for display (and backend keeps it immutable),
    // but if email isn't loaded yet, we shouldn't allow save.
    return (
      !!uid &&
      form.name.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.role.trim().length > 0
    );
  }, [uid, form.name, form.email, form.role]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);
      setOk(null);

      try {
        // ✅ CRITICAL: send cookies, same as your other admin fetches
        const res = await fetch(`/api/admin/users/${uid}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        // Your GET route returns plain text on some errors
        const text = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        if (!res.ok) {
          // If route returned plain text like "Unauthorized"
          const msg = data?.error || text || res.statusText || "Failed to fetch user details.";
          throw new Error(msg);
        }

        // If JSON parsed successfully, use it; else fail
        if (!data || typeof data !== "object") {
          throw new Error("Failed to fetch user details.");
        }

        if (!alive) return;

        setForm({
          name: String(data?.name || ""),
          email: String(data?.email || ""),
          phone: String(data?.phone || ""),
          cnic: String(data?.cnic || ""),
          dob: toISODateInput(data?.dob),
          status: normalizeStatus(data?.status),
          role: String(data?.role || ""),
          department: String(data?.department || ""),
          designation: String(data?.designation || ""),
          joiningDate: toISODateInput(data?.joiningDate),

          salary: data?.salary !== undefined && data?.salary !== null ? String(data.salary) : "",
          monthlyTarget:
            data?.monthlyTarget !== undefined && data?.monthlyTarget !== null ? String(data.monthlyTarget) : "",
          commission:
            data?.commission !== undefined && data?.commission !== null ? String(data.commission) : "",
        });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to fetch user details.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    if (uid) load();

    return () => {
      alive = false;
    };
  }, [uid]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!canSubmit) {
      setErr("Missing required fields.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        uid,
        name: form.name.trim(),
        phone: form.phone.trim(),
        cnic: form.cnic.trim(),
        dob: form.dob ? new Date(form.dob).toISOString() : "",
        status: form.status,
        role: form.role.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        joiningDate: form.joiningDate ? new Date(form.joiningDate).toISOString() : "",

        salary: form.salary === "" ? 0 : Number(form.salary),
        monthlyTarget: form.monthlyTarget === "" ? 0 : Number(form.monthlyTarget),
        commission: form.commission === "" ? 0 : Number(form.commission),
      };

      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ CRITICAL
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to update user");
      }

      setOk("User updated successfully.");
      // optional: refresh list data if user goes back
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>Edit User</h1>
      <div style={{ marginBottom: 18, opacity: 0.75 }}>
        Update profile, work details, payroll and targets. Email is locked.
      </div>

      <div
        className="card"
        style={{
          borderRadius: 20,
          padding: 16,
          // ✅ Shadow like Key-Accounts master UI
          boxShadow: "var(--table-shadow)",
        }}
      >
        {loading ? (
          <div style={{ padding: 8, opacity: 0.8 }}>Loading user...</div>
        ) : err ? (
          <div style={{ padding: 8, color: "#FCA5A5" }}>{err}</div>
        ) : (
          <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }}>
            {ok && <div style={{ color: "rgba(16,185,129,0.95)", fontWeight: 700 }}>{ok}</div>}

            <div className="card" style={{ borderRadius: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>
                PROFILE
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>NAME *</div>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>EMAIL (LOCKED)</div>
                  <input className="input" value={form.email} disabled />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>PHONE</div>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>CNIC</div>
                  <input className="input" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>DATE OF BIRTH</div>
                  <input className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>STATUS</div>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card" style={{ borderRadius: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>
                WORK
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>ROLE *</div>
                  <input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>DEPARTMENT</div>
                  <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>DESIGNATION</div>
                  <input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>JOINING DATE</div>
                  <input
                    className="input"
                    type="date"
                    value={form.joiningDate}
                    onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="card" style={{ borderRadius: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.75 }}>
                PAYROLL & TARGETS
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>SALARY (PKR)</div>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.salary}
                    onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>MONTHLY TARGET (USD)</div>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.monthlyTarget}
                    onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>COMMISSION (%)</div>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={form.commission}
                    onChange={(e) => setForm({ ...form, commission: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn" type="submit" disabled={!canSubmit || saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
