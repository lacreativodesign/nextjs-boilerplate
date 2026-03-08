import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

type InvoicePdfLineItem = {
  description: string;
  details?: string | null;
  quantity: number;
  rate: number;
  amount: number;
};

type InvoicePdfData = {
  invoiceNumber: string;
  issueDate?: string | null;
  dueDate?: string | null;
  status: string;
  lineItems: InvoicePdfLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  taxLabel?: string | null;
  total: number;
  amountPaid: number;
  notes?: string | null;
  paymentTerms?: number | null;
};

type TenantPdfData = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

type ClientPdfData = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 40,
  },
  companyInfo: {
    textAlign: "right",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 4,
  },
  value: {
    color: "#1F2937",
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableCol1: { width: "50%" },
  tableCol2: { width: "15%", textAlign: "right" },
  tableCol3: { width: "15%", textAlign: "right" },
  tableCol4: { width: "20%", textAlign: "right" },
  totals: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    width: "50%",
  },
  totalLabel: {
    width: "60%",
    textAlign: "right",
    paddingRight: 20,
  },
  totalValue: {
    width: "40%",
    textAlign: "right",
    fontWeight: "bold",
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    fontSize: 9,
    color: "#6B7280",
  },
  statusBadge: {
    color: "white",
    padding: 8,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: "bold",
  },
});

export interface InvoicePDFProps {
  invoice: InvoicePdfData;
  tenant: TenantPdfData;
  client: ClientPdfData;
}

const formatMoney = (amount: number) => `$${amount.toFixed(2)}`;

const formatDate = (isoDate?: string | null) => {
  if (!isoDate) return "-";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US");
};

const getStatusColor = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("paid")) return "#10B981";
  if (normalized.includes("sent")) return "#3B82F6";
  if (normalized.includes("overdue")) return "#EF4444";
  if (normalized.includes("draft")) return "#6B7280";
  return "#6B7280";
};

export const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, tenant, client }) => {
  const primaryColor = tenant.primaryColor || "#2563eb";
  const secondaryColor = tenant.secondaryColor || "#1d4ed8";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {tenant.logoUrl ? <Image src={tenant.logoUrl} style={styles.logo} /> : null}
            <Text style={{ fontSize: 18, fontWeight: "bold", marginTop: 10 }}>{tenant.name || "Your Company"}</Text>
            {tenant.address ? <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>{tenant.address}</Text> : null}
            <Text style={{ fontSize: 10, color: "#6B7280" }}>
              {[tenant.email, tenant.phone].filter(Boolean).join(" | ") || "-"}
            </Text>
          </View>

          <View style={styles.companyInfo}>
            <Text style={{ ...styles.title, color: primaryColor }}>INVOICE</Text>
            <Text style={styles.label}>Invoice #: {invoice.invoiceNumber || "-"}</Text>
            <Text style={styles.value}>Date: {formatDate(invoice.issueDate)}</Text>
            <Text style={styles.value}>Due: {formatDate(invoice.dueDate)}</Text>
            <View style={{ ...styles.statusBadge, backgroundColor: getStatusColor(invoice.status), marginTop: 10 }}>
              <Text>{(invoice.status || "Draft").toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>BILL TO:</Text>
          <Text style={styles.value}>{client.name || "Client"}</Text>
          {client.email ? <Text style={styles.value}>{client.email}</Text> : null}
          {client.phone ? <Text style={styles.value}>{client.phone}</Text> : null}
          {client.address ? <Text style={styles.value}>{client.address}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={{ ...styles.tableHeader, backgroundColor: `${primaryColor}22` }}>
            <Text style={styles.tableCol1}>Description</Text>
            <Text style={styles.tableCol2}>Qty</Text>
            <Text style={styles.tableCol3}>Rate</Text>
            <Text style={styles.tableCol4}>Amount</Text>
          </View>

          {invoice.lineItems.map((item, index) => (
            <View key={`${item.description}-${index}`} style={styles.tableRow}>
              <View style={styles.tableCol1}>
                <Text style={{ fontWeight: "bold" }}>{item.description || "-"}</Text>
                {item.details ? <Text style={{ fontSize: 9, color: "#6B7280", marginTop: 2 }}>{item.details}</Text> : null}
              </View>
              <Text style={styles.tableCol2}>{item.quantity.toFixed(2)}</Text>
              <Text style={styles.tableCol3}>{formatMoney(item.rate)}</Text>
              <Text style={styles.tableCol4}>{formatMoney(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>{formatMoney(invoice.subtotal || 0)}</Text>
          </View>

          {invoice.discount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount:</Text>
              <Text style={styles.totalValue}>-{formatMoney(invoice.discount)}</Text>
            </View>
          ) : null}

          {invoice.tax > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{invoice.taxLabel || `Tax (${invoice.taxRate || 0}%)`}:</Text>
              <Text style={styles.totalValue}>{formatMoney(invoice.tax)}</Text>
            </View>
          ) : null}

          <View style={{ ...styles.totalRow, borderTopWidth: 2, borderTopColor: secondaryColor, paddingTop: 10, marginTop: 10 }}>
            <Text style={{ ...styles.totalLabel, fontSize: 14 }}>TOTAL:</Text>
            <Text style={{ ...styles.totalValue, fontSize: 14 }}>{formatMoney(invoice.total || 0)}</Text>
          </View>

          {invoice.amountPaid > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Amount Paid:</Text>
                <Text style={styles.totalValue}>-{formatMoney(invoice.amountPaid)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Balance Due:</Text>
                <Text style={{ ...styles.totalValue, color: secondaryColor }}>{formatMoney(Math.max((invoice.total || 0) - invoice.amountPaid, 0))}</Text>
              </View>
            </>
          ) : null}
        </View>

        {invoice.notes ? (
          <View style={{ marginTop: 30 }}>
            <Text style={styles.label}>NOTES:</Text>
            <Text style={styles.value}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={{ textAlign: "center" }}>Payment Terms: Net {invoice.paymentTerms || 30} days</Text>
          <Text style={{ textAlign: "center", marginTop: 4 }}>Thank you for your business!</Text>
        </View>
      </Page>
    </Document>
  );
};
