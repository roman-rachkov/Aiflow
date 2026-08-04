import { Button } from '@aiflow/ui';

import { signOut } from '../model/nextauth';

/** Signed-in user's identity plus a sign-out control, for the app header. */
export function UserBadge({ email, name }: { email: string; name: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-fg-muted">{name ?? email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/signin' });
        }}
      >
        <Button type="submit" variant="ghost" size="sm">
          Выйти
        </Button>
      </form>
    </div>
  );
}
