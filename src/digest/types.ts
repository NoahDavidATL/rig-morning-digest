/**
 * Contract for the morning digest (plan § 1). Every part of § 2 builds against this file.
 */
export type JobStatus = 'ok' | 'retry' | 'fail';

/* one parsed line of runs/<night>.jsonl */
export type RunLine = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: JobStatus;
  lastError: string | null;
  first: string;
  last: string;
};

export type StatusCounts = Record<JobStatus, number>;

export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: StatusCounts;
};

/**
 * Reads one night's run log into digest rows.
 * @param runsDir directory holding <YYYY-MM-DD>.jsonl files
 * @param night the night, YYYY-MM-DD
 * @returns the night's rows sorted by job, or null when the night has no file
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
