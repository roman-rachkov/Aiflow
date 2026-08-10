/** OpenAI tool definitions for chat:run (Russian descriptions for the model). */

import type { ToolDefinition } from '@aiflow/ai-roles';

export const SPEC_GENERATE_TOOL = 'spec:generate';
export const LIST_TASKS_TOOL = 'list_tasks';
export const TASK_STATUS_TOOL = 'task_status';
export const RUN_PLANNER_TOOL = 'run_planner';
export const RUN_CODER_TOOL = 'run_coder';
export const DEPLOY_TOOL = 'deploy';
export const LIST_FILES_TOOL = 'list_files';
export const READ_FILE_TOOL = 'read_file';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: SPEC_GENERATE_TOOL,
      description:
        'Сгенерировать спецификацию SPEC.md из текущего диалога. Вызывай, когда пользователь просит оформить идею в спецификацию или готов перейти к плану.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: LIST_TASKS_TOOL,
      description:
        'Показать список задач проекта (статус, приоритет, зависимости). Вызывай, когда пользователь спрашивает про задачи или прогресс.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: TASK_STATUS_TOOL,
      description: 'Статус одной задачи и её логи. Нужен taskId.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string', description: 'UUID задачи' } },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: RUN_PLANNER_TOOL,
      description:
        'Запустить планировщик (разбить утверждённую SPEC на задачи). Pro. Нужна утверждённая спецификация.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: RUN_CODER_TOOL,
      description:
        'Запустить кодер (dry-run) для задачи по taskId или title. Pro. Прогресс — в панели Задачи.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID задачи' },
          title: { type: 'string', description: 'Точное или частичное название задачи' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: DEPLOY_TOOL,
      description:
        'Запустить деплой проекта (сборка Docker-образа). Pro. Прогресс — в панели Деплой.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: LIST_FILES_TOOL,
      description: 'Список файлов в репозитории проекта (дерево). Pro.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Каталог относительно корня (пусто = корень)' },
          ref: { type: 'string', description: 'Ветка или коммит' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: READ_FILE_TOOL,
      description: 'Прочитать содержимое одного файла из репозитория. Pro.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь к файлу относительно корня' },
          ref: { type: 'string', description: 'Ветка или коммит' },
        },
        required: ['path'],
      },
    },
  },
];
