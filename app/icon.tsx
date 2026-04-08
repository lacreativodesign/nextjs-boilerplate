import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: "linear-gradient(135deg, #012167 0%, #6692f9 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 20,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          B
        </span>
      </div>
    ),
    { ...size }
  );
}
