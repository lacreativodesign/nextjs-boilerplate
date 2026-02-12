"use client";

import { useRef, useState } from "react";

type Props = {
  onFileSelected: (file: File) => void;
  accepted?: string;
};

export default function FileUploadDropzone({ onFileSelected, accepted = ".csv,.xml,.xls" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFileSelected(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
        isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accepted}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
      <p className="text-sm font-medium">Drop CSV or Excel XML file here</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Supported formats: .csv, .xml, .xls</p>
    </div>
  );
}
