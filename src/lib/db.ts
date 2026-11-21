import { PrismaClient } from "@prisma/client";
import { prismaConnectionUrl } from "@/lib/databaseUrl";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: prismaConnectionUrl() } },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
