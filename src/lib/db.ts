import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient | null };

let _prismaInstance: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (_prismaInstance) return _prismaInstance;
  
  if (globalForPrisma.prisma) {
    _prismaInstance = globalForPrisma.prisma;
    return _prismaInstance;
  }

  const prismaOptions: any = {
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  };

  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl && dbUrl.startsWith('prisma+postgres')) {
    // Local dev: Prisma Accelerate / Prisma Postgres protocol
    prismaOptions.accelerateUrl = dbUrl;
  } else if (!dbUrl) {
    // If DATABASE_URL is missing, we use a dummy accelerateUrl format to satisfy
    // Prisma 7 constructor validation during Next.js static build pre-rendering.
    // No database queries are executed in Guest Mode.
    prismaOptions.accelerateUrl = 'prisma+postgres://localhost:51213/?api_key=dummy';
  }
  // For direct PostgreSQL URLs (postgresql://...), Prisma reads from the
  // schema datasource block via env("DATABASE_URL") — no constructor option needed.

  _prismaInstance = new PrismaClient(prismaOptions);
  
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = _prismaInstance;
  }
  
  return _prismaInstance;
}

// Export a Proxy that intercepts all property accesses and forwards them to the lazily initialized PrismaClient.
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
  set(target, prop, value, receiver) {
    const client = getPrismaClient();
    return Reflect.set(client, prop, value, receiver);
  }
});


