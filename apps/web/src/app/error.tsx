'use client';

export default function ErrorPage({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-slate-600">{error.message}</p>
    </div>
  );
}
