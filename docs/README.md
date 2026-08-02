# AI Studio — Project Documentation Artifacts

Split out of the original `ide.md` draft. Each file is one artifact. The original drafts (`ide.md`, `ide-analize.md`) were superseded and removed.

| File                                                           | Contents                                                                                               | Audience                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- |
| [01-system-spec.md](01-system-spec.md)                         | System specification: purpose, roles, functional blocks, readiness criteria                            | Engineer, Customer (overview) |
| [02-architecture.md](02-architecture.md)                       | High-level architecture: components, networks, isolation, codegen lifecycle                            | Engineer                      |
| [03-data-model.md](03-data-model.md)                           | Data model: public schema, project schema template, dynamic Prisma, encryption                         | Engineer                      |
| [04-roadmap.md](04-roadmap.md)                                 | Development plan: MVP-0 (2 weeks), MVP-1 (6 weeks), tasks, criteria, risks                             | Engineer                      |
| [05-prompt-analyst.md](05-prompt-analyst.md)                   | AI Analyst system prompt (interview, SPEC.md generation)                                               | Platform                      |
| [06-prompt-planner.md](06-prompt-planner.md)                   | AI Planner system prompt (SPEC → task decomposition)                                                   | Platform                      |
| [07-prompt-coder.md](07-prompt-coder.md)                       | AI Coder system prompt (Aider, isolated sandbox)                                                       | Platform                      |
| [08-prompt-reviewer.md](08-prompt-reviewer.md)                 | AI Reviewer system prompt (diff review, ACCEPTED/REJECTED verdict)                                     | Platform                      |
| [09-ui-spec.md](09-ui-spec.md)                                 | UI specification: screen map, components, states, user flows                                           | Engineer                      |
| [10-infrastructure.md](10-infrastructure.md)                   | Docker Compose: all services, networks, volumes, dev/prod modes                                        | Engineer                      |
| [11-sandbox.md](11-sandbox.md)                                 | Codegen sandbox: image Dockerfile, runner.js, dockerode integration                                    | Engineer                      |
| [12-open-questions.md](12-open-questions.md)                   | Open questions from the analysis review                                                                | Engineer                      |
| [13-agent-tooling.md](13-agent-tooling.md)                     | Agent tooling registry: MCP servers, skills, subagents, prompt test log, model tiering, slash commands | Engineer, Platform            |
| [14-decisions-needed.md](14-decisions-needed.md)               | Decisions required before implementation starts, ranked by rework cost                                 | Engineer                      |
| [15-engineering-conventions.md](15-engineering-conventions.md) | Git workflow, module architecture, size limits, linter/formatter, refactoring cadence                  | Engineer, Platform            |

All documents are in English, including role names. The originals were Russian; they were translated wholesale as a token-cost measure. See the language policy in [`CLAUDE.md`](../CLAUDE.md): internal agent traffic in English, user-facing output in the user's language.
