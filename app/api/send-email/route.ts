import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: Request) {
  const { to, subject, html } = await req.json();

  await resend.emails.send({
    from: "LA CREATIVO <noreply@lacreativo.com>",
    to,
    subject,
    html
  });

  return Response.json({ ok: true });
}
