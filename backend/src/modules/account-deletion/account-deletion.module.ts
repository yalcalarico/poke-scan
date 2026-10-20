import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountSuppressionService } from './account-suppression.service.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { LocalSuppressionJournal, SUPPRESSION_JOURNAL } from './suppression-journal.js';
import { localCustodyConfig, LocalSimulatedSuppressionCustody, SUPPRESSION_CUSTODY } from './suppression-custody.js';

@Global()
@Module({
  providers: [AccountSuppressionService, AccountDeletionService, {
    provide: SUPPRESSION_CUSTODY, inject: [ConfigService], useFactory: (config: ConfigService) => {
      const custody = localCustodyConfig(config);
      return custody ? new LocalSimulatedSuppressionCustody(custody) : undefined;
    },
  }, {
    provide: SUPPRESSION_JOURNAL, inject: [ConfigService], useFactory: (config: ConfigService) => {
      const mode = config.get<string>('ACCOUNT_DELETION_MODE', 'disabled');
      if (mode === 'disabled') return undefined;
      if (mode !== 'local-private') throw new Error('ACCOUNT_DELETION_MODE inválido');
      return new LocalSuppressionJournal({ journalDirectory: config.getOrThrow<string>('ACCOUNT_DELETION_JOURNAL_DIR'), checkpointDirectory: config.getOrThrow<string>('ACCOUNT_DELETION_CHECKPOINT_DIR'), hmacKey: config.getOrThrow<string>('ACCOUNT_DELETION_HMAC_KEY') });
    },
  }],
  exports: [AccountSuppressionService, AccountDeletionService],
})
export class AccountDeletionModule {}
