import type { NextApiRequest, NextApiResponse } from "next";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM!;

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST") return res.status(405).end();
  const { to, subject, html } = req.body;
  try {
    const r = await resend.emails.send({ from: FROM, to, subject, html });
    return res.json({ ok:true, id:r.id });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error:e.message });
  }
}
