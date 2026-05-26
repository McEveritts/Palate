const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPaths = [path.join(process.cwd(), '.env'), path.join(process.cwd(), '.env.local')];
  envPaths.forEach(p => {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content.split(/\r?\n/);
      lines.forEach(line => {
        const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
        if (match) {
          let val = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          process.env[match[1]] = val;
        }
      });
    }
  });
}

loadEnv();

let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.startsWith('prisma+postgres')) {
  // Fall back to direct TCP URL for prisma dev locally
  dbUrl = "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";
}

const prismaOptions = {};
if (dbUrl) {
  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  prismaOptions.adapter = adapter;
} else {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient(prismaOptions);

async function main() {
  const slugsToDelete = ['matcha-chia-pudding', 'algorithmic-salmon-bowl', 'optimized-tonkotsu-matrix'];
  console.log('Initiating database eradication for slugs:', slugsToDelete);
  
  const result = await prisma.recipe.deleteMany({
    where: {
      slug: {
        in: slugsToDelete
      }
    }
  });
  
  console.log(`Successfully eradicated ${result.count} recipe records from all household databases!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
