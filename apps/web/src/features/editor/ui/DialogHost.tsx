'use client';

import { ConfirmDialog, PromptDialog } from './dialogs';

export type DialogState =
  | { kind: 'create'; isDir: boolean }
  | { kind: 'rename'; path: string }
  | { kind: 'delete'; path: string };

type Props = {
  dialog: DialogState;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAction: (value?: string) => void;
};

export function DialogHost({ dialog, pending, error, onClose, onAction }: Props) {
  if (dialog.kind === 'delete') {
    return (
      <ConfirmDialog
        title="Удалить файл?"
        body={`Файл «${dialog.path}» будет удалён из репозитория.`}
        confirmLabel="Удалить"
        pending={pending}
        error={error}
        onConfirm={() => {
          onAction();
        }}
        onClose={onClose}
      />
    );
  }

  if (dialog.kind === 'create') {
    return (
      <PromptDialog
        title={dialog.isDir ? 'Новая папка' : 'Новый файл'}
        label="Путь"
        initial={dialog.isDir ? 'folder/' : 'file.ts'}
        confirmLabel="Создать"
        pending={pending}
        error={error}
        onConfirm={(value) => {
          onAction(value);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <PromptDialog
      title="Переименовать"
      label="Новый путь"
      initial={dialog.path}
      confirmLabel="Переименовать"
      pending={pending}
      error={error}
      onConfirm={(value) => {
        onAction(value);
      }}
      onClose={onClose}
    />
  );
}
