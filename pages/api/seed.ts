import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth, adminDb } from "../../lib/firebaseAdmin";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.query.key !== "ALLOW") return res.status(403).end();

  const batch = adminDb.batch();
  const users = [
    { email:"admin@lacreativo.com", password:"Test1234!", role:"admin", name:"Admin Alice" },
    { email:"sales@lacreativo.com", password:"Test1234!", role:"sales", name:"Sales Sam" },
    { email:"am@lacreativo.com",    password:"Test1234!", role:"am",    name:"AM Ayesha" },
    { email:"prod@lacreativo.com",  password:"Test1234!", role:"production", name:"Prod Paul" },
    { email:"hr@lacreativo.com",    password:"Test1234!", role:"hr",    name:"HR Hana" },
    { email:"client@lacreativo.com",password:"Test1234!", role:"client",name:"Client Chris" },
  ];

  for (const u of users) {
    const user = await adminAuth.createUser({ email:u.email, password:u.password });
    batch.set(adminDb.collection("users").doc(user.uid), {
      email:u.email, name:u.name, role:u.role, createdAt:new Date()
    });
  }

  await batch.commit();
  res.json({ ok:true });
}
