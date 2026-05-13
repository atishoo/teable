/* eslint-disable @typescript-eslint/naming-convention */
import type { Provider } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { InitBootstrapService } from './init-bootstrap.service';

export const InitBootstrapProvider: Provider = {
  provide: InitBootstrapService,
  useFactory: async (prismaService: PrismaService) => {
    const initBootstrapService = new InitBootstrapService(prismaService);

    await initBootstrapService.init();

    return initBootstrapService;
  },
  inject: [PrismaService],
};
