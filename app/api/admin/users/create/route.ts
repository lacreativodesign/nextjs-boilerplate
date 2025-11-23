import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      password,
      role,
      phone,
      cnic,
      address,
      city,
      country,
      department,
      joiningDate,
      dob,
      salary,
      targetMonthly,
    } = body;

    // 1️⃣ Create Auth User
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    });

    // 2️⃣ Save Firestore Profile
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role,
      status: "Active",
      phone: phone || null,
      cnic: cnic || null,
      address: address || null,
      city: city || null,
      country: country || null,
      department: department || null,
      joiningDate: joiningDate || null,
      dob: dob || null,
      salary: salary || null,
      targetMonthly: targetMonthly || null,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });

    // 3️⃣ Send emails
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "Your LA Creativo Dashboard Access",
        html: `
          <p>Hello ${name},</p>
          <p>Your user account has been created.</p>
          <p><b>Dashboard:</b> https://dashboard.lacreativo.com</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Password:</b> ${password}</p>
        `,
      }),
    });

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "admin@lacreativo.com",
        subject: "New ERP User Created",
        html: `
          <p>A new user has been added.</p>
          <p><b>Name:</b> ${name}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Role:</b> ${role}</p>
        `,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
