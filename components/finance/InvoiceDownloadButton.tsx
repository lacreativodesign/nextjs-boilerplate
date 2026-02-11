"use client";

import { useState } from "react";
import LoadingButton from "@/components/ui/LoadingButton";
import { Download } from "lucide-react";
import { toastError } from "@/lib/toast";

interface InvoiceDownloadButtonProps {
  invoiceId: string;
  invoiceNumber: string;
}

export function InvoiceDownloadButton({ invoiceId, invoiceNumber }: InvoiceDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await fetch(`/api/admin/finance/invoices/${invoiceId}/pdf`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Invoice PDF download error:", error);
      toastError("Failed to download invoice PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <LoadingButton
      className="btn ghost"
      onClick={handleDownload}
      loading={downloading}
      loadingText="Generating"
      style={{ borderRadius: 999 }}
    >
      <Download className="mr-2 h-4 w-4" />
      Download PDF
    </LoadingButton>
  );
}
