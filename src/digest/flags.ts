import type { DigestRow } from './types.js';

export const RETRY_FLAG_AT = 3;

/**
 * Why a digest row is marked, if it is.
 * @param row one digest row
 * @returns "fail" when the last status is fail, "retries" at RETRY_FLAG_AT retries or more, else null
 */
export function flagOf(row: DigestRow): 'fail' | 'retries' | null {
  if (row.lastStatus === 'fail') return 'fail';
  if (row.retries >= RETRY_FLAG_AT) return 'retries';
  return null;
}

/**
 * Rows in job order. Returns a new array; the input is not touched.
 * @param rows digest rows in any order
 * @returns the rows sorted by job
 */
export function byJob(rows: DigestRow[]): DigestRow[] {
  return [...rows].sort((a, b) => a.job.localeCompare(b.job));
}
