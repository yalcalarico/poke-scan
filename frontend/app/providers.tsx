'use client';

import type { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/hooks/use-auth';
import { CurrencyProvider } from '@/hooks/use-currency';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CurrencyProvider>
          <ToastProvider>{children}</ToastProvider>
        </CurrencyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
