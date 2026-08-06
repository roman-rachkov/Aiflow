'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, Input } from '@aiflow/ui';

/**
 * Create-project form. Posts to the REST API (`/api/projects`) rather than a
 * server action: the action would need `requireUser` from the auth slice, and
 * feature-sliced boundaries forbid a sideways feature→feature import
 * (eslint.config.mjs). The API route lives in `app/`, which may import both
 * slices, so it owns auth + delegates to the service. User-facing strings are
 * Russian per CLAUDE.md.
 */
export function CreateProjectForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(new FormData(event.currentTarget));
  }

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);

    const response = await fetch('/api/projects', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const { id } = (await response.json()) as { id: string };
      // Spec (docs/09-ui-spec.md § 3): after create, land on Researcher.
      router.push(`/projects/${id}/research`);
      router.refresh();
      return;
    }

    const { error: message } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setError(message ?? 'Не удалось создать проект. Попробуйте ещё раз.');
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4">
      <Field label="Название">
        <Input name="name" required maxLength={100} invalid={error !== null} />
      </Field>

      <Field label="Описание (необязательно)">
        <Input name="description" maxLength={500} />
      </Field>

      {error !== null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Создание…' : 'Создать проект'}
      </Button>
    </form>
  );
}
