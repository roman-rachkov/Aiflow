/**
 * Project data as the UI and API surface it. A deliberate subset of the
 * `ProjectMeta` row: `schemaName` is an internal routing key (never shown to
 * the user, never sent to the client through this type), and `deletedAt` /
 * `ownerId` are not part of the view either — ownership is checked in the
 * service layer, not leaked through the DTO.
 */
export interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}
