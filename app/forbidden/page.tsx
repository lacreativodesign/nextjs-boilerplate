import { redirect } from "next/navigation";

export default function ForbiddenRedirectPage() {
  redirect("/unauthorized");
}
