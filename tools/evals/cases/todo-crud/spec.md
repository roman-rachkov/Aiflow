# Todo List

## Goal and context

A simple personal todo list for one user. Create, list, complete, and delete todos.

## Users and roles

Single authenticated owner. No multi-tenant or guest access.

## Functional requirements

### Screen/Page "Todo list"

- List todos with title and done flag.
- Add a todo with a non-empty title.
- Toggle done / not done.
- Delete a todo.

## Background processes

None.

## Data entities

- User: id, email, name
- Todo: id, title, done, ownerId, createdAt

## APIs and integrations

REST under `/api/todos` for list/create/update/delete. Auth via session cookie.

## AI agents and automation

None.

## Non-functional requirements

Next.js App Router, TypeScript, Prisma, PostgreSQL. Soft-delete not required for MVP.

## Assumptions and open questions

Assume email/password auth already exists in the template.
