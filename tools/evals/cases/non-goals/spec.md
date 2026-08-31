# Recipe Notes

## Goal and context

A private notebook for cooking recipes. One cook stores title, ingredients, and steps.

## Users and roles

Single owner after login.

## Functional requirements

### Screen/Page "Recipes"

- List recipes by title.
- Create and edit recipe (title, ingredients text, steps text).
- Delete recipe.

## Background processes

None.

## Data entities

- User: id, email
- Recipe: id, title, ingredients, steps, ownerId

## APIs and integrations

REST `/api/recipes`. Session auth only.

## AI agents and automation

None.

## Non-functional requirements

Next.js, TypeScript, Prisma, PostgreSQL.

## Assumptions and open questions

### Non-goals

- No payments or Stripe checkout.
- No social sharing or public gallery.
- No OAuth provider integrations beyond existing credentials login.
