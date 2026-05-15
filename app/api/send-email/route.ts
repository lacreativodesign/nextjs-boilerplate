import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getCurrentUser } from "@/lib/tenant/server";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

  const { to, subject, html } = body;

  if (!to || !subject || !html) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service unavailable: RESEND_API_KEY missing." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from: "Bizosto <support@bizosto.com>",
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Email error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send email." },
      { status: 500 }
    );
  }
}
