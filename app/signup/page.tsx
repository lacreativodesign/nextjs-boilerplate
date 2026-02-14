import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up - Bizosto ERP',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SignupPageProps {
  searchParams?: {
    newPassword?: string;
    [key: string]: string | string[] | undefined;
  };
}

export default function SignupPage({ searchParams }: SignupPageProps) {
  // Safe access with optional chaining
  const newPassword = searchParams?.newPassword;
  
  return (
    <div>
      {/* Your signup form JSX here */}
    </div>
  );
}
