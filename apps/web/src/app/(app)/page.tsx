import { redirect } from 'next/navigation';

/**
 * The dashboard root now redirects to the projects list. Projects used to live
 * on `/` as a placeholder; Task 1.2b moved them under `/projects/*` for a
 * cleaner RESTful grouping, so `/` is no longer a destination.
 */
export default function RootPage(): never {
  redirect('/projects');
}
