import SageHero from "../../SageHero";

interface PageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { sessionId } = await params;

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center p-8">
      <SageHero sessionId={sessionId} />
    </div>
  );
}
