import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesRead, requireSalesWrite, serverTimestamp } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({
      ok: true,
      user: {
        uid: auth.user.uid,
        emailSignature: auth.user.emailSignature || "",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Unable to load profile." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const signature = parseString(body.emailSignature, "").trim();

    await adminDb.collection("users").doc(auth.user.uid).set(
      {
        emailSignature: signature,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, emailSignature: signature });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Unable to update signature." }, { status: 500 });
  }
}
