import type { Metadata } from 'next';

import { AccountDeletionExperience } from '@/components/auth/account-deletion-experience';

export const metadata: Metadata = {
  title: 'Eliminar cuenta',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default function AccountDeletionPage() {
  return <AccountDeletionExperience />;
}
