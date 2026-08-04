import { requireUser } from '@/features/auth';

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Проекты</h1>
      <p className="mt-2 text-fg-muted">
        Вы вошли как {user.name ?? user.email}. Список проектов появится в задаче 1.2b.
      </p>
    </>
  );
}
