export type SegmentType = "service" | "value" | "business_type" | "industry" | "geo";

export type SegmentDefinition = {
  id: string;
  type: SegmentType;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const segmentDefaults: Record<Exclude<SegmentType, "value">, string[]> = {
  service: [
    "Website Design",
    "Branding",
    "SEO",
    "Social Media",
    "Meta Ads",
    "Maintenance",
    "E-commerce",
  ],
  business_type: [
    "Local Service",
    "E-commerce",
    "SaaS/Tech",
    "Real Estate",
    "Restaurant",
    "Medical",
    "Education",
    "Consulting",
  ],
  industry: [
    "Retail",
    "Healthcare",
    "Real Estate",
    "Hospitality",
    "Education",
    "Professional Services",
    "Tech",
  ],
  geo: ["USA", "UK", "UAE", "Canada", "Australia", "Pakistan"],
};

export const valueBands = [
  { name: "Lead", slug: "lead", min: 0, max: 0 },
  { name: "Starter", slug: "starter", min: 1, max: 999 },
  { name: "Key Account", slug: "key-account", min: 1000, max: 4999 },
  { name: "Whale", slug: "whale", min: 5000, max: Infinity },
];

export function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getValueBand(totalPaidUsd: number) {
  const amount = Number.isFinite(totalPaidUsd) ? totalPaidUsd : 0;
  if (amount <= 0) return valueBands[0];
  if (amount >= 5000) return valueBands[3];
  if (amount >= 1000) return valueBands[2];
  return valueBands[1];
}

export function normalizeSlugArray(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((item) => slugify(String(item))).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => slugify(item))
      .filter(Boolean);
  }
  return [] as string[];
}

export function normalizeOptionalSlug(input: unknown) {
  const slug = slugify(String(input || ""));
  return slug || null;
}
