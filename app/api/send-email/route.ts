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
function generatePassword() {
  // 10–12 char secure password
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}
