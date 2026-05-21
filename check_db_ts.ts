import { prisma } from './src/lib/db';

async function main() {
  const meals = await prisma.scheduledMeal.findMany({
    include: {
      recipe: true
    }
  });
  console.log('Meals in DB:', JSON.stringify(meals, null, 2));
}

main().catch(console.error);
