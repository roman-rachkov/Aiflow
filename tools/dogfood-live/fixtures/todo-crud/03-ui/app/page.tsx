'use client';

import { useCallback, useEffect, useState } from 'react';

type Todo = { id: string; title: string; done: boolean };

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/todos');
    if (!res.ok) {
      setError('Failed to load todos');
      return;
    }
    const data = (await res.json()) as { todos: Todo[] };
    setTodos(data.todos);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTodo(): Promise<void> {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      setError('Failed to add todo');
      return;
    }
    setTitle('');
    await load();
  }

  async function toggleTodo(id: string, done: boolean): Promise<void> {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !done }),
    });
    await load();
  }

  async function deleteTodo(id: string): Promise<void> {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <main>
      <h1>Todo list</h1>
      {error ? <p>{error}</p> : null}
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New todo"
          aria-label="New todo title"
        />
        <button type="button" onClick={() => void addTodo()}>
          Add
        </button>
      </div>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => void toggleTodo(todo.id, todo.done)}
              />
              {todo.title}
            </label>
            <button type="button" onClick={() => void deleteTodo(todo.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
