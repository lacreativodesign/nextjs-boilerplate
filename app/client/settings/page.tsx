"use client";

import { useEffect, useMemo, useState } from "react";
import type { SegmentDefinition } from "@/lib/segments";

export default function ClientProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");
  const [employeeCountRange, setEmployeeCountRange] = useState("");
  const [yearsInBusinessRange, setYearsInBusinessRange] = useState("");
  const [segmentServices, setSegmentServices] = useState<string[]>([]);
  const [segmentIndustry, setSegmentIndustry] = useState("");
  const [segmentBusinessType, setSegmentBusinessType] = useState("");
  const [segmentGeo, setSegmentGeo] = useState("");

  const [segments, setSegments] = useState<SegmentDefinition[]>([]);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const [profileRes, segmentsRes] = await Promise.all([
          fetch("/api/client/profile", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/client/segments/list", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        const profileJson = await profileRes.json().catch(() => ({}));
        const segmentsJson = await segmentsRes.json().catch(() => ({}));

        if (!profileRes.ok || !profileJson?.ok) {
          throw new Error(profileJson?.error || "Failed to load profile");
        }
        if (!segmentsRes.ok || !segmentsJson?.ok) {
          throw new Error(segmentsJson?.error || "Failed to load segments");
        }

        if (!alive) return;
        const client = profileJson.client || {};

        setCompanyName(String(client.companyName || ""));
        setIndustry(String(client.industry || ""));
        setBusinessType(String(client.businessType || ""));
        setCountry(String(client.country || ""));
        setCity(String(client.city || ""));
        setTimezone(String(client.timezone || ""));
        setEmployeeCountRange(String(client.employeeCountRange || ""));
        setYearsInBusinessRange(String(client.yearsInBusinessRange || ""));
        setSegmentServices(Array.isArray(client.segmentServices) ? client.segmentServices : []);
        setSegmentIndustry(String(client.segmentIndustry || ""));
        setSegmentBusinessType(String(client.segmentBusinessType || ""));
        setSegmentGeo(String(client.segmentGeo || ""));

        setSegments(Array.isArray(segmentsJson?.segments) ? segmentsJson.segments : []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load profile");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  const segmentsByType = useMemo(() => {
    const grouped: Record<string, SegmentDefinition[]> = {};
    segments.forEach((segment) => {
      if (!grouped[segment.type]) grouped[segment.type] = [];
      grouped[segment.type].push(segment);
    });
    return grouped;
  }, [segments]);

  const segmentLookup = useMemo(() => {
    const map: Record<string, SegmentDefinition> = {};
    segments.forEach((segment) => {
      map[segment.slug] = segment;
    });
    return map;
  }, [segments]);

  const employeeRanges = ["1-5", "6-10", "11-25", "26-50", "51-100", "101-250", "251-500", "500+"];
  const yearsRanges = ["<1", "1-3", "4-7", "8-12", "13-20", "20+"];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/client/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          industry: (segmentLookup[segmentIndustry]?.name || industry).trim(),
          businessType: (segmentLookup[segmentBusinessType]?.name || businessType).trim(),
          country: country.trim(),
          city: city.trim(),
          timezone: timezone.trim(),
          employeeCountRange,
          yearsInBusinessRange,
          segmentServices,
          segmentIndustry,
          segmentBusinessType,
          segmentGeo,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update profile");

      setSuccess("Profile updated successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ color: "rgba(15,23,42,0.7)" }}>Loading profile...</div>;
  }

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Profile Settings</h1>
      <p style={{ color: "rgba(15,23,42,0.65)", marginBottom: 20 }}>
        Update your business profile details for accurate client segmentation.
      </p>

      <div
        style={{
          borderRadius: 20,
          padding: 18,
          border: "1px solid rgba(15,23,42,0.10)",
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 18px 55px rgba(15,23,42,0.10)",
        }}
      >
        {error ? <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div> : null}
        {success ? <div style={{ color: "rgba(15,23,42,0.7)", marginBottom: 12 }}>{success}</div> : null}

        <form onSubmit={onSubmit}>
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(15,23,42,0.02)",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>
              Company Profile
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Company Name</div>
              <input className="input" value={companyName} disabled />
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Industry</div>
                <select
                  className="input"
                  value={segmentIndustry}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setSegmentIndustry(slug);
                    setIndustry(segmentLookup[slug]?.name || "");
                  }}
                >
                  <option value="">Select Industry</option>
                  {(segmentsByType.industry || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Business Type</div>
                <select
                  className="input"
                  value={segmentBusinessType}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setSegmentBusinessType(slug);
                    setBusinessType(segmentLookup[slug]?.name || "");
                  }}
                >
                  <option value="">Select Business Type</option>
                  {(segmentsByType.business_type || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Country</div>
                <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>City</div>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Timezone</div>
                <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Geo Segment</div>
                <select className="input" value={segmentGeo} onChange={(e) => setSegmentGeo(e.target.value)}>
                  <option value="">Select Geo</option>
                  {(segmentsByType.geo || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Employee Count</div>
                <select
                  className="input"
                  value={employeeCountRange}
                  onChange={(e) => setEmployeeCountRange(e.target.value)}
                >
                  <option value="">Select Range</option>
                  {employeeRanges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Years in Business</div>
                <select
                  className="input"
                  value={yearsInBusinessRange}
                  onChange={(e) => setYearsInBusinessRange(e.target.value)}
                >
                  <option value="">Select Range</option>
                  {yearsRanges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div>
              <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
                Services
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(segmentsByType.service || []).map((segment) => {
                  const checked = segmentServices.includes(segment.slug);
                  return (
                    <label
                      key={segment.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.35)",
                        background: checked ? "rgba(59,130,246,0.08)" : "transparent",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSegmentServices((prev) =>
                            prev.includes(segment.slug)
                              ? prev.filter((slug) => slug !== segment.slug)
                              : [...prev, segment.slug]
                          );
                        }}
                      />
                      {segment.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" type="submit" disabled={saving} style={{ fontWeight: 400 }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
