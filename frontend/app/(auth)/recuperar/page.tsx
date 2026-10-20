import type { Metadata } from 'next';

import { RecoveryExperience } from '@/components/auth/recovery-experience';

export const metadata: Metadata = {
  title: 'Recuperar cuenta',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default function RecoveryPage() {
  return <RecoveryExperience />;
}
