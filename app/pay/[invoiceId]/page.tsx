"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type PublicInvoiceResponse = {
  ok: boolean;
  alreadyPaid?: boolean;
  paidAt?: string | null;
  error?: string;
  invoice?: {
    id: string;
    orderId: string;
    amount: number;
    subtotal: number | null;
    taxAmount: number;
    currency: string;
    status: string;
    dueDate: string | null;
    lineItems: Array<{ description?: string; name?: string; quantity?: number; qty?: number; unitPrice?: number; unitPriceUsd?: number; total?: number }>;
    notes: string | null;
  };
  tenant?: {
    name: string;
    logoUrl: string | null;
    acceptsPayments: boolean;
  };
  client?: {
    companyName: string | null;
    contactName: string | null;
  };
};

type StripeCardElement = { mount: (selector: string) => void; destroy: () => void };
type StripeElements = { create: (type: string, options?: Record<string, unknown>) => StripeCardElement };
type StripePaymentMethodResult = { error?: { message?: string }; paymentMethod?: { id: string } };
type StripeActionResult = { error?: { message?: string }; paymentIntent?: { id: string } };
type StripeInstance = {
  elements: () => StripeElements;
  createPaymentMethod: (params: { type: string; card: StripeCardElement }) => Promise<StripePaymentMethodResult>;
  handleCardAction: (clientSecret: string) => Promise<StripeActionResult>;
};

declare global {
  interface Window {
    Stripe?: (key: string) => StripeInstance;
  }
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount || 0);
}

function dateValue(input?: string | null) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

export default function PublicInvoicePaymentPage({ params }: { params: { invoiceId: string } }) {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicInvoiceResponse | null>(null);
  const [paidState, setPaidState] = useState<"none" | "success" | "already">("none");
  const [receiptEmail, setReceiptEmail] = useState("");
  const stripeRef = useRef<StripeInstance | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);

  useEffect(() => {
    let active = true;
    async function loadInvoice() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/public/invoice/${encodeURIComponent(params.invoiceId)}`, { cache: "no-store" });
        const payload = (await res.json()) as PublicInvoiceResponse;
        if (!active) return;

        if (!res.ok || !payload.ok) {
          setError(payload.error || "This invoice could not be found or is no longer available.");
          return;
        }

        if (payload.alreadyPaid) {
          setData(payload);
          setPaidState("already");
          return;
        }

        setData(payload);
      } catch {
        if (!active) return;
        setError("This invoice could not be found or is no longer available.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInvoice();
    return () => {
      active = false;
      cardRef.current?.destroy();
    };
  }, [params.invoiceId]);

  useEffect(() => {
    if (loading || error || !data?.invoice || !data.tenant?.acceptsPayments || paidState !== "none") return;

    let cancelled = false;
    async function setupStripe() {
      if (window.Stripe) {
        initStripe();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = () => {
        if (!cancelled) initStripe();
      };
      script.onerror = () => {
        if (!cancelled) setError("Unable to load payment form. Please refresh and try again.");
      };
      document.body.appendChild(script);
    }

    function initStripe() {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!key || !window.Stripe) {
        setError("Payments are currently unavailable.");
        return;
      }
      if (cardRef.current) return;

      const stripe = window.Stripe(key);
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#1a1a1a",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            "::placeholder": { color: "#9ca3af" },
          },
          invalid: { color: "#dc2626" },
        },
      });
      card.mount("#public-invoice-card-element");
      stripeRef.current = stripe;
      cardRef.current = card;
    }

    setupStripe();
    return () => {
      cancelled = true;
    };
  }, [loading, error, data, paidState]);

  const totalLabel = useMemo(() => {
    if (!data?.invoice) return "";
    return `${money(data.invoice.amount, data.invoice.currency)} ${data.invoice.currency}`;
  }, [data]);

  async function payInvoice() {
    if (!stripeRef.current || !cardRef.current || !data?.invoice) return;

    setProcessing(true);
    setError(null);

    try {
      const pm = await stripeRef.current.createPaymentMethod({ type: "card", card: cardRef.current });
      if (pm.error || !pm.paymentMethod?.id) {
        setError(pm.error?.message || "Unable to process card details.");
        return;
      }

      const payRes = await apiFetch(`/api/public/invoice/${encodeURIComponent(params.invoiceId)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pm.paymentMethod.id, email: receiptEmail || undefined }),
      });
      const payPayload = await payRes.json();

      if (!payRes.ok || !payPayload.ok) {
        setError(payPayload.error || "Payment failed. Please check your card details and try again.");
        return;
      }

      if (payPayload.status === "succeeded") {
        setPaidState("success");
        return;
      }

      if (payPayload.status === "requires_action") {
        const actionResult = await stripeRef.current.handleCardAction(String(payPayload.clientSecret || ""));
        if (actionResult.error || !actionResult.paymentIntent?.id) {
          setError(actionResult.error?.message || "Authentication failed. Please try again.");
          return;
        }

        const confirmRes = await apiFetch(`/api/public/invoice/${encodeURIComponent(params.invoiceId)}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: actionResult.paymentIntent.id }),
        });
        const confirmPayload = await confirmRes.json();

        if (confirmRes.ok && confirmPayload.ok && confirmPayload.status === "succeeded") {
          setPaidState("success");
          return;
        }

        setError(confirmPayload.error || "Payment could not be confirmed. Please try again.");
        return;
      }

      setError("Payment failed. Please check your card details and try again.");
    } catch {
      setError("Payment failed. Please check your card details and try again.");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#fff", padding: 20 }}>Loading invoice…</div>;
  }

  const tenantName = data?.tenant?.name || "Company";
  const invoice = data?.invoice;

  if (error || !invoice) {
    return (
      <main style={{ minHeight: "100vh", background: "#fff", padding: 20, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 10 }}>Invoice Unavailable</h1>
        <p style={{ color: "#dc2626" }}>{error || "This invoice is no longer available."}</p>
      </main>
    );
  }

  if (paidState === "already") {
    return (
      <main style={{ minHeight: "100vh", background: "#fff", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 500 }}>
          <div style={{ fontSize: 48, color: "#16a34a" }}>✓</div>
          <h1 style={{ fontSize: 30, margin: "10px 0" }}>Invoice Already Paid</h1>
          <p>This invoice was paid on {dateValue(data.paidAt) || "a previous date"}.</p>
          <p style={{ marginTop: 6, fontWeight: 600 }}>{tenantName}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff", padding: "20px 12px 40px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          {data.tenant?.logoUrl ? (
            <img src={data.tenant.logoUrl} alt={tenantName} style={{ maxHeight: 48, width: "auto", objectFit: "contain", margin: "0 auto" }} />
          ) : (
            <div style={{ fontWeight: 800, fontSize: 24 }}>{tenantName}</div>
          )}
          <div style={{ height: 1, background: "#e5e7eb", marginTop: 14 }} />
        </header>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Invoice {invoice.orderId}</h2>
          <p style={{ margin: "6px 0", color: "#4b5563" }}>From: {tenantName}</p>
          {(data.client?.companyName || data.client?.contactName) && (
            <p style={{ margin: "6px 0", color: "#4b5563" }}>To: {data.client.companyName || data.client.contactName}</p>
          )}
          <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />

          {invoice.lineItems.length > 0 && (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 0" }}>Description</th>
                      <th style={{ textAlign: "right", padding: "8px 0" }}>Quantity</th>
                      <th style={{ textAlign: "right", padding: "8px 0" }}>Unit Price</th>
                      <th style={{ textAlign: "right", padding: "8px 0" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item, idx) => {
                      const quantity = Number(item.quantity ?? item.qty ?? 1);
                      const unitPrice = Number(item.unitPrice ?? item.unitPriceUsd ?? 0);
                      const total = Number(item.total ?? quantity * unitPrice);
                      return (
                        <tr key={`${item.description || item.name || "item"}-${idx}`}>
                          <td style={{ padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>{item.description || item.name || "Item"}</td>
                          <td style={{ padding: "8px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>{quantity}</td>
                          <td style={{ padding: "8px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>{money(unitPrice, invoice.currency)}</td>
                          <td style={{ padding: "8px 0", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>{money(total, invoice.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0" }} />
            </>
          )}

          {typeof invoice.subtotal === "number" && Math.abs(invoice.subtotal - invoice.amount) > 0.01 && (
            <SummaryRow label="Subtotal" value={money(invoice.subtotal, invoice.currency)} />
          )}
          {invoice.taxAmount > 0 && <SummaryRow label="Tax" value={money(invoice.taxAmount, invoice.currency)} />}
          <SummaryRow label="Total Due" value={money(invoice.amount, invoice.currency)} emphasized />
          {invoice.dueDate && <p style={{ marginTop: 10, color: "#4b5563" }}>Due: {dateValue(invoice.dueDate)}</p>}
        </section>

        {paidState === "success" ? (
          <section style={{ border: "1px solid #bbf7d0", borderRadius: 12, padding: 18, textAlign: "center", background: "#f0fdf4" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#16a34a", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto", fontSize: 38 }}>
              ✓
            </div>
            <h3 style={{ fontSize: 28, margin: "14px 0 8px" }}>Payment Successful!</h3>
            <p>Your payment of {money(invoice.amount, invoice.currency)} has been received.</p>
            <p>A receipt has been sent to {receiptEmail || "your email"} if provided.</p>
            <p>Thank you for your payment.</p>
          </section>
        ) : data.tenant?.acceptsPayments ? (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Pay Securely</h3>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Email for receipt (optional)</label>
            <input
              type="email"
              value={receiptEmail}
              onChange={(e) => setReceiptEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}
            />
            <div id="public-invoice-card-element" style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12, minHeight: 44 }} />
            <button
              type="button"
              onClick={payInvoice}
              disabled={processing}
              style={{
                marginTop: 12,
                width: "100%",
                height: 52,
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                background: "linear-gradient(90deg, #012167 0%, #6692f9 100%)",
                opacity: processing ? 0.7 : 1,
              }}
            >
              {processing ? "Processing..." : `Pay ${totalLabel}`}
            </button>
            <p style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>🔒 Payments are processed securely by Stripe. Your card details are never stored.</p>
            {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
          </section>
        ) : (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Online payment is not available for this invoice.</p>
            <p>Please contact {tenantName} directly to arrange payment.</p>
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryRow({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: emphasized ? 20 : 15, fontWeight: emphasized ? 700 : 500 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
