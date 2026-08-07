/**
 * Specification data as the UI and API surface it. A deliberate subset of the
 * `Specification` row: `deletedAt` is never part of the view (soft-deletes are
 * filtered in the service, not leaked through the DTO). The list item view also
 * drops `content` — versions are large (`@db.Text`) and only fetched when one
 * is opened, so the list endpoint never returns bodies.
 */
export interface SpecificationListItemView {
  id: string;
  version: number;
  createdAt: Date;
  createdBy: 'USER' | 'AI';
  approvedAt: Date | null;
}

/**
 * Full specification body. Used by the single-version read, create result, and
 * approve result — the preview panel needs `content` and `approvedAt` together.
 */
export interface SpecificationView {
  id: string;
  version: number;
  content: string;
  createdAt: Date;
  createdBy: 'USER' | 'AI';
  approvedAt: Date | null;
}
