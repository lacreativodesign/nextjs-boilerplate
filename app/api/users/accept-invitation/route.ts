import { NextResponse } from "next/server";
import { z } from "zod";
import { UserService } from "@/lib/users/user-service";

export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = acceptSchema.parse(body);

    const userId = await UserService.acceptInvitation({
      token: data.token,
      name: data.name,
      password: data.password,
    });

    return NextResponse.json({ userId });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
