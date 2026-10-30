import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night } from '../src/digest/types.js';

const DASH = '\u2014';

const FULL_NIGHT = '2026-01-01';
const EMPTY_NIGHT = '2026-01-02';
const BAD_NIGHT = '2026-01-03';
const MISSING_NIGHT = '2026-01-04';

const FULL_LINES = [
  '{"at":"2026-01-01T01:00:00+01:00","job":"sync/users","status":"ok","owner":"ana"}',
  '{"at":"2026-01-01T01:10:00+01:00","job":"backup/db","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-01-01T01:12:00+01:00","job":"report/weekly","status":"ok","owner":"ben"}',
  '{"at":"2026-01-01T01:20:00+01:00","job":"backup/db","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-01-01T01:30:00+01:00","job":"backup/db","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-01-01T01:40:00+01:00","job":"backup/db","status":"ok","owner":null}',
  '{"at":"2026-01-01T02:00:00+01:00","job":"sync/users","status":"ok","owner":"ana"}',
  '{"at":"2026-01-01T02:30:00+01:00","job":"report/weekly","status":"fail","owner":"ben","error":"exit 2: no data"}',
];

const BAD_LINES = [
  '{"at":"2026-01-03T01:00:00+01:00","job":"sync/users","status":"ok","owner":"ana"}',
  '{"at":"2026-01-03T01:05:00+01:00","job":"backup/db","status":"fail","owner":null,"error":"disk full"}',
  '{"at":"2026-01-03T01:00:00+01:00","job":"x/y',
];

const FULL_ROWS: DigestRow[] = [
  {
    job: 'backup/db',
    owner: null,
    runs: 4,
    retries: 3,
    lastStatus: 'ok',
    lastError: 'timeout',
    first: '2026-01-01T01:10:00+01:00',
    last: '2026-01-01T01:40:00+01:00',
  },
  {
    job: 'report/weekly',
    owner: 'ben',
    runs: 2,
    retries: 0,
    lastStatus: 'fail',
    lastError: 'exit 2: no data',
    first: '2026-01-01T01:12:00+01:00',
    last: '2026-01-01T02:30:00+01:00',
  },
  {
    job: 'sync/users',
    owner: 'ana',
    runs: 2,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    first: '2026-01-01T01:00:00+01:00',
    last: '2026-01-01T02:00:00+01:00',
  },
];

const BAD_ROWS: DigestRow[] = [
  {
    job: 'backup/db',
    owner: null,
    runs: 1,
    retries: 0,
    lastStatus: 'fail',
    lastError: 'disk full',
    first: '2026-01-03T01:05:00+01:00',
    last: '2026-01-03T01:05:00+01:00',
  },
  {
    job: 'sync/users',
    owner: 'ana',
    runs: 1,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    first: '2026-01-03T01:00:00+01:00',
    last: '2026-01-03T01:00:00+01:00',
  },
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(path.join(tmpdir(), 'rig-runs-'));
  writeFileSync(path.join(runsDir, `${FULL_NIGHT}.jsonl`), `${FULL_LINES.join('\n')}\n`);
  writeFileSync(path.join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
  writeFileSync(path.join(runsDir, `${BAD_NIGHT}.jsonl`), `${BAD_LINES.join('\n')}\n`);
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function headings(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1] ?? '');
}

function dataRows(html: string): string[] {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]).filter((tr) => tr.includes('<td'));
}

function rowFor(html: string, job: string): string {
  return dataRows(html).find((tr) => tr.includes(job)) ?? '';
}

function jobsInOrder(html: string, jobs: string[]): string[] {
  const pattern = new RegExp(jobs.join('|'), 'g');
  return [...new Set([...html.matchAll(pattern)].map((m) => m[0]))];
}

describe('GET /digest/:night', () => {
  it('renders a heading and one table row per job, sorted by job', async () => {
    const res = await app.request(`/digest/${FULL_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(headings(html).some((h) => h.includes(`digest ${FULL_NIGHT}`))).toBe(true);
    expect(html).toContain('<table');
    expect(dataRows(html)).toHaveLength(FULL_ROWS.length);
    expect(jobsInOrder(html, FULL_ROWS.map((r) => r.job))).toEqual(FULL_ROWS.map((r) => r.job));
  });

  it('renders a missing owner as a dash', async () => {
    const html = await (await app.request(`/digest/${FULL_NIGHT}`)).text();
    expect(rowFor(html, 'backup/db')).toContain(DASH);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('renders an empty file as "nothing ran"', async () => {
    const res = await app.request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders a night with a bad line and reports it', async () => {
    const res = await app.request(`/digest/${BAD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(jobsInOrder(html, BAD_ROWS.map((r) => r.job))).toEqual(BAD_ROWS.map((r) => r.job));
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows sorted by job, with counts', async () => {
    const res = await app.request(`/api/digest/${FULL_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body).toEqual({
      night: FULL_NIGHT,
      rows: FULL_ROWS,
      badLines: 0,
      counts: { ok: expect.any(Number), retry: expect.any(Number), fail: expect.any(Number) },
    });
  });

  it('returns 404 as JSON for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });

  it('returns no rows for an empty file', async () => {
    const res = await app.request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('keeps the valid rows and counts the bad line', async () => {
    const res = await app.request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toEqual(BAD_ROWS);
  });
});

describe('page and JSON agree', () => {
  it.each([FULL_NIGHT, BAD_NIGHT])('list the same jobs in the same order for %s', async (night) => {
    const page = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as Night;
    const jobs = body.rows.map((r) => r.job);
    expect(jobsInOrder(page, jobs)).toEqual(jobs);
  });
});
