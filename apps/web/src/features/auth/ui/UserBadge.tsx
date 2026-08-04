import { signOut } from '../model/nextauth';

/** Signed-in user's identity plus a sign-out control, for the app header. */
export function UserBadge({ email, name }: { email: string; name: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600">{name ?? email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/signin' });
        }}
      >
        <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-900">
          Выйти
        </button>
      </form>
    </div>
  );
}
