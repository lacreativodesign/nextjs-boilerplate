export type ThemeMode = "light" | "dark" | "system";

const DEFAULT_FONT = "Inter";
const FONT_ALLOWLIST = ["Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Montserrat", "Nunito", "Source Sans Pro"];

function normalizeHex(input: string) {
  const value = String(input || "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(value)) {
    throw new Error(`Invalid color format: ${input}`);
  }
  return value;
}

function hexToRgb(hex: string) {
  const color = normalizeHex(hex).slice(1);
  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    if (channel <= 0.03928) return channel / 12.92;
    return ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrastRatio(foregroundHex: string, backgroundHex: string) {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function validateColorPalette(primary: string, secondary: string, accent: string) {
  const normalizedPrimary = normalizeHex(primary);
  const normalizedSecondary = normalizeHex(secondary);
  const normalizedAccent = normalizeHex(accent);

  const contrastAgainstWhite = {
    primary: contrastRatio(normalizedPrimary, "#ffffff"),
    secondary: contrastRatio(normalizedSecondary, "#ffffff"),
    accent: contrastRatio(normalizedAccent, "#ffffff"),
  };

  const minimum = 3;
  const invalid = Object.entries(contrastAgainstWhite).filter(([, ratio]) => ratio < minimum);
  if (invalid.length > 0) {
    throw new Error(
      `Color contrast too low against white surface for: ${invalid.map(([name]) => name).join(", ")}. Minimum ratio is ${minimum}:1.`
    );
  }

  return {
    primaryColor: normalizedPrimary,
    secondaryColor: normalizedSecondary,
    accentColor: normalizedAccent,
    contrastAgainstWhite,
  };
}

export function generateThemeCssVariables(branding: {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
}) {
  const palette = validateColorPalette(branding.primaryColor, branding.secondaryColor, branding.accentColor);
  const font = FONT_ALLOWLIST.includes(branding.fontFamily) ? branding.fontFamily : DEFAULT_FONT;

  return {
    "--erp-blue": palette.primaryColor,
    "--erp-blue-hover": palette.secondaryColor,
    "--erp-blue-soft": `${palette.primaryColor}1f`,
    "--chart-series-1": palette.primaryColor,
    "--chart-series-2": palette.accentColor,
    "--focus-ring": `0 0 0 3px ${palette.primaryColor}33`,
    "--brand-accent": palette.accentColor,
    "--brand-font": `"${font}", system-ui`,
  };
}

export function getAllowedBrandFonts() {
  return FONT_ALLOWLIST;
}
