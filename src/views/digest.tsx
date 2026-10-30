import type { Night } from '../digest/types.js';
import { byJob, flagOf } from '../digest/flags.js';

const MISSING = '\u2014';

function orDash(value: string | null): string {
  return value ? value : MISSING;
}

export function DigestPage({ night }: { night: Night }) {
  const rows = byJob(night.rows);
  return (
    <>
      <h1>digest {night.night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const flag = flagOf(row);
              return (
                <tr class={flag ? 'warn' : undefined} data-flag={flag ?? undefined}>
                  <td>{row.job}</td>
                  <td>{orDash(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{orDash(row.lastError)}</td>
                  <td>{row.first}</td>
                  <td>{row.last}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {night.badLines > 0 && (
        <p class="mute">
          {night.badLines === 1 ? '1 line could not be read' : `${night.badLines} lines could not be read`}
        </p>
      )}
    </>
  );
}

export function NoRunLog({ night }: { night: string }) {
  return (
    <>
      <h1>digest {night}</h1>
      <p class="mute">no run log for {night}</p>
    </>
  );
}
