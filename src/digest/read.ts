import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, Night, ReadNight, RunLine, StatusCounts } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

/**
 * Parses one log line at the edge; anything that is not a valid run line is rejected.
 * @param text one line of the run log
 * @returns the run line, or null when it does not parse or lacks a required field
 */
export function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (!STATUSES.includes(o.status as JobStatus)) return null;
  if (o.owner !== null && o.owner !== undefined && typeof o.owner !== 'string') return null;
  const line: RunLine = { at: o.at, job: o.job, status: o.status as JobStatus, owner: (o.owner as string | undefined) ?? null };
  if (typeof o.error === 'string') line.error = o.error;
  return line;
}

/**
 * Folds a night's run lines into one row per job, sorted by job.
 * @param night the night, YYYY-MM-DD
 * @param text the whole run log file
 * @returns the digest of that night
 */
export function digest(night: string, text: string): Night {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        first: line.at,
        last: line.at,
      });
      continue;
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (Date.parse(line.at) < Date.parse(row.first)) row.first = line.at;
    if (Date.parse(line.at) >= Date.parse(row.last)) {
      row.last = line.at;
      row.lastStatus = line.status;
      row.owner = line.owner;
      if (line.error) row.lastError = line.error;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return digest(night, text);
};
