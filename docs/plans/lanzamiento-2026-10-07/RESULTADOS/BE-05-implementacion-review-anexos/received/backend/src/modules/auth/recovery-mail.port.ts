export const RECOVERY_MAIL_PORT = Symbol('RECOVERY_MAIL_PORT');

export interface RecoveryMail {
  readonly recipient: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly caseGeneration: number;
}

export interface RecoveryMailPort {
  readonly available: boolean;
  readonly caseGeneration: number;
  deliver(mail: RecoveryMail, signal: AbortSignal, authorizeHandoff: () => Promise<boolean>): Promise<void>;
}

export class UnavailableRecoveryMailPort implements RecoveryMailPort {
  readonly available = false;
  readonly caseGeneration = 0;
  async deliver(_mail: RecoveryMail, _signal: AbortSignal, _authorizeHandoff: () => Promise<boolean>): Promise<void> {}
}
