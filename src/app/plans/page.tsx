import { getCuratedRecipes } from '@/lib/vaultParser';
import CuratedClientView from './CuratedClientView';

export default async function CuratedPage() {
  const currentRecipes = await getCuratedRecipes('current');
  const archiveRecipes = await getCuratedRecipes('archive');

  return (
    <main className="min-h-screen p-8 overflow-y-auto custom-scrollbar relative text-slate-100">
      <div className="max-w-7xl mx-auto relative z-10 pt-8">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-fuchsia-200 to-indigo-300 mb-4">
            Curated By Sage
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            A weekly magazine of perfected culinary concepts, synthesized specifically for your macronutrient goals and vault context.
          </p>
        </header>

        <CuratedClientView currentRecipes={currentRecipes} archiveRecipes={archiveRecipes} />
      </div>
    </main>
  );
}
