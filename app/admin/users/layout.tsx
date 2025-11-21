import UserTabs from "@/components/users/UserTabs";

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <UserTabs />
      {children}
    </div>
  );
}
