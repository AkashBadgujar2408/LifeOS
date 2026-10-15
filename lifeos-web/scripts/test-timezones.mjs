// Runs the unit tests once per timezone, because the date helpers (local days, DST, UTC bounds) only show their
// bugs away from the developer's own zone. `npm run test:tz`.
//
// TZ is set here, in Node, on purpose: Git Bash (MSYS) strips a TZ set on the command line before it reaches a
// Windows program, so `TZ=America/New_York npx ng test` silently runs in the machine's own zone.
import { execSync } from 'node:child_process';

const zones = [
  'America/New_York', // DST, west of UTC
  'Europe/London', // DST, at/near UTC
  'America/Los_Angeles', // late-evening local = next UTC day
  'Pacific/Kiritimati', // UTC+14: local day starts the previous UTC day
  'Pacific/Pago_Pago', // UTC-11
  'Australia/Lord_Howe', // 30-minute DST shift
];

let failed = false;
for (const tz of zones) {
  const env = { ...process.env, TZ: tz };
  let output;
  try {
    output = execSync('npx ng test --watch=false', {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  } catch (error) {
    failed = true;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const summary = clean.match(/Tests\s+[^\n]*/)?.[0].trim() ?? 'no summary';
  console.log(`${tz.padEnd(22)} ${summary}`);
  if (/fail/i.test(summary)) {
    failed = true;
    console.log(
      clean
        .split('\n')
        .filter((line) => /FAIL|×|AssertionError/.test(line))
        .join('\n'),
    );
  }
}
process.exit(failed ? 1 : 0);
