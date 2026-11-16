const { execSync } = require('child_process');

const DEFAULT_PROJECT = 'ebro_fl';
const DEFAULT_KEEP = 3;
const IN_PROGRESS_STATES = new Set(['BUILDING', 'QUEUED', 'INITIALIZING']);
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 150000;
const BATCH_SIZE = 10;

function parseArgs(argv) {
  let keepCount = Number.parseInt(process.env.VERCEL_KEEP_COUNT || '', 10);
  if (!Number.isFinite(keepCount) || keepCount < 1) {
    keepCount = DEFAULT_KEEP;
  }
  let projectName = (process.env.VERCEL_PROJECT_NAME || '').trim() || DEFAULT_PROJECT;
  let waitForBuilding = true;

  for (const arg of argv) {
    if (arg.startsWith('--keep=')) {
      const parsed = Number.parseInt(arg.slice('--keep='.length), 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        keepCount = parsed;
      } else {
        throw new Error(`유효하지 않은 --keep 값입니다: ${arg}`);
      }
    } else if (arg.startsWith('--project=')) {
      const val = arg.slice('--project='.length).trim();
      if (val) projectName = val;
    } else if (arg === '--no-wait') {
      waitForBuilding = false;
    } else if (!arg.startsWith('--') && arg.trim()) {
      projectName = arg.trim();
    }
  }

  return { keepCount, projectName, waitForBuilding };
}

function getCliConfig() {
  const token = (process.env.VERCEL_TOKEN || '').trim();
  const scope = (process.env.VERCEL_SCOPE || 'dragonrpa').trim();
  if (process.env.CI && !token) {
    console.warn('[Auto-Purge] CI 환경에서 VERCEL_TOKEN이 설정되지 않아 퍼지를 건너뜁니다.');
    process.exit(0);
  }
  const vercelCmd = process.platform === 'win32' ? 'npx.cmd vercel' : 'npx vercel';
  const authFlags = token ? ` --token "${token}" --scope "${scope}"` : '';
  return { vercelCmd, authFlags };
}

function getTargetKey(deployment) {
  return deployment.url || deployment.uid || deployment.id || '';
}

function fetchAllDeployments(projectName, cliConfig) {
  const { vercelCmd, authFlags } = cliConfig;
  const allDeployments = [];
  const seenKeys = new Set();
  let nextToken = null;

  while (true) {
    const nextFlag = nextToken ? ` --next ${nextToken}` : '';
    const cmd = `${vercelCmd} list ${projectName} --limit 100 -F json --yes${authFlags}${nextFlag}`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) {
      throw new Error(`Vercel CLI JSON 출력을 파싱할 수 없습니다: ${output}`);
    }
    const data = JSON.parse(output.slice(jsonStart));
    const pageDeployments = Array.isArray(data.deployments) ? data.deployments : [];

    for (const d of pageDeployments) {
      const key = getTargetKey(d);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        allDeployments.push(d);
      }
    }

    const nextCursor = data.pagination && data.pagination.next ? String(data.pagination.next) : null;
    if (nextCursor && nextCursor !== nextToken) {
      nextToken = nextCursor;
    } else {
      break;
    }
  }

  allDeployments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return allDeployments;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInProgressDeployments(projectName, cliConfig, initialDeployments) {
  let deployments = initialDeployments;
  const startTime = Date.now();

  while (deployments.some((d) => IN_PROGRESS_STATES.has(d.state))) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_WAIT_MS) {
      const stillBuilding = deployments
        .filter((d) => IN_PROGRESS_STATES.has(d.state))
        .map((d) => `${getTargetKey(d)}(${d.state})`);
      console.warn(
        `[Auto-Purge] 대기 시간(${MAX_WAIT_MS / 1000}초) 초과. 진행 중 배포는 보존하고 퍼지를 진행합니다: ${stillBuilding.join(', ')}`
      );
      break;
    }

    const buildingCount = deployments.filter((d) => IN_PROGRESS_STATES.has(d.state)).length;
    console.log(
      `[Auto-Purge] 진행 중 배포 ${buildingCount}건 완료 대기 중 (${Math.round(elapsed / 1000)}초 경과)...`
    );
    await sleep(POLL_INTERVAL_MS);
    deployments = fetchAllDeployments(projectName, cliConfig);
  }

  return deployments;
}

function removeBatchOrFallback(batchTargets, cliConfig) {
  const { vercelCmd, authFlags } = cliConfig;
  let removed = 0;

  try {
    const batchCmd = `${vercelCmd} remove ${batchTargets.join(' ')} --yes${authFlags}`;
    execSync(batchCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`[Auto-Purge] 배치 삭제 완료 (${batchTargets.length}건): ${batchTargets.join(', ')}`);
    return batchTargets.length;
  } catch (batchErr) {
    console.warn(
      `[Auto-Purge] 배치 삭제 일부 실패, 개별 --safe --yes 모드로 재시도합니다: ${batchErr.message}`
    );
    for (const target of batchTargets) {
      try {
        const singleCmd = `${vercelCmd} remove ${target} --safe --yes${authFlags}`;
        execSync(singleCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(`[Auto-Purge] 개별 삭제 완료: ${target}`);
        removed += 1;
      } catch (singleErr) {
        console.warn(`[Auto-Purge] 개별 삭제 건너뜀 (${target}): ${singleErr.message}`);
      }
    }
    return removed;
  }
}

async function main() {
  const { keepCount, projectName, waitForBuilding } = parseArgs(process.argv.slice(2));
  const cliConfig = getCliConfig();

  console.log(`[Auto-Purge] 프로젝트=${projectName}, 보존 개수=${keepCount}, 빌드 대기=${waitForBuilding}`);
  let deployments = fetchAllDeployments(projectName, cliConfig);
  console.log(`[Auto-Purge] 초기 조회 완료: 총 ${deployments.length}건`);

  if (waitForBuilding) {
    deployments = await waitForInProgressDeployments(projectName, cliConfig, deployments);
  }

  const protectedKeys = new Set();
  for (const d of deployments) {
    if (IN_PROGRESS_STATES.has(d.state)) {
      const key = getTargetKey(d);
      if (key) protectedKeys.add(key);
    }
  }

  const readyDeploys = deployments
    .filter((d) => d.state === 'READY')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const keptReady = readyDeploys.slice(0, keepCount);
  for (const d of keptReady) {
    const key = getTargetKey(d);
    if (key) protectedKeys.add(key);
  }

  const errorDeploys = deployments.filter((d) => d.state === 'ERROR' || d.state === 'CANCELED');
  const excessReady = readyDeploys.slice(keepCount);

  const deleteTargets = [];
  const deleteSeen = new Set();
  for (const d of [...errorDeploys, ...excessReady]) {
    const key = getTargetKey(d);
    if (key && !protectedKeys.has(key) && !deleteSeen.has(key)) {
      deleteSeen.add(key);
      deleteTargets.push(key);
    }
  }

  console.log(
    `[Auto-Purge] 보존 대상 READY=${keptReady.length}건, 삭제 대상=${deleteTargets.length}건 (ERROR/CANCELED=${errorDeploys.length}건, 초과 READY=${excessReady.length}건)`
  );

  let deletedTotal = 0;
  for (let i = 0; i < deleteTargets.length; i += BATCH_SIZE) {
    const batch = deleteTargets.slice(i, i + BATCH_SIZE);
    deletedTotal += removeBatchOrFallback(batch, cliConfig);
  }

  const remaining = fetchAllDeployments(projectName, cliConfig);
  console.log(`[Auto-Purge] 완료: ${deletedTotal}건 삭제, 잔여 배포 ${remaining.length}건:`);
  remaining.forEach((d, idx) => {
    const ts = d.createdAt ? new Date(d.createdAt).toISOString() : 'unknown';
    console.log(`  [${idx + 1}] ${getTargetKey(d)} (${d.state}, ${ts})`);
  });
}

main().catch((err) => {
  console.error('[Auto-Purge] 실행 실패:', err);
  process.exit(1);
});
