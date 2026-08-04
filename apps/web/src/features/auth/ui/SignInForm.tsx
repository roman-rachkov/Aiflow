'use client';

import { useState } from 'react';

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
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Электронная почта</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-md border border-slate-300 px-3 py-2 outline-hidden focus:border-slate-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Пароль</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-slate-300 px-3 py-2 outline-hidden focus:border-slate-900"
        />
      </label>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
