import { PrismaClient } from '@prisma/client';

declare global {
    var __starbeam_prisma__: PrismaClient | undefined;
}
declare const prisma: PrismaClient;

export { prisma };
