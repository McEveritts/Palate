import { getCuratedRecipes, getVaultRecipes } from '@/lib/vaultParser';
import { CalendarView } from '@/app/plans/CalendarView';

export default async function CalendarPage() {
  const currentRecipes = await getCuratedRecipes('current');
  const archiveRecipes = await getCuratedRecipes('archive');
  const vaultRecipes = await getVaultRecipes();

  return (
    <main className="min-h-screen p-8 overflow-y-auto custom-scrollbar relative text-slate-100">
      <div className="max-w-7xl mx-auto relative z-10 pt-8">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-fuchsia-200 to-indigo-300 mb-4">
            Culinary Calendar
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto font-medium">
            Schedule your curated and vault recipes, manage leftover storage decay, and dynamically scale portions.
          </p>
        </header>

        <CalendarView 
          currentRecipes={currentRecipes} 
          archiveRecipes={archiveRecipes} 
          vaultRecipes={vaultRecipes}
        />
      </div>
    </main>
  );
}
