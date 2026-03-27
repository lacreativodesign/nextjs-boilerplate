"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LeadsAddRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sales/leads"); }, [router]);
  return null;
}
