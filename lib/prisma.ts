import { PrismaClient } from "@prisma/client";

// Guard: Ensure database client is never imported or executed in browser/client components
if (typeof window !== "undefined") {
  throw new Error(
    "PrismaClient is server-only and cannot be executed in the browser environment."
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
