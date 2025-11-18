import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const result = await resend.emails.send({
      from: "La Creativo ERP <no-reply@lacreativo.com>",
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
