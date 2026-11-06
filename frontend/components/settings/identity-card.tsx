'use client';

import { Avatar, Surface } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/format';
import styles from './settings.module.css';

/** Identidad de la cuenta propia; el guard de Ajustes protege estos datos. */
export function IdentityCard() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Surface as="section" aria-label="Identidad de la cuenta" className={`${styles.panel} ${styles.identity}`}>
      <Avatar src={user.avatarUrl} name={user.displayName} size="xl" className={styles.avatar} />
      <div className={styles.identityCopy}>
        <h2>{user.displayName}</h2>
        <p className={styles.caption}>{user.email}</p>
        <p className={styles.caption}>@{user.username}</p>
      </div>
      <dl className={styles.identityMeta}>
        <dt className={styles.caption}>Miembro desde</dt>
        <dd>{formatDate(user.createdAt)}</dd>
      </dl>
    </Surface>
  );
}
