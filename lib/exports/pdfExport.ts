import React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ProfitLossReport } from "@/lib/reports/profitLoss";

interface TenantInfo {
  name: string;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 12, marginTop: 10, marginBottom: 6 },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    borderBottomStyle: "solid",
    paddingVertical: 4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, fontWeight: 700 },
  metric: { marginTop: 10, fontSize: 12 },
});

function currency(amount: number) {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export async function exportProfitLossToPDF(report: ProfitLossReport, tenant: TenantInfo) {
  const document = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, tenant.name),
      React.createElement(Text, { style: styles.subtitle }, "Profit & Loss Statement"),
      React.createElement(
        Text,
        null,
        `${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}`
      ),

      React.createElement(Text, { style: styles.sectionTitle }, "Revenue"),
      ...report.revenue.breakdown.map((item) =>
        React.createElement(
          View,
          { style: styles.tableRow, key: `revenue-${item.category}` },
          React.createElement(Text, null, item.category),
          React.createElement(Text, null, currency(item.amount))
        )
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, null, "Total Revenue"),
        React.createElement(Text, null, currency(report.revenue.total))
      ),

      React.createElement(Text, { style: styles.sectionTitle }, "Expenses"),
      ...report.expenses.breakdown.map((item) =>
        React.createElement(
          View,
          { style: styles.tableRow, key: `expense-${item.category}` },
          React.createElement(Text, null, item.category),
          React.createElement(Text, null, currency(item.amount))
        )
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, null, "Total Expenses"),
        React.createElement(Text, null, currency(report.expenses.total))
      ),

      React.createElement(Text, { style: styles.metric }, `Net Income: ${currency(report.netIncome)}`),
      React.createElement(Text, { style: styles.metric }, `Net Margin: ${report.netMargin.toFixed(2)}%`)
    )
  );

  const blob = await pdf(document).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `Profit-Loss-${new Date().toISOString().split("T")[0]}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
