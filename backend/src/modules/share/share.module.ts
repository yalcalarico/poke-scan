import { Module } from '@nestjs/common';
import { PublicShareController } from './public-share.controller.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

@Module({
  controllers: [ShareController, PublicShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
