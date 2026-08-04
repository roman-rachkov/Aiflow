'use client';

import { useState } from 'react';

import { Button, Field, Input } from '@aiflow/ui';

import { signInWithCredentials } from '../model/actions';

/**
 * Sign-in form. User-facing strings are Russian per the language policy in
 * CLAUDE.md; comments and identifiers stay English.
 */
export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const message = await signInWithCredentials(formData);

    // A successful sign-in redirects inside the action and never returns, so
    // reaching here at all means it failed.
    setError(message);
    setPending(false);
  }

  return (
    <form action={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <Field label="Электронная почта">
        <Input type="email" name="email" required autoComplete="email" invalid={error !== null} />
      </Field>

      <Field label="Пароль">
        <Input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          invalid={error !== null}
        />
      </Field>

      {error !== null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Вход…' : 'Войти'}
      </Button>
    </form>
  );
}
