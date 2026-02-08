import React from "react";

type SpinnerSize = "sm" | "md" | "lg";

type SpinnerProps = {
  size?: SpinnerSize;
  color?: string;
  className?: string;
};

const sizeMap: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

export default function Spinner({ size = "md", color = "currentColor", className = "" }: SpinnerProps) {
  const dimension = sizeMap[size];
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin ${className}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: "9999px",
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: color,
        borderTopColor: "transparent",
      }}
    />
  );
}
