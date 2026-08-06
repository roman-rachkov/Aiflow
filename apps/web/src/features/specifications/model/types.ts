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
 * Full specification body. Used by the single-version read and the create
 * result, where the caller needs `content`. `approvedAt` is intentionally
 * absent: approval is a separate flow from authorship, and create always
 * returns an unapproved version (`createdBy: 'AI'`).
 */
export interface SpecificationView {
  id: string;
  version: number;
  content: string;
  createdAt: Date;
  createdBy: 'USER' | 'AI';
}
