import { redirect } from 'next/navigation';

export default function Home() {
  // Simple redirect to dashboard, the dashboard will redirect to login if not authenticated
  redirect('/dashboard');
}
