import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

export function autoPurgeVercelDeployments(maxSlots = 3) {
  const scriptPath = fileURLToPath(new URL('./auto_purge_vercel.cjs', import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, `--keep=${maxSlots}`], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`auto_purge_vercel.cjs 실행 실패 (exit=${result.status ?? 'unknown'})`);
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();

if (isEntrypoint) {
  const keepArg = process.argv.find((arg) => arg.startsWith('--keep='));
  const parsedKeep = keepArg ? Number.parseInt(keepArg.slice('--keep='.length), 10) : 3;
  autoPurgeVercelDeployments(Number.isFinite(parsedKeep) && parsedKeep >= 1 ? parsedKeep : 3);
}
