import { redirect } from "next/navigation";

export default function UsersAddRedirectPage() {
  redirect("/admin/users/create");
}
