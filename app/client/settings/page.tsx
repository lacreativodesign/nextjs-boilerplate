import { redirect } from 'next/navigation';

export default function ClientSettingsRedirect() {
  redirect('/client/profile');
}
