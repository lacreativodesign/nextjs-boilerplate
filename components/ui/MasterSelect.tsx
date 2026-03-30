"use client";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";

type MasterSelectOption = {
  label: string;
  value: string;
};

type MasterSelectAlign = "left" | "right";

type MasterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: MasterSelectOption[];
  placeholder?: string;
  className?: string;
  align?: MasterSelectAlign;
  buttonStyle?: CSSProperties;
};

const MAX_MENU_HEIGHT = 240;

export default function MasterSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  className,
  align = "left",
  buttonStyle,
}: MasterSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);

    const updatePlacement = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < MAX_MENU_HEIGHT + 12 && spaceAbove > MAX_MENU_HEIGHT + 12) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const selectedLabel = options.find((option) => option.value === value)?.label;
  const displayLabel = selectedLabel ?? placeholder;
  const isPlaceholder = !selectedLabel && !value;

  const baseButtonClass = ["input", className].filter(Boolean).join(" ");

  const menuPositionStyles: React.CSSProperties =
    placement === "top"
      ? { bottom: "calc(100% + 6px)" }
      : { top: "calc(100% + 6px)" };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((prev) => {
        const max = options.length - 1;
        if (max < 0) return -1;
        if (event.key === "ArrowDown") {
          return prev < max ? prev + 1 : 0;
        }
        return prev > 0 ? prev - 1 : max;
      });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (activeIndex >= 0 && options[activeIndex]) {
        onChange(options[activeIndex].value);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={baseButtonClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          textAlign: "left",
          cursor: "pointer",
          ...buttonStyle,
        }}
      >
        <span
          style={{
            color: isPlaceholder
              ? "var(--text-muted)"
              : "inherit",
          }}
        >
          {displayLabel}
        </span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          ref={listRef}
          className="master-select-menu"
          style={{
            position: "absolute",
            left: align === "left" ? 0 : "auto",
            right: align === "right" ? 0 : "auto",
            width: "100%",
            zIndex: 30,
            padding: 8,
            borderRadius: 12,
            display: "grid",
            gap: 4,
            maxHeight: MAX_MENU_HEIGHT,
            overflowY: "auto",
            ...menuPositionStyles,
          }}
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => {
            const active = option.value === value;
            const highlighted = index === activeIndex;
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                role="option"
                aria-selected={active}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className="master-select-option"
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: active
                    ? "var(--surface-muted)"
                    : highlighted
                      ? "var(--table-row-hover)"
                      : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
