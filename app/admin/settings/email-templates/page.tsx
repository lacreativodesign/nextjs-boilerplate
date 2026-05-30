"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SettingsAlert } from "../_components/SettingsAlert";
import { EMAIL_TEMPLATE_CATEGORIES, type EmailTemplateCategory } from "@/types/email-templates";

type TemplateTranslation = { subject: string; body: string };
type TemplateRecord = {
  id: string;
  key: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body: string;
  language: string;
  translations: Record<string, TemplateTranslation>;
  variables: string[];
  version: number;
  isActive: boolean;
  updatedAt?: string | null;
};

type TemplateVersion = {
  id: string;
  version: number;
  subject: string;
  body: string;
  createdAt?: string | null;
  updatedBy?: string;
};

const EMPTY_TEMPLATE: Omit<TemplateRecord, "id"> = {
  key: "",
  name: "",
  category: "notification",
  subject: "",
  body: "",
  language: "en",
  translations: {},
  variables: [],
  version: 0,
  isActive: true,
};

export default function EmailTemplatesSettingsPage() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<"all" | EmailTemplateCategory>("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_TEMPLATE);
  const [variables, setVariables] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ renderedSubject: string; renderedHtml: string; locale: string } | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [locale, setLocale] = useState("en");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTemplates = async (category: string = selectedCategory) => {
    setLoading(true);
    setError(null);
    try {
      const qs = category && category !== "all" ? `?category=${category}` : "";
      const res = await fetch(`/api/email/templates${qs}`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Unable to load templates");
      setTemplates(data.templates || []);
    } catch (err) {
      setError(String((err as Record<string, unknown>).message || "Unable to load templates"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates("all");
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const loadTemplateDetails = async (id: string) => {
    try {
      const detailRes = await fetch(`/api/email/templates/${id}`, { cache: "no-store", credentials: "include" });
      const detail = await detailRes.json();
      if (!detailRes.ok || !detail?.ok) throw new Error(detail?.error || "Failed to load template details");

      setDraft({
        key: detail.template.key,
        name: detail.template.name,
        category: detail.template.category,
        subject: detail.template.subject,
        body: detail.template.body,
        language: detail.template.language || "en",
        translations: detail.template.translations || {},
        variables: detail.template.variables || [],
        version: detail.template.version || 0,
        isActive: Boolean(detail.template.isActive),
      });

      if (editorRef.current) editorRef.current.innerHTML = detail.template.body || "";
      setVersions(detail.versions || []);
      if (detail.versions?.length > 1) {
        setCompareA(detail.versions[0].version);
        setCompareB(detail.versions[1].version);
      } else {
        setCompareA(detail.versions?.[0]?.version || null);
        setCompareB(null);
      }

      const varsRes = await fetch(`/api/email/templates/${id}/variables`, { cache: "no-store", credentials: "include" });
      const varsData = await varsRes.json();
      if (varsRes.ok && varsData?.ok) {
        setVariables(varsData.variables || []);
      }
    } catch (err) {
      setError(String((err as Record<string, unknown>).message || "Failed to load template details"));
    }
  };

  const handlePickTemplate = async (id: string) => {
    setSelectedTemplateId(id);
    setSuccess(null);
    setPreview(null);
    await loadTemplateDetails(id);
  };

  const exec = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    setDraft((prev) => ({ ...prev, body: editorRef.current?.innerHTML || "" }));
  };

  const insertTag = (tag: string) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, `{{${tag}}}`);
    setDraft((prev) => ({ ...prev, body: editorRef.current?.innerHTML || "" }));
  };

  const handleCreateNew = () => {
    setSelectedTemplateId(null);
    setPreview(null);
    setVersions([]);
    setDraft(EMPTY_TEMPLATE);
    if (editorRef.current) editorRef.current.innerHTML = "";
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        ...draft,
        body: editorRef.current?.innerHTML || draft.body,
      };
      const isUpdate = Boolean(selectedTemplateId);
      const res = await fetch(isUpdate ? `/api/email/templates/${selectedTemplateId}` : "/api/email/templates", {
        method: isUpdate ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save template");

      setSuccess(isUpdate ? "Template updated." : "Template created.");
      await loadTemplates(selectedCategory);
      if (!isUpdate && data.id) {
        await handlePickTemplate(data.id);
      } else if (selectedTemplateId) {
        await loadTemplateDetails(selectedTemplateId);
      }
    } catch (err) {
      setError(String((err as Record<string, unknown>).message || "Failed to save template"));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplateId) return;
    setError(null);
    try {
      const res = await fetch(`/api/email/templates/${selectedTemplateId}/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to preview template");
      setPreview(data.preview);
    } catch (err) {
      setError(String((err as Record<string, unknown>).message || "Failed to generate preview"));
    }
  };

  const handleSendTest = async () => {
    if (!selectedTemplateId) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/email/templates/${selectedTemplateId}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail, locale }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to send test email");
      setSuccess("Test email sent.");
    } catch (err) {
      setError(String((err as Record<string, unknown>).message || "Failed to send test email"));
    }
  };

  const comparedVersions = useMemo(() => {
    const a = versions.find((item) => item.version === compareA) || null;
    const b = versions.find((item) => item.version === compareB) || null;
    return { a, b };
  }, [versions, compareA, compareB]);

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="card settings-section" style={{ padding: 16, borderRadius: 16 }}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Template Library</h3>
            <button className="btn ghost" onClick={handleCreateNew}>
              New
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold uppercase">Category</label>
            <select
              className="input mt-2"
              value={selectedCategory}
              onChange={async (event) => {
                const next = event.target.value as "all" | EmailTemplateCategory;
                setSelectedCategory(next);
                await loadTemplates(next);
              }}
            >
              <option value="all">All</option>
              {EMAIL_TEMPLATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2 max-h-[620px] overflow-y-auto">
            {loading ? (
              <p className="text-sm opacity-70">Loading templates...</p>
            ) : (
              templates.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left card"
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    borderColor: selectedTemplateId === item.id ? "var(--color-primary,#4f46e5)" : undefined,
                  }}
                  onClick={() => handlePickTemplate(item.id)}
                >
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="text-xs opacity-70">{item.category}</div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-5">
          <div className="card settings-section" style={{ padding: 16, borderRadius: 16 }}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold">Template Name</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold">Template Key</span>
                <input className="input" value={draft.key} onChange={(e) => setDraft((p) => ({ ...p, key: e.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold">Category</span>
                <select
                  className="input"
                  value={draft.category}
                  onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value as EmailTemplateCategory }))}
                >
                  {EMAIL_TEMPLATE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold">Default Language</span>
                <input className="input" value={draft.language} onChange={(e) => setDraft((p) => ({ ...p, language: e.target.value }))} />
              </label>
            </div>

            <label className="space-y-2 mt-4 block">
              <span className="text-sm font-semibold">Subject</span>
              <input className="input" value={draft.subject} onChange={(e) => setDraft((p) => ({ ...p, subject: e.target.value }))} />
            </label>

            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold mr-1">Editor</span>
                <button className="btn ghost" type="button" onClick={() => exec("bold")}>B</button>
                <button className="btn ghost" type="button" onClick={() => exec("italic")}>I</button>
                <button className="btn ghost" type="button" onClick={() => exec("insertUnorderedList")}>• List</button>
                <select className="input w-[260px]" onChange={(e) => e.target.value && insertTag(e.target.value)} defaultValue="">
                  <option value="">Insert merge tag...</option>
                  {(variables.length ? variables : draft.variables).map((item) => (
                    <option key={item} value={item}>
                      {`{{${item}}}`}
                    </option>
                  ))}
                </select>
              </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="mt-3 rounded-xl border p-3 min-h-[260px]" style={{ background: "#ffffff" }}
                onInput={() => setDraft((p) => ({ ...p, body: editorRef.current?.innerHTML || "" }))}
              />
              <div className="mt-3 text-xs opacity-80">
                Supports merge tags (<code>{"{{client.name}}"}</code>), conditionals (<code>{"{{#if approval.comment}}...{{/if}}"}</code>) and loops (
                <code>{"{{#each project.highlights}}...{{/each}}"}</code>).
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn subtle" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : selectedTemplate ? "Update Template" : "Create Template"}
              </button>
              <button className="btn ghost" onClick={handlePreview} disabled={!selectedTemplateId}>
                Generate Preview
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="card settings-section" style={{ padding: 16, borderRadius: 16 }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Preview Panel</h3>
                <div className="flex gap-2 items-center">
                  <input className="input w-24" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="locale" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-3" style={{ background: "#ffffff" }}>
                  <div className="text-xs font-semibold mb-2">Desktop</div>
                  <div className="text-sm font-semibold mb-2">{preview?.renderedSubject || "Preview subject"}</div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: (preview?.renderedHtml || "")
                        .replace(/<script[\s\S]*?<\/script>/gi, "")
                        .replace(/\son\w+="[^"]*"/gi, ""),
                    }}
                  />
                </div>
                <div className="rounded-xl border p-3 max-w-[320px]" style={{ background: "#ffffff" }}>
                  <div className="text-xs font-semibold mb-2">Mobile</div>
                  <div className="text-sm font-semibold mb-2">{preview?.renderedSubject || "Preview subject"}</div>
                  <div
                    className="text-xs"
                    dangerouslySetInnerHTML={{
                      __html: (preview?.renderedHtml || "")
                        .replace(/<script[\s\S]*?<\/script>/gi, "")
                        .replace(/\son\w+="[^"]*"/gi, ""),
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="card settings-section" style={{ padding: 16, borderRadius: 16 }}>
              <h3 className="font-semibold">Send Test Email</h3>
              <div className="mt-3 space-y-2">
                <input
                  type="email"
                  className="input"
                  placeholder="recipient@company.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button className="btn subtle" onClick={handleSendTest} disabled={!selectedTemplateId || !testEmail}>
                  Send Test
                </button>
              </div>
              <p className="helper-text mt-2">Uses current locale and template payload for end-to-end validation.</p>
            </section>
          </div>

          <section className="card settings-section" style={{ padding: 16, borderRadius: 16 }}>
            <h3 className="font-semibold">Version Comparison</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <select className="input" value={compareA ?? ""} onChange={(e) => setCompareA(Number(e.target.value))}>
                <option value="">Select version A</option>
                {versions.map((item) => (
                  <option key={`A-${item.id}`} value={item.version}>
                    v{item.version}
                  </option>
                ))}
              </select>
              <select className="input" value={compareB ?? ""} onChange={(e) => setCompareB(Number(e.target.value))}>
                <option value="">Select version B</option>
                {versions.map((item) => (
                  <option key={`B-${item.id}`} value={item.version}>
                    v{item.version}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-3" style={{ background: "#ffffff" }}>
                <div className="text-xs font-semibold">Version {comparedVersions.a?.version ?? "-"}</div>
                <pre className="text-xs whitespace-pre-wrap mt-2">{comparedVersions.a?.body || "No version selected"}</pre>
              </div>
              <div className="rounded-xl border p-3" style={{ background: "#ffffff" }}>
                <div className="text-xs font-semibold">Version {comparedVersions.b?.version ?? "-"}</div>
                <pre className="text-xs whitespace-pre-wrap mt-2">{comparedVersions.b?.body || "No version selected"}</pre>
              </div>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
