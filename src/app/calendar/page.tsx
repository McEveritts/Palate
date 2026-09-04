import { getCuratedRecipes, getVaultRecipes } from '@/lib/vaultParser';
import { CalendarView } from '@/app/plans/CalendarView';

export default async function CalendarPage() {
  const currentRecipes = await getCuratedRecipes('current');
  const archiveRecipes = await getCuratedRecipes('archive');
  const vaultRecipes = await getVaultRecipes();

  return (
    <div className="min-h-full p-3 xs:p-4 sm:p-6 md:p-8 overflow-y-auto custom-scrollbar relative text-slate-100">
      <div className="w-full max-w-[2400px] mx-auto relative z-10 pt-4 sm:pt-6 md:pt-8">
        <header className="mb-8 md:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-fuchsia-200 to-indigo-300 mb-3 sm:mb-4">
            Culinary Calendar
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto font-medium px-4">
            Schedule your curated and vault recipes, manage leftover storage decay, and dynamically scale portions.
          </p>
        </header>

        <CalendarView 
          currentRecipes={currentRecipes} 
          archiveRecipes={archiveRecipes} 
          vaultRecipes={vaultRecipes}
        />
      </div>
    </div>
  );
}
