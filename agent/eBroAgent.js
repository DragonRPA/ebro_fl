/**
 * =========================================================================
 *  e-Bro ERP — 로컬 경량 사이드카 에이전트 (eBroAgent)
 * =========================================================================
 * - 역할: CF R2 파일 로컬 미러링, 로컬 문서고 아카이빙, 프런트 실시간 통신 대행
 * - 통신: 로컬 HTTP (http://127.0.0.1:5175)
 * - 의존성: Node.js 내장 모듈만 사용 (외부 npm 패키지 Zero)
 * =========================================================================
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream');
const { spawn, exec, execSync } = require('child_process');
const { handleStudioRequest, launchStudioWindow, broadcastStudioLog, getAgentPolicy, getTenantPolicy, normalizeTenantCode, updateAgentPolicy, isAiEnabled, handleWebSocketConnection } = require('./studioEngine');
const { WebSocketServer } = require('ws');
const AdmZip = require('adm-zip');

// 🚀 Windows EcoQoS(효율 모드) 절전 스로틀링 원천 차단: 프로세스 우선순위 AboveNormal 격상
try {
  os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL);
} catch (e) {}

//  Windows GUI 서브시스템(무음 백그라운드) 환경 콘솔 크래시 원천 차단
if (process.platform === 'win32') {
  const noop = () => {};
  if (process.stdout && process.stdout.on) process.stdout.on('error', noop);
  if (process.stderr && process.stderr.on) process.stderr.on('error', noop);
  try {
    const origLog = console.log;
    console.log = (...args) => { try { origLog(...args); } catch (e) {} };
    const origErr = console.error;
    console.error = (...args) => { try { origErr(...args); } catch (e) {} };
    const origWarn = console.warn;
    console.warn = (...args) => { try { origWarn(...args); } catch (e) {} };
  } catch (e) {}
}

//  비정상 크래시 원천 차단: 처리되지 않은 예외/거부 포착 가드
process.on('uncaughtException', (err) => {
  agentLog('ERROR', '비정상 예외 포착: ' + (err ? (err.stack || err.message) : err));
});
process.on('unhandledRejection', (reason) => {
  agentLog('ERROR', '비정상 거부 포착: ' + reason);
});

// ── 실시간 에이전트 로그 디스패처 (비동기 마이크로배치 버퍼링 + 5MB 자동 로테이션) ──
const AGENT_EMOJI_STRIP_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu;
const AGENT_LOG_FILE = 'C:\\eBroAgent\\agent.log';
const AGENT_LOG_PREV_FILE = 'C:\\eBroAgent\\agent.prev.log';
const MAX_AGENT_LOG_BYTES = 5 * 1024 * 1024;
let agentLogQueue = [];
let agentLogFlushTimer = null;
let agentLogHiddenApplied = fs.existsSync(AGENT_LOG_FILE);
let agentLogWriteCount = 0;

function rotateAgentLogIfNeeded() {
  try {
    if (!fs.existsSync(AGENT_LOG_FILE)) return;
    const st = fs.statSync(AGENT_LOG_FILE);
    if (st.size > MAX_AGENT_LOG_BYTES) {
      try { if (fs.existsSync(AGENT_LOG_PREV_FILE)) fs.unlinkSync(AGENT_LOG_PREV_FILE); } catch (e) {}
      fs.renameSync(AGENT_LOG_FILE, AGENT_LOG_PREV_FILE);
      agentLogHiddenApplied = false;
    }
  } catch (e) {}
}
rotateAgentLogIfNeeded();

function flushAgentLogsSync() {
  if (agentLogFlushTimer) {
    clearTimeout(agentLogFlushTimer);
    agentLogFlushTimer = null;
  }
  if (agentLogQueue.length === 0) return;
  const batch = agentLogQueue.join('');
  agentLogQueue = [];
  try {
    fs.appendFileSync(AGENT_LOG_FILE, batch, 'utf8');
    if (!agentLogHiddenApplied && process.platform === 'win32') {
      agentLogHiddenApplied = true;
      exec(`attrib +h "${AGENT_LOG_FILE}"`, { windowsHide: true }, () => {});
    }
  } catch (e) {}
}

function flushAgentLogsAsync() {
  agentLogFlushTimer = null;
  if (agentLogQueue.length === 0) return;
  const batch = agentLogQueue.join('');
  agentLogQueue = [];
  if (++agentLogWriteCount >= 200) {
    agentLogWriteCount = 0;
    rotateAgentLogIfNeeded();
  }
  fs.appendFile(AGENT_LOG_FILE, batch, 'utf8', (err) => {
    if (!err && !agentLogHiddenApplied && process.platform === 'win32') {
      agentLogHiddenApplied = true;
      exec(`attrib +h "${AGENT_LOG_FILE}"`, { windowsHide: true }, () => {});
    }
  });
}

process.on('exit', flushAgentLogsSync);

function agentLog(type, message) {
  const cleanType = String(type || 'INFO').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cleanMsg = String(message || '').replace(AGENT_EMOJI_STRIP_RE, '').trim();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const formattedLine = `[${timeStr}] [${cleanType}] ${cleanMsg}`;

  try {
    if (typeof broadcastStudioLog === 'function') {
      broadcastStudioLog(cleanType, cleanMsg);
    }
  } catch (e) {}

  try {
    if (cleanType === 'ERROR') {
      console.error(formattedLine);
    } else if (cleanType === 'WARN') {
      console.warn(formattedLine);
    } else {
      console.log(formattedLine);
    }
  } catch (e) {}

  agentLogQueue.push(formattedLine + '\r\n');
  if (!agentLogFlushTimer) {
    agentLogFlushTimer = setTimeout(flushAgentLogsAsync, 200);
  }
}


const VERSION = 'v2.0.0.Build.49';
const CORE_HASH = '5541aa41dce3';
const PORT = process.env.PORT || 5175;
const CALLSIGN = process.env.AGENT_CALLSIGN || 'admin';
const MACHINE_NAME = os.hostname();
const TENANT_CODE = process.env.AGENT_TENANT || 'GIYEONLIFT';

//  전사 표준 절대경로: C:\eBroAgent\ 및 테넌트별 격리 하위 폴더
const AGENT_HOME = 'C:\\eBroAgent';
const TARGET_EXE_PATH = path.join(AGENT_HOME, 'eBroAgent.exe');
const BASE_ARCHIVE_ROOT = path.join(AGENT_HOME, '문서고');
const BASE_DRIVE_MIRROR_DIR = path.join(AGENT_HOME, 'drive_mirror');
const BASE_HOMETAX_DIR = path.join(AGENT_HOME, 'hometax_invoices');
const ARCHIVE_ROOT = BASE_ARCHIVE_ROOT;
const DRIVE_MIRROR_DIR = BASE_DRIVE_MIRROR_DIR;
const HOMETAX_INVOICES_DIR = BASE_HOMETAX_DIR;
const STATION_CONFIG_FILE = path.join(AGENT_HOME, 'station_config.json');

const VAULT_PREFIX = '__EBRO_ENC__v1__';
const VAULT_CIPHER_KEY = 0x4f;
const TENANT_NS_DIR_RE = /^(GIYEONLIFT|EBRO_FL|EBRO_AWP|EBRO_IT|TENANT_[A-Z0-9_-]+)$/i;

function decryptVaultSecret(cipherText) {
  const rawInput = String(cipherText || '').trim();
  if (!rawInput || !rawInput.startsWith(VAULT_PREFIX)) {
    return rawInput;
  }
  try {
    const raw = rawInput.slice(VAULT_PREFIX.length);
    const sepIdx = raw.indexOf('__');
    if (sepIdx === -1) return '';
    const checksum = raw.slice(0, sepIdx);
    const b64 = raw.slice(sepIdx + 2);
    const buf = Buffer.from(b64, 'base64');
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i] ^ (VAULT_CIPHER_KEY + (i % 7));
    }
    const plainText = out.toString('utf8');
    const digest = crypto.createHash('sha256').update(plainText, 'utf8').digest('hex').slice(0, 8);
    if (digest === checksum) {
      return plainText;
    }
    return '';
  } catch (e) {
    return '';
  }
}

const SHARED_HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 16 });
const SHARED_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 16, keepAliveMsecs: 30000 });
const tenantDirsMemo = new Map();
const stationConfigCache = new Map();
const mirrorBasenameIndexCache = new Map();

function invalidateMirrorIndex(tenantCode) {
  if (tenantCode) {
    mirrorBasenameIndexCache.delete(getEffectiveTenantCode(tenantCode));
  } else {
    mirrorBasenameIndexCache.clear();
  }
}

function getEffectiveTenantCode(hint) {
  const pol = typeof getAgentPolicy === 'function' ? (getAgentPolicy() || {}) : {};
  return normalizeTenantCode(hint || pol.tenantCode || TENANT_CODE || 'GIYEONLIFT');
}

function getTenantDirs(hint) {
  const code = getEffectiveTenantCode(hint);
  const now = Date.now();
  const memo = tenantDirsMemo.get(code);
  if (memo && (now - memo.verifiedAt) < 10000) {
    return memo.dirs;
  }
  const archiveRoot = path.join(BASE_ARCHIVE_ROOT, code);
  const driveMirrorDir = path.join(BASE_DRIVE_MIRROR_DIR, code);
  const dbBackupDir = path.join(archiveRoot, 'DB백업');
  const hometaxDir = path.join(BASE_HOMETAX_DIR, code);
  const stationConfigFile = code === 'GIYEONLIFT'
    ? STATION_CONFIG_FILE
    : path.join(AGENT_HOME, `station_config_${code}.json`);
  try {
    if (!fs.existsSync(archiveRoot)) fs.mkdirSync(archiveRoot, { recursive: true });
    if (!fs.existsSync(driveMirrorDir)) fs.mkdirSync(driveMirrorDir, { recursive: true });
  } catch (e) {}
  const dirs = { tenantCode: code, archiveRoot, driveMirrorDir, dbBackupDir, hometaxDir, stationConfigFile };
  tenantDirsMemo.set(code, { verifiedAt: now, dirs });
  return dirs;
}

function resolveMirrorReadPath(hint, relPath) {
  const code = getEffectiveTenantCode(hint);
  const dirs = getTenantDirs(code);
  const cleanRel = String(relPath || '').replace(/^[\\/]+/, '');
  const tenantPath = path.join(dirs.driveMirrorDir, cleanRel);
  if (fs.existsSync(tenantPath)) return tenantPath;
  if (code === 'GIYEONLIFT') {
    const legacyPath = path.join(BASE_DRIVE_MIRROR_DIR, cleanRel);
    if (fs.existsSync(legacyPath)) return legacyPath;
  }
  return tenantPath;
}

function loadStationConfigForTenant(hint) {
  const dirs = getTenantDirs(hint);
  try {
    if (!fs.existsSync(dirs.stationConfigFile)) {
      stationConfigCache.delete(dirs.stationConfigFile);
      return null;
    }
    const st = fs.statSync(dirs.stationConfigFile);
    const cached = stationConfigCache.get(dirs.stationConfigFile);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      return cached.data;
    }
    const parsed = JSON.parse(fs.readFileSync(dirs.stationConfigFile, 'utf8'));
    stationConfigCache.set(dirs.stationConfigFile, { mtimeMs: st.mtimeMs, data: parsed });
    return parsed;
  } catch (e) {}
  return null;
}

function copyEntryPreserveTime(srcPath, dstPath) {
  try {
    const st = fs.statSync(srcPath);
    if (st.isDirectory()) {
      if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
      for (const ent of fs.readdirSync(srcPath, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        copyEntryPreserveTime(path.join(srcPath, ent.name), path.join(dstPath, ent.name));
      }
    } else if (st.isFile()) {
      const dstDir = path.dirname(dstPath);
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
      if (fs.existsSync(dstPath)) {
        try {
          const dstSt = fs.statSync(dstPath);
          if (dstSt.isFile() && dstSt.size === st.size && Math.abs(dstSt.mtimeMs - st.mtimeMs) <= 2000) {
            return;
          }
        } catch (e) {}
      }
      fs.copyFileSync(srcPath, dstPath);
      try { fs.utimesSync(dstPath, st.atime, st.mtime); } catch (uErr) {}
    }
  } catch (e) {}
}

function seedLegacyGiyeonDirsOnce() {
  try {
    const giyeonDirs = getTenantDirs('GIYEONLIFT');
    const markerFile = path.join(giyeonDirs.driveMirrorDir, '.legacy_seeded_v1');
    if (fs.existsSync(markerFile)) return;

    if (fs.existsSync(BASE_DRIVE_MIRROR_DIR)) {
      for (const ent of fs.readdirSync(BASE_DRIVE_MIRROR_DIR, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        if (ent.isDirectory() && TENANT_NS_DIR_RE.test(ent.name)) continue;
        copyEntryPreserveTime(
          path.join(BASE_DRIVE_MIRROR_DIR, ent.name),
          path.join(giyeonDirs.driveMirrorDir, ent.name)
        );
      }
    }

    if (fs.existsSync(BASE_ARCHIVE_ROOT)) {
      for (const ent of fs.readdirSync(BASE_ARCHIVE_ROOT, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        if (TENANT_NS_DIR_RE.test(ent.name)) continue;
        const srcSub = path.join(BASE_ARCHIVE_ROOT, ent.name);
        if (ent.name === 'DB백업') {
          for (const fEnt of fs.readdirSync(srcSub, { withFileTypes: true })) {
            if (fEnt.isFile()) {
              copyEntryPreserveTime(
                path.join(srcSub, fEnt.name),
                path.join(giyeonDirs.dbBackupDir, fEnt.name)
              );
            }
          }
          continue;
        }
        if (/^\d{4}-\d{2}$/.test(ent.name)) {
          for (const fEnt of fs.readdirSync(srcSub, { withFileTypes: true })) {
            if (!fEnt.isFile()) continue;
            let targetCode = 'GIYEONLIFT';
            if (fEnt.name.startsWith('[eBroFL')) targetCode = 'EBRO_FL';
            else if (fEnt.name.startsWith('[이브로에이더블유피')) targetCode = 'EBRO_AWP';
            const tDirs = getTenantDirs(targetCode);
            copyEntryPreserveTime(
              path.join(srcSub, fEnt.name),
              path.join(tDirs.archiveRoot, ent.name, fEnt.name)
            );
          }
        }
      }
    }

    fs.writeFileSync(markerFile, JSON.stringify({ seededAt: new Date().toISOString() }), 'utf8');
    if (process.platform === 'win32') {
      try { exec(`attrib +h "${markerFile}"`, { windowsHide: true }); } catch (e) {}
    }
    agentLog('SYSTEM', '기존 C:\\eBroAgent 자료를 테넌트별 격리 폴더(GIYEONLIFT 등)로 무손실 이관 완료');
  } catch (e) {
    agentLog('WARN', '레거시 폴더 시드 중 경고: ' + (e.message || e));
  }
}

try {
  if (!fs.existsSync(HOMETAX_INVOICES_DIR)) {
    fs.mkdirSync(HOMETAX_INVOICES_DIR, { recursive: true });
  }
} catch (e) {}

let activeStationConfig = loadStationConfigForTenant('GIYEONLIFT');
seedLegacyGiyeonDirsOnce();

// =========================================================================
//  [스마트 자가 자동 설치 & 구버전 자동 교체(Auto-Kill & Takeover) 엔진]
// 사용자가 다운로드 폴더나 바탕화면에서 eBroAgent.exe를 실행한 경우,
// 1) 기존에 돌고 있던 구버전 eBroAgent 프로세스를 조용히 자동 종료!
// 2) C:\eBroAgent\eBroAgent.exe 를 최신 바이너리로 안전 덮어쓰기!
// 3) 표준 위치에서 최신 에이전트를 백그라운드로 즉시 바통 터치 기동!
// =========================================================================
const currentExePath = process.execPath;
const currentPid = process.pid;
const isExe = currentExePath.toLowerCase().endsWith('.exe') && !currentExePath.toLowerCase().includes('node.exe');


// 1. 다른 경로에서 실행된 경우 (설치/업그레이드 모드)
if (isExe && path.resolve(currentExePath).toLowerCase() !== path.resolve(TARGET_EXE_PATH).toLowerCase()) {
  try {
    if (!fs.existsSync(AGENT_HOME)) fs.mkdirSync(AGENT_HOME, { recursive: true });
    if (!fs.existsSync(ARCHIVE_ROOT)) fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
    if (!fs.existsSync(DRIVE_MIRROR_DIR)) fs.mkdirSync(DRIVE_MIRROR_DIR, { recursive: true });

    agentLog('UPDATE', '에이전트 최신 버전(' + VERSION + ') 자가 교체/설치 진행');
    try {
      agentLog('SYSTEM', '기존 구버전 프로세스 자동 정리');
      execSync('powershell -NoProfile -Command "Get-Process -Name eBroAgent -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ' + currentPid + ' } | Stop-Process -Force"', { stdio: 'ignore', windowsHide: true });
    } catch (kErr) {}

    setTimeout(() => {
      try {
        fs.copyFileSync(currentExePath, TARGET_EXE_PATH);
        const assetFiles = ['trayIcon.ps1', 'eBroAgent.ico', 'eBroAgent.png', 'favicon.ico', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-192.png'];
        for (const fname of assetFiles) {
          const src = path.join(path.dirname(currentExePath), fname);
          const dest = path.join(AGENT_HOME, fname);
          if (fs.existsSync(src)) {
            try {
              if (fs.existsSync(dest)) fs.unlinkSync(dest);
              fs.copyFileSync(src, dest);
              exec(`attrib +h "${dest}"`, { windowsHide: true });
            } catch (e) {}
          }
        }
        agentLog('UPDATE', '바이너리 교체 완료, 최신 엔진 기동');
        const child = spawn(TARGET_EXE_PATH, [], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
        agentLog('UPDATE', '업그레이드 완료');
        setTimeout(() => { process.exit(0); }, 2000);
      } catch (copyErr) {
        agentLog('ERROR', '파일 복사 실패: ' + copyErr.message);
      }
    }, 600);
    return;
  } catch (err) {
    agentLog('ERROR', '자가 설치 오류: ' + err.message);
  }
}

// 디렉토리 자동 생성 및 불필요 파일 정리 / 시스템 파일 숨김(Hidden) 정책 집행
try {
  if (!fs.existsSync(AGENT_HOME)) fs.mkdirSync(AGENT_HOME, { recursive: true });
  if (!fs.existsSync(ARCHIVE_ROOT)) fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
  if (!fs.existsSync(DRIVE_MIRROR_DIR)) fs.mkdirSync(DRIVE_MIRROR_DIR, { recursive: true });

  if (process.platform === 'win32') {
    const obsoleteEntries = ['eBroAgent.js', 'studioEngine.js', 'BroAgent.js', 'agent.js', 'SumatraPDF-settings.txt', 'tray.log'];
    if (fs.existsSync(path.join(AGENT_HOME, 'bin', 'SumatraPDF.exe'))) {
      obsoleteEntries.push('SumatraPDF.exe');
    }
    for (const obs of obsoleteEntries) {
      const obsPath = path.join(AGENT_HOME, obs);
      if (fs.existsSync(obsPath)) {
        try { fs.unlinkSync(obsPath); } catch (e) {}
      }
    }
    const entries = fs.readdirSync(AGENT_HOME);
    const VISIBLE_ALLOWLIST = new Set(['ebroagent.exe', '문서고', 'drive_mirror']);
    const visibleTargets = [];
    const hiddenTargets = [];
    for (const entryName of entries) {
      const lower = entryName.toLowerCase();
      const fullPath = path.join(AGENT_HOME, entryName);
      if (/^(print_temp_|test_).+\.(html|pdf)$/i.test(entryName)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
        continue;
      }
      if (VISIBLE_ALLOWLIST.has(lower) || entryName === '문서고') {
        visibleTargets.push(fullPath);
      } else {
        hiddenTargets.push(fullPath);
      }
    }
    if (visibleTargets.length > 0 || hiddenTargets.length > 0) {
      const psEsc = (p) => `'${String(p).replace(/'/g, "''")}'`;
      const psScript = [
        ...visibleTargets.map(p => `& attrib -h ${psEsc(p)} 2>$null`),
        ...hiddenTargets.map(p => `& attrib +h ${psEsc(p)} 2>$null`)
      ].join('; ');
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      exec(`powershell -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, { windowsHide: true }, () => {});
    }
  }
} catch (e) {
  agentLog('WARN', '디렉토리 생성 경고: ' + e.message);
}

console.log('====================================================');
console.log(` [eBroAgent] 로컬 사이드카 에이전트 가동 (${VERSION})`);
console.log(` 콜사인(Callsign): ${CALLSIGN}`);
console.log(` 컴퓨터 이름: ${MACHINE_NAME}`);
console.log(` 에이전트 홈 경로: ${AGENT_HOME}`);
console.log(` 문서 영구 보관소: ${ARCHIVE_ROOT}`);
console.log(` 로컬 통신 포트: http://127.0.0.1:${PORT}`);
console.log('====================================================');

// ──  글로벌 CDN 기반 스마트 자가 업데이트 (Auto-Update) 엔진 ──
const PRIMARY_VERSION_URL = 'https://ebro.run/downloads/version.json';
const FALLBACK_VERSION_URL = 'https://open.ebro.run/downloads/version.json';
const DEFAULT_CORE_DAT_URL = 'https://ebro.run/downloads/engine.dat';

let updateState = {
  status: 'idle', // 'idle' | 'checking' | 'downloading' | 'installing' | 'completed' | 'error'
  currentVersion: VERSION,
  currentCoreHash: CORE_HASH,
  targetVersion: VERSION,
  targetCoreHash: CORE_HASH,
  isMismatch: false,
  message: '',
  lastChecked: null
};

let lastStatusSnapshotKey = '';

function writeAgentStatusSnapshot() {
  try {
    if (!fs.existsSync(AGENT_HOME)) fs.mkdirSync(AGENT_HOME, { recursive: true });
    const statusFile = path.join(AGENT_HOME, 'agent_status.json');
    const remoteVer = updateState.targetVersion || VERSION;
    const remoteHash = updateState.targetCoreHash || CORE_HASH;
    const isRemoteOlder = isNewerVersion(VERSION, remoteVer);
    const isMismatch = Boolean(
      (remoteVer && isNewerVersion(remoteVer, VERSION)) ||
      (!isRemoteOlder && remoteHash && CORE_HASH && remoteHash !== CORE_HASH)
    );
    updateState.isMismatch = isMismatch;
    const snapshotKey = `${VERSION}|${CORE_HASH}|${remoteVer}|${remoteHash}|${isMismatch}|${updateState.status}|${updateState.message || ''}|${updateState.lastChecked || ''}`;
    if (snapshotKey === lastStatusSnapshotKey && fs.existsSync(statusFile)) {
      return;
    }
    const payload = {
      currentVersion: VERSION,
      currentCoreHash: CORE_HASH,
      targetVersion: remoteVer,
      targetCoreHash: remoteHash,
      isMismatch,
      status: updateState.status,
      message: updateState.message || '',
      lastChecked: updateState.lastChecked,
      updatedAt: new Date().toISOString()
    };
    const tempFile = `${statusFile}.tmp.${process.pid}`;
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf8');
    if (fs.existsSync(statusFile)) {
      try { fs.unlinkSync(statusFile); } catch (e) {}
    }
    fs.renameSync(tempFile, statusFile);
    lastStatusSnapshotKey = snapshotKey;
    if (process.platform === 'win32') {
      exec(`attrib +h "${statusFile}"`, { windowsHide: true }, () => {});
    }
  } catch (e) {}
}
writeAgentStatusSnapshot();

function appendCacheBust(urlStr) {
  if (!urlStr) return urlStr;
  const sep = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${sep}_cb=${Date.now()}`;
}

function fetchTextWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function attempt(currentUrl, redirectsLeft) {
      if (redirectsLeft < 0) return reject(new Error('리다이렉트 횟수 초과'));
      const isHttps = currentUrl.startsWith('https');
      const client = isHttps ? https : http;
      const req = client.get(currentUrl, {
        agent: isHttps ? SHARED_HTTPS_AGENT : SHARED_HTTP_AGENT,
        timeout: 8000,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'User-Agent': `eBroAgent/${VERSION}`
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error(`리다이렉트 주소 누락 HTTP ${res.statusCode}`));
          res.resume();
          const nextUrl = new URL(loc, currentUrl).href;
          return attempt(nextUrl, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ ok: false, statusCode: res.statusCode });
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ ok: true, body: data }));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('버전 정보 조회 타임아웃')); });
      req.on('error', reject);
    }
    attempt(url, maxRedirects);
  });
}

function downloadFileWithRedirects(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function attempt(currentUrl, redirectsLeft) {
      if (redirectsLeft < 0) return reject(new Error('리다이렉트 횟수 초과'));
      const isHttps = currentUrl.startsWith('https');
      const client = isHttps ? https : http;
      const req = client.get(currentUrl, {
        agent: isHttps ? SHARED_HTTPS_AGENT : SHARED_HTTP_AGENT,
        timeout: 30000,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'User-Agent': `eBroAgent/${VERSION}`
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error(`리다이렉트 주소 누락 HTTP ${res.statusCode}`));
          res.resume();
          const nextUrl = new URL(loc, currentUrl).href;
          return attempt(nextUrl, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`다운로드 실패 HTTP ${res.statusCode}`));
        }
        const fileStream = fs.createWriteStream(destPath);
        pipeline(res, fileStream, (err) => {
          if (err) {
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {}
            return reject(err);
          }
          resolve();
        });
      });
      req.on('timeout', () => {
        req.destroy();
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {}
        reject(new Error('다운로드 연결 타임아웃'));
      });
      req.on('error', (err) => {
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });
    }
    attempt(url, maxRedirects);
  });
}

function httpRequestJson(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const reqOptions = {
        agent: isHttps ? SHARED_HTTPS_AGENT : SHARED_HTTP_AGENT,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 5000
      };

      const req = client.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (e) {}
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: json, raw: data });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('네트워크 타임아웃'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function parseVersion(verStr) {
  if (!verStr) return [0, 0, 0, 0];
  const cleaned = verStr.replace(/^v/, '');
  const parts = cleaned.split('.Build.');
  const semver = (parts[0] || '0').split('.').map(n => parseInt(n, 10) || 0);
  const build = parts[1] ? (parseInt(parts[1], 10) || 0) : 0;
  return [semver[0] || 0, semver[1] || 0, semver[2] || 0, build];
}

function isNewerVersion(remoteVer, currentVer) {
  const r = parseVersion(remoteVer);
  const c = parseVersion(currentVer);
  for (let i = 0; i < 4; i++) {
    if (r[i] > c[i]) return true;
    if (r[i] < c[i]) return false;
  }
  return false;
}

let isCoreUpdateInFlight = false;
async function checkAndApplyUpdate(force = false) {
  if (isCoreUpdateInFlight || updateState.status === 'downloading' || updateState.status === 'installing') {
    return { status: updateState.status || 'downloading', message: '업데이트 작업 진행 중' };
  }

  isCoreUpdateInFlight = true;
  updateState.status = 'checking';
  updateState.message = '원격 버전 확인 중...';
  updateState.lastChecked = new Date().toISOString();

  try {
    // PRIMARY(웹 배포본)와 FALLBACK(GitHub main 즉시 반영본)을 캐시 무효화 쿼리와 함께 동시 조회하여 더 최신이거나 해시가 변경된 메타데이터 채택
    const [primaryRes, fallbackRes] = await Promise.all([
      fetchTextWithRedirects(appendCacheBust(PRIMARY_VERSION_URL)).catch(() => null),
      fetchTextWithRedirects(appendCacheBust(FALLBACK_VERSION_URL)).catch(() => null)
    ]);

    const candidates = [];
    for (const r of [fallbackRes, primaryRes]) {
      if (r && r.ok && r.body) {
        try {
          const parsed = JSON.parse(r.body);
          if (parsed && parsed.version) candidates.push(parsed);
        } catch (e) {}
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (isNewerVersion(a.version, b.version)) return -1;
        if (isNewerVersion(b.version, a.version)) return 1;
        return String(b.buildTime || '').localeCompare(String(a.buildTime || ''));
      });
      const info = candidates[0];
      const remoteVersion = info.version;
      const remoteCoreHash = info.coreHash || null;
      const coreUrl = info.coreUrl;
      const installerUrl = info.installerUrl;
      const downloadUrl = info.downloadUrl;

      updateState.targetVersion = remoteVersion;
      updateState.targetCoreHash = remoteCoreHash;

      const hasNewVersion = isNewerVersion(remoteVersion, VERSION);
      const isRemoteOlder = isNewerVersion(VERSION, remoteVersion);
      const hasHashChanged = !isRemoteOlder && Boolean(remoteCoreHash && CORE_HASH && remoteCoreHash !== CORE_HASH);
      writeAgentStatusSnapshot();
      // 🛡️ 구버전 브라우저 탭이 force=true를 호출하더라도, 원격 버전이 현재보다 낮거나 버전·해시가 이미 동일하면 절대 재설치/재기동하지 않음
      if (remoteVersion && !isRemoteOlder && (hasNewVersion || hasHashChanged)) {
        agentLog('UPDATE', `코어 업데이트 감지: ${VERSION}(${CORE_HASH}) -> ${remoteVersion}(${remoteCoreHash || 'N/A'})`);
        updateState.status = 'downloading';
        updateState.message = `새 버전(${remoteVersion}) 백그라운드 다운로드 중...`;
        writeAgentStatusSnapshot();

        // 🚀 [1순위] 초경량 암호화 코어(engine.dat, ~2.2MB) 핫패치 다운로드 (캐시 무효화 및 이중 폴백 적용)
        const effectiveCoreUrl = coreUrl || DEFAULT_CORE_DAT_URL;
        if (effectiveCoreUrl) {
          const coreDir = path.join(AGENT_HOME, 'core');
          if (!fs.existsSync(coreDir)) fs.mkdirSync(coreDir, { recursive: true });
          const coreDownloadPath = path.join(coreDir, `engine.dat.download.${process.pid}.${Date.now()}`);
          const coreFinalPath = path.join(coreDir, 'engine.dat');

          downloadFileWithRedirects(appendCacheBust(effectiveCoreUrl), coreDownloadPath)
            .catch((firstErr) => {
              if (effectiveCoreUrl !== DEFAULT_CORE_DAT_URL) {
                agentLog('WARN', `기본 코어 URL 다운로드 실패(${firstErr.message}) -> 표준 도메인 폴백 재시도`);
                return downloadFileWithRedirects(appendCacheBust(DEFAULT_CORE_DAT_URL), coreDownloadPath);
              }
              throw firstErr;
            })
            .then(() => {
              try {
                const testBuf = fs.readFileSync(coreDownloadPath);
                if (testBuf.length < 28) throw new Error('파일 크기 미달');
                if (fs.existsSync(coreFinalPath)) {
                  try {
                    const curBuf = fs.readFileSync(coreFinalPath);
                    if (curBuf.equals(testBuf)) {
                      try { fs.unlinkSync(coreDownloadPath); } catch (e) {}
                      isCoreUpdateInFlight = false;
                      updateState.status = 'idle';
                      updateState.message = '최신 버전을 사용 중입니다.';
                      return;
                    }
                    fs.unlinkSync(coreFinalPath);
                  } catch (e) {}
                }
                fs.renameSync(coreDownloadPath, coreFinalPath);
                agentLog('UPDATE', '초경량 코어(engine.dat) 핫패치 완료: 무소음 재기동');
                updateState.status = 'installing';
                updateState.message = '새 코어로 무소음 재기동 중...';

                const hostExe = process.execPath;
                try {
                  const psDetach = `Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList '"${hostExe}" --daemon'`;
                  execSync(`powershell.exe -NoProfile -WindowStyle Hidden -Command "${psDetach}"`, { stdio: 'ignore', windowsHide: true });
                } catch (e) {
                  const child = spawn(hostExe, process.argv.slice(1), {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                  });
                  child.unref();
                }

                setTimeout(() => { process.exit(0); }, 800);
              } catch (vErr) {
                isCoreUpdateInFlight = false;
                agentLog('ERROR', '코어 무결성 검증 실패: ' + vErr.message);
                try { fs.unlinkSync(coreDownloadPath); } catch (e) {}
                updateState.status = 'error';
                updateState.message = `코어 검증 실패: ${vErr.message}`;
              }
            })
            .catch((err) => {
              isCoreUpdateInFlight = false;
              updateState.status = 'error';
              updateState.message = `코어 다운로드 오류: ${err.message}`;
              agentLog('WARN', '코어 다운로드 오류: ' + err.message);
            });

          return { status: 'updating', currentVersion: VERSION, targetVersion: remoteVersion, mode: 'hotpatch' };
        }

        // 📦 [2순위] 호스트 인스톨러 전체 교체 (CoreUrl 미제공 시 Fallback)
        const targetUrl = installerUrl || downloadUrl;
        if (!targetUrl) {
          isCoreUpdateInFlight = false;
          updateState.status = 'error';
          updateState.message = '다운로드 URL 정보 없음';
          return { status: 'error', message: updateState.message };
        }

        const isInstaller = targetUrl.toLowerCase().includes('setup');
        const updateFilePath = path.join(AGENT_HOME, isInstaller ? 'eBroAgent_Setup_Update.exe' : 'update_staging.exe');

        downloadFileWithRedirects(targetUrl, updateFilePath)
          .then(() => {
            setTimeout(() => {
              try {
                agentLog('UPDATE', '다운로드 완료: 신규 버전으로 교체 기동');
                updateState.status = 'installing';
                updateState.message = '새 버전으로 백그라운드 무음 교체 기동 중...';

                if (isInstaller) {
                  const child = spawn(updateFilePath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'], {
                    detached: true,
                    stdio: 'ignore'
                  });
                  child.unref();
                } else {
                  const child = spawn(updateFilePath, [], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                  });
                  child.unref();
                }

                setTimeout(() => {
                  process.exit(0);
                }, 1500);
              } catch (spawnErr) {
                isCoreUpdateInFlight = false;
                agentLog('ERROR', '업데이트 실행 오류: ' + spawnErr.message);
                updateState.status = 'error';
                updateState.message = `실행 오류: ${spawnErr.message}`;
              }
            }, 1200);
          })
          .catch((err) => {
            isCoreUpdateInFlight = false;
            updateState.status = 'error';
            updateState.message = `다운로드 오류: ${err.message}`;
            agentLog('WARN', '업데이트 다운로드 오류: ' + err.message);
          });

        return { status: 'updating', currentVersion: VERSION, targetVersion: remoteVersion };
      } else {
        isCoreUpdateInFlight = false;
        updateState.status = 'idle';
        updateState.message = '최신 버전을 사용 중입니다.';
        writeAgentStatusSnapshot();
        return { status: 'latest', currentVersion: VERSION };
      }
    }
    isCoreUpdateInFlight = false;
    updateState.status = 'error';
    updateState.message = '원격 버전 정보 응답 오류';
    writeAgentStatusSnapshot();
    return { status: 'error', message: updateState.message };
  } catch (err) {
    isCoreUpdateInFlight = false;
    updateState.status = 'error';
    updateState.message = err.message;
    writeAgentStatusSnapshot();
    return { status: 'error', message: err.message };
  }
}

// 백그라운드 자동 업데이트 점검 (기동 후 즉시 점검 + 부팅 직후 네트워크 지연 대비 다단계 재시도 + 3분 주기 상시 점검)
[4000, 15000, 35000, 65000].forEach((delayMs) => {
  setTimeout(() => {
    if (updateState.status === 'idle' || updateState.status === 'error') {
      checkAndApplyUpdate().catch(() => {});
    }
  }, delayMs);
});
setInterval(() => { checkAndApplyUpdate().catch(() => {}); }, 3 * 60 * 1000);

// ── 비동기 자식 프로세스 실행 헬퍼 (Node.js 단일 이벤트 루프 블로킹 원천 방지 & 인위적 타임아웃 없음) ──
function runCommandAsync(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, {
      cwd: options.cwd,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr?.trim() || err.message || '프로세스 실행 오류'));
      }
      resolve(stdout || '');
    });
  });
}

// ── 🛡️ PowerShell Excel COM 자가 치유(Self-Healing) 초기화 스니펫 ──
// 1) 백그라운드 좀비 EXCEL.EXE 정리
// 2) 깨진 Office TypeLib 레지스트리 고아 버전 키({00020813-0000-0000-C000-000000000046}) 자동 정리
// 3) $excel.Workbooks 바인딩 대기 및 Late-Binding 폴백 검증
const PS_INIT_EXCEL_COM_BLOCK = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Get-Process -Name "EXCEL" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

try {
  $tlbGuid = "{00020813-0000-0000-C000-000000000046}"
  foreach ($hive in @("HKCU:\\Software\\Classes\\TypeLib\\$tlbGuid", "HKLM:\\SOFTWARE\\Classes\\TypeLib\\$tlbGuid", "HKLM:\\SOFTWARE\\WOW6432Node\\Classes\\TypeLib\\$tlbGuid")) {
    if (Test-Path $hive) {
      $verKeys = @(Get-ChildItem -Path $hive -ErrorAction SilentlyContinue)
      if ($verKeys.Count -gt 1) {
        foreach ($vk in $verKeys) {
          $hasValidFile = $false
          foreach ($sub in @("0\\win64", "0\\win32")) {
            $p = Join-Path $vk.PSPath $sub
            if (Test-Path $p) {
              $defVal = (Get-ItemProperty -Path $p -ErrorAction SilentlyContinue).'(default)'
              if ($defVal) {
                $cleanPath = ($defVal -replace '\\\\\\d+$', '')
                if (Test-Path $cleanPath) { $hasValidFile = $true }
              }
            }
          }
          if (-not $hasValidFile) {
            try { Remove-Item -Path $vk.PSPath -Recurse -Force -ErrorAction SilentlyContinue } catch {}
          }
        }
      }
    }
  }
} catch {}

$excel = New-Object -ComObject Excel.Application
for ($wRetry = 0; $wRetry -lt 10; $wRetry++) {
  try {
    if ($null -ne $excel.Workbooks) { break }
  } catch {}
  Start-Sleep -Milliseconds 250
}
try { $excel.Visible = $false } catch {}
try { $excel.DisplayAlerts = $false } catch {}
try { $excel.ScreenUpdating = $false } catch {}
try { $excel.EnableEvents = $false } catch {}
try { $excel.Interactive = $false } catch {}
if ($null -eq $excel -or $null -eq $excel.Workbooks) {
  throw "EXCEL_COM_WORKBOOKS_NULL"
}
`;

// ── 🛡️ 무엑셀(Zero-Excel) 환경 대응: 내장 ExcelJS + Edge Headless 정밀 PDF/XLSX 변환 엔진 ──
function escapeHtmlText(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceTagInWorksheet(ws, tag, val) {
  if (!ws || !tag) return;
  const replacement = String(val ?? '');
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master !== cell) return;
      const v = cell.value;
      if (typeof v === 'string') {
        if (v.includes(tag)) {
          cell.value = v.split(tag).join(replacement);
        }
      } else if (v && typeof v === 'object' && Array.isArray(v.richText)) {
        const joined = v.richText.map(rt => rt.text || '').join('');
        if (joined.includes(tag)) {
          cell.value = joined.split(tag).join(replacement);
        }
      }
    });
  });
}

function argbToCssColor(colorObj, fallback = '') {
  if (!colorObj) return fallback;
  if (colorObj.argb && typeof colorObj.argb === 'string') {
    const clean = colorObj.argb.replace(/^#/, '');
    if (clean.length === 8) return '#' + clean.slice(2);
    if (clean.length === 6) return '#' + clean;
  }
  return fallback;
}

function borderEdgeToCss(edge) {
  if (!edge || !edge.style) return '';
  const color = argbToCssColor(edge.color, '#000000');
  const st = edge.style;
  if (st === 'double') return `2.4px double ${color}`;
  if (st === 'thick') return `2px solid ${color}`;
  if (st === 'medium') return `1.4px solid ${color}`;
  if (st === 'dashed' || st === 'mediumDashed') return `1px dashed ${color}`;
  if (st === 'dotted' || st === 'hair') return `1px dotted ${color}`;
  return `1px solid ${color}`;
}

function formatExcelCellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    const fmt = String(cell.numFmt || '');
    if (fmt.includes(',') || fmt.includes('#,##0')) {
      const formatted = Math.round(v).toLocaleString('ko-KR');
      if (fmt.includes('₩') || fmt.includes('\\')) return `₩${formatted}`;
      return formatted;
    }
    return String(v);
  }
  if (typeof v === 'string') return v;
  if (v instanceof Date) {
    return v.toISOString().split('T')[0];
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) {
      return v.richText.map(rt => rt.text || '').join('');
    }
    if (v.result !== undefined && v.result !== null) {
      if (typeof v.result === 'number') {
        const fmt = String(cell.numFmt || '');
        if (fmt.includes(',') || fmt.includes('#,##0')) {
          return Math.round(v.result).toLocaleString('ko-KR');
        }
      }
      return String(v.result);
    }
    if (v.text !== undefined) return String(v.text);
  }
  return '';
}

function renderExcelWorksheetToHtmlPage(wb, ws, startRow, endRow, startCol, endCol) {
  const masterMerges = new Map();
  const coveredCells = new Set();

  for (const m of Object.values(ws._merges || {})) {
    const model = m.model || m;
    if (!model || !model.top) continue;
    const top = Math.max(startRow, model.top);
    const left = Math.max(startCol, model.left);
    const bottom = Math.min(endRow, model.bottom);
    const right = Math.min(endCol, model.right);
    if (top > bottom || left > right) continue;
    masterMerges.set(`${top},${left}`, { top, left, bottom, right, origTop: model.top, origLeft: model.left });
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (r !== top || c !== left) {
          coveredCells.add(`${r},${c}`);
        }
      }
    }
  }

  // 시트 내 직인/서명 이미지 추출 및 마스터 셀 바인딩
  const cellImages = new Map();
  try {
    const imgs = ws.getImages ? ws.getImages() : [];
    for (const img of imgs) {
      const media = wb.getImage ? wb.getImage(img.imageId) : null;
      if (!media || !media.buffer) continue;
      const ext = (media.extension || 'png').toLowerCase() === 'jpg' ? 'jpeg' : (media.extension || 'png').toLowerCase();
      const b64 = Buffer.from(media.buffer).toString('base64');
      const dataUri = `data:image/${ext};base64,${b64}`;
      const hasNativeTl = img.range?.tl?.nativeRow !== undefined && img.range?.tl?.nativeRow !== null;
      const tlRow = hasNativeTl
        ? Number(img.range.tl.nativeRow) + (img.range?.tl?.nativeRowOff ? 0.5 : 0)
        : Number(img.range?.tl?.row ?? 0);
      const hasNativeBr = img.range?.br?.nativeRow !== undefined && img.range?.br?.nativeRow !== null;
      const brRow = img.range?.br
        ? (hasNativeBr ? Number(img.range.br.nativeRow) : Number(img.range.br.row ?? tlRow))
        : tlRow;
      const tlCol = Number(img.range?.tl?.nativeCol ?? img.range?.tl?.col ?? 0);
      const brCol = img.range?.br ? Number(img.range.br.nativeCol ?? img.range.br.col ?? tlCol) : tlCol;
      let targetR = Math.floor((tlRow + brRow) / 2) + 1;
      let targetC = Math.floor((tlCol + brCol) / 2) + 1;
      targetR = Math.max(startRow, Math.min(endRow, targetR));
      targetC = Math.max(startCol, Math.min(endCol, targetC));

      // 병합된 셀 내부인 경우 마스터 좌표로 귀속
      for (const [mKey, mVal] of masterMerges.entries()) {
        if (targetR >= mVal.top && targetR <= mVal.bottom && targetC >= mVal.left && targetC <= mVal.right) {
          targetR = mVal.top;
          targetC = mVal.left;
          break;
        }
      }
      const key = `${targetR},${targetC}`;
      if (!cellImages.has(key)) cellImages.set(key, []);
      cellImages.get(key).push(dataUri);
    }
  } catch (e) {}

  const colWidths = [];
  let totalColWidth = 0;
  for (let c = startCol; c <= endCol; c++) {
    const w = Math.max(1.5, Number(ws.getColumn(c)?.width) || 8.43);
    colWidths.push(w);
    totalColWidth += w;
  }

  const rowHeights = [];
  let totalRawHeightPt = 0;
  for (let r = startRow; r <= endRow; r++) {
    const h = Math.max(10, Number(ws.getRow(r)?.height) || 15.5);
    rowHeights.push(h);
    totalRawHeightPt += h;
  }

  // A4 세로 1페이지(가용 높이 약 745pt) 안에 완벽히 수렴하도록 행 높이 및 폰트 스케일 산출
  const targetMaxPt = 745;
  const heightScale = totalRawHeightPt > targetMaxPt ? (targetMaxPt / totalRawHeightPt) : 1;
  const fontScale = heightScale < 0.85 ? Math.max(0.76, heightScale * 1.04) : 0.92;

  let html = `<div class="excel-sheet-page"><table class="excel-table"><colgroup>`;
  for (const w of colWidths) {
    const pct = ((w / totalColWidth) * 100).toFixed(3);
    html += `<col style="width:${pct}%;">`;
  }
  html += `</colgroup><tbody>`;

  for (let r = startRow; r <= endRow; r++) {
    const scaledRowPt = (rowHeights[r - startRow] * heightScale).toFixed(2);
    html += `<tr style="height:${scaledRowPt}pt;">`;

    for (let c = startCol; c <= endCol; c++) {
      const key = `${r},${c}`;
      if (coveredCells.has(key)) continue;

      const mergeInfo = masterMerges.get(key);
      const srcCell = mergeInfo ? ws.getCell(mergeInfo.origTop, mergeInfo.origLeft) : ws.getCell(r, c);
      const bottomR = mergeInfo ? mergeInfo.bottom : r;
      const rightC = mergeInfo ? mergeInfo.right : c;

      const rowspan = bottomR - r + 1;
      const colspan = rightC - c + 1;

      const bTop = borderEdgeToCss(srcCell.border?.top);
      const bLeft = borderEdgeToCss(srcCell.border?.left);
      const bRight = borderEdgeToCss(ws.getCell(r, rightC).border?.right || srcCell.border?.right);
      const bBottom = borderEdgeToCss(ws.getCell(bottomR, c).border?.bottom || srcCell.border?.bottom);

      let styles = [];
      if (bTop) styles.push(`border-top:${bTop}`);
      if (bLeft) styles.push(`border-left:${bLeft}`);
      if (bRight) styles.push(`border-right:${bRight}`);
      if (bBottom) styles.push(`border-bottom:${bBottom}`);

      if (srcCell.fill && srcCell.fill.type === 'pattern' && srcCell.fill.pattern === 'solid') {
        const bg = argbToCssColor(srcCell.fill.fgColor, '');
        if (bg && bg.toLowerCase() !== '#000000') {
          styles.push(`background-color:${bg}`);
        }
      }

      const fSize = Math.max(6.5, (Number(srcCell.font?.size) || 10) * fontScale).toFixed(1);
      styles.push(`font-size:${fSize}pt`);
      if (srcCell.font?.bold) styles.push('font-weight:700');
      const fColor = argbToCssColor(srcCell.font?.color, '');
      if (fColor) styles.push(`color:${fColor}`);

      const hAlign = srcCell.alignment?.horizontal || (typeof srcCell.value === 'number' ? 'right' : 'center');
      const vAlign = srcCell.alignment?.vertical || 'middle';
      styles.push(`text-align:${hAlign === 'distributed' || hAlign === 'justify' ? 'center' : hAlign}`);
      styles.push(`vertical-align:${vAlign === 'distributed' ? 'middle' : vAlign}`);

      const rawText = formatExcelCellValue(srcCell);
      const hasNewline = rawText.includes('\n');
      if (srcCell.alignment?.wrapText || hasNewline || colspan >= 4) {
        styles.push('white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word');
      } else {
        styles.push('white-space:nowrap;overflow:hidden');
      }

      const spanAttrs = `${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''}`;
      const escaped = escapeHtmlText(rawText);
      const imgs = cellImages.get(key);

      if (imgs && imgs.length > 0) {
        const visibleStyles = styles.map(s => s.replace(';overflow:hidden', ';overflow:visible'));
        visibleStyles.push('position:relative', 'z-index:10', 'overflow:visible');
        const imgTags = imgs.map(u => `<img src="${u}" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);width:54px;height:54px;max-width:none;max-height:none;object-fit:contain;opacity:0.92;pointer-events:none;z-index:30;" />`).join('');
        html += `<td${spanAttrs} style="${visibleStyles.join(';')}"><div style="position:relative;width:100%;min-height:14px;overflow:visible;">${escaped}${imgTags}</div></td>`;
      } else {
        html += `<td${spanAttrs} style="${styles.join(';')}">${escaped}</td>`;
      }
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}

let cachedBrowserPdfExe = null;
function resolveBrowserPdfExe() {
  if (cachedBrowserPdfExe && (cachedBrowserPdfExe === 'msedge.exe' || fs.existsSync(cachedBrowserPdfExe))) {
    return cachedBrowserPdfExe;
  }
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedBrowserPdfExe = p;
      return p;
    }
  }
  cachedBrowserPdfExe = 'msedge.exe';
  return 'msedge.exe';
}

let cachedSumatraExe = null;
function resolveSumatraExe() {
  if (cachedSumatraExe && fs.existsSync(cachedSumatraExe)) {
    return cachedSumatraExe;
  }
  const sumatraCandidates = [
    path.join(AGENT_HOME, 'bin', 'SumatraPDF.exe'),
    path.join(AGENT_HOME, 'SumatraPDF.exe'),
    path.join(__dirname, 'bin', 'SumatraPDF.exe'),
    path.join(__dirname, 'SumatraPDF.exe')
  ];
  for (const cand of sumatraCandidates) {
    if (fs.existsSync(cand)) {
      cachedSumatraExe = cand;
      return cand;
    }
  }
  return null;
}

async function convertHtmlPagesToPdfViaEdge(pageHtmlArray, outputPdfPath, tempBuildDir) {
  const htmlPath = path.join(tempBuildDir, `fallback_doc_${Date.now()}.html`);
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 portrait; margin: 7mm 7mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; font-family: 'Malgun Gothic', '맑은 고딕', 'Dotum', sans-serif; color: #000; background: #fff; }
    .excel-sheet-page {
      width: 100%;
      max-height: 282mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .excel-sheet-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .excel-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .excel-table td {
      padding: 1px 3px;
      line-height: 1.15;
    }
  </style>
</head>
<body>
${pageHtmlArray.join('\n')}
</body>
</html>`;

  fs.writeFileSync(htmlPath, fullHtml, 'utf8');

  const edgePath = resolveBrowserPdfExe();

  const edgeProfDir = path.join(tempBuildDir, 'edge_prof_' + Date.now());
  if (!fs.existsSync(edgeProfDir)) {
    fs.mkdirSync(edgeProfDir, { recursive: true });
  }

  const edgeCmd = `"${edgePath}" --headless --disable-gpu --no-sandbox --no-pdf-header-footer --user-data-dir="${edgeProfDir}" --run-all-compositor-stages-before-draw --print-to-pdf="${outputPdfPath}" "${htmlPath}"`;
  try {
    await runCommandAsync(edgeCmd, { cwd: tempBuildDir });
  } catch (e) {
    agentLog('WARN', 'Edge Headless PDF 변환 프로세스 경고: ' + e.message);
  }

  const startWait = Date.now();
  while (Date.now() - startWait < 20000) {
    if (fs.existsSync(outputPdfPath) && fs.statSync(outputPdfPath).size > 0) {
      return outputPdfPath;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Edge Headless PDF 파일 생성 실패');
}

// ── 하드웨어 다이렉트 프린터 출력 엔진 (Edge Headless PDF + 64비트 Sumatra 무인 스풀 — 100% 비동기 Non-blocking) ──
async function sendHtmlToPhysicalPrinter(htmlContent, printerName, title = '기연리프트_출력물') {
  if (!htmlContent) {
    throw new Error('인쇄할 HTML 내용이 비어 있습니다.');
  }

  const ts = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const tempPrintHtml = path.join(AGENT_HOME, `print_temp_${ts}.html`);
  const tempPrintPdf = path.join(AGENT_HOME, `print_temp_${ts}.pdf`);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif; padding: 20px; color: #111; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; font-size: 13px; text-align: left; }
    th { background-color: #f9fafb; font-weight: bold; width: 130px; }
    .header { text-align: center; border-bottom: 2px solid #312e81; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #1e1b4b; letter-spacing: 2px; }
    .section-title { font-size: 14px; font-weight: bold; border-left: 4px solid #312e81; padding-left: 8px; margin: 16px 0 8px 0; color: #312e81; }
    @media print {
      @page { margin: 10mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

  fs.writeFileSync(tempPrintHtml, fullHtml, 'utf8');

  // 1. Edge 브라우저 헤드리스 엔진을 통한 고해상도 PDF 변환
  const edgePath = resolveBrowserPdfExe();

  agentLog('PRINT', `문서 렌더링 시작: 대상 프린터 [${printerName}], 제목: ${title}`);
  const userProfDir = path.join(AGENT_HOME, 'edge_prof');
  if (!fs.existsSync(userProfDir)) {
    try {
      fs.mkdirSync(userProfDir, { recursive: true });
      if (process.platform === 'win32') exec(`attrib +h "${userProfDir}"`, { windowsHide: true });
    } catch (e) {}
  }

  const edgeCmd = `"${edgePath}" --headless --disable-gpu --no-sandbox --no-pdf-header-footer --user-data-dir="${userProfDir}" --run-all-compositor-stages-before-draw --print-to-pdf="${tempPrintPdf}" "${tempPrintHtml}"`;
  try {
    await runCommandAsync(edgeCmd);
  } catch (cmdErr) {
    agentLog('WARN', 'Edge 변환 프로세스 경고 (비동기 완료 대기 진입): ' + cmdErr.message);
  }

  // PDF 파일 생성 및 디스크 기록 완결 대기 (비동기 폴링 — 이벤트 루프 블로킹 없음)
  const startWait = Date.now();
  let pdfReady = false;
  while (Date.now() - startWait < 30000) {
    if (fs.existsSync(tempPrintPdf) && fs.statSync(tempPrintPdf).size > 0) {
      pdfReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  if (!pdfReady || !fs.existsSync(tempPrintPdf) || fs.statSync(tempPrintPdf).size === 0) {
    throw new Error('PDF 변환 실패: 임시 인쇄 파일 생성 불가');
  }

  // 2. 64비트 하드웨어 스풀러(SumatraPDF)를 통한 실물 프린터 무인 다이렉트 전송
  const sumatraExe = resolveSumatraExe();

  if (sumatraExe) {
    agentLog('PRINT', `하드웨어 스풀러 전송 [SumatraPDF 64bit -> ${printerName}]`);
    const sumatraCmd = `"${sumatraExe}" -print-to "${printerName}" -silent "${tempPrintPdf}"`;
    await runCommandAsync(sumatraCmd);
  } else {
    agentLog('WARN', `SumatraPDF 부재로 OS 기본 스풀러 시도 -> [${printerName}]`);
    const psCmd = `Start-Process -FilePath "${tempPrintPdf}" -Verb PrintTo -ArgumentList '"${printerName}"' -NoNewWindow`;
    await runCommandAsync(`powershell -NoProfile -Command "${psCmd}"`);
  }

  agentLog('PRINT', `물리 프린터 스풀 전송 완료: [${printerName}]`);

  // 임시 파일 비동기 정리
  setTimeout(() => {
    try {
      if (fs.existsSync(tempPrintHtml)) fs.unlinkSync(tempPrintHtml);
      if (fs.existsSync(tempPrintPdf)) fs.unlinkSync(tempPrintPdf);
    } catch (e) {}
  }, 15000);

  return true;
}

// ── HTTP 요청 핸들러 ──
let activeCallsign = CALLSIGN;

// ── [백그라운드 시스템 작업 큐 (Excel COM 조립 / 이메일 발송 비동기 완수 워커) - 모듈 전역 스코프 유지] ──
const systemJobQueue = [];
let isSystemJobWorkerRunning = false;

async function executeSendEmailInternal(payload) {
  const { to, cc, subject, body, googleEmail, gmailAppPassword, smtpProvider, smtpHost, smtpPort, attachments, fromName } = payload;

  if (!to || !subject || !body) {
    throw new Error('수신자(to), 제목(subject), 본문(body)은 필수 항목입니다.');
  }

  const cleanEmail = String(googleEmail || '').trim();
  const cleanPass = decryptVaultSecret(String(gmailAppPassword || '')).replace(/\s+/g, '').trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error('발송 계정 이메일과 앱 비밀번호가 필요합니다.');
  }

  const nodemailer = require('nodemailer');

  let resolvedHost = smtpHost;
  let resolvedPort = Number(smtpPort) || 465;
  const emailLower = cleanEmail.toLowerCase();

  if (!resolvedHost || (emailLower.endsWith('@naver.com') && resolvedHost.includes('gmail.com')) || ((emailLower.endsWith('@daum.net') || emailLower.endsWith('@hanmail.net')) && resolvedHost.includes('gmail.com'))) {
    const provider = (smtpProvider || '').toUpperCase();
    if (provider === 'NAVER' || emailLower.endsWith('@naver.com')) {
      resolvedHost = 'smtp.naver.com';
      resolvedPort = resolvedPort || 465;
    } else if (provider === 'DAUM' || emailLower.endsWith('@daum.net') || emailLower.endsWith('@hanmail.net')) {
      resolvedHost = 'smtp.daum.net';
      resolvedPort = resolvedPort || 465;
    } else {
      resolvedHost = 'smtp.gmail.com';
      resolvedPort = resolvedPort || 465;
    }
  }

  const isSecure = resolvedPort === 465;

  agentLog('SMTP', `메일 발송 시도: Host=${resolvedHost}, Port=${resolvedPort}, Secure=${isSecure}, User=${cleanEmail} -> To=${to}${cc ? ` (CC: ${cc})` : ''}`);

  const transporter = nodemailer.createTransport({
    host: resolvedHost,
    port: resolvedPort,
    secure: isSecure,
    auth: { user: cleanEmail, pass: cleanPass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000
  });

  const inferContentType = (fPathOrName) => {
    const lower = String(fPathOrName || '').toLowerCase();
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    return 'application/pdf';
  };

  const parsedAttachments = Array.isArray(attachments) ? attachments.map((att) => {
    if (att.localPath) {
      if (fs.existsSync(att.localPath)) {
        return {
          filename: att.filename || path.basename(att.localPath),
          path: att.localPath,
          contentType: att.contentType || inferContentType(att.filename || att.localPath)
        };
      }
    }
    const base64Data = String(att.content || '').replace(/^data:.*?;base64,/, '');
    return {
      filename: att.filename || '계약서.pdf',
      content: Buffer.from(base64Data, 'base64'),
      contentType: att.contentType || inferContentType(att.filename)
    };
  }) : undefined;

  const policy = getTenantPolicy(payload.tenantCode);
  const senderDisplayName = fromName || payload.tenantCorp || payload.tenantBrand || policy.tenantName || policy.corporateName || TENANT_CODE || 'e-Bro ERP';

  const extractEmails = (raw) => {
    if (!raw) return [];
    const text = Array.isArray(raw) ? raw.join(', ') : String(raw);
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const seen = new Set();
    const out = [];
    for (const m of matches) {
      const clean = m.trim();
      const lower = clean.toLowerCase();
      if (clean && !seen.has(lower)) {
        seen.add(lower);
        out.push(clean);
      }
    }
    return out;
  };

  const toEmails = extractEmails(to);
  const toLowerSet = new Set(toEmails.map(e => e.toLowerCase()));
  const ccEmails = extractEmails(cc).filter(e => !toLowerSet.has(e.toLowerCase()));
  const normalizedTo = toEmails.length > 0 ? toEmails.join(', ') : String(to).trim();
  const normalizedCc = ccEmails.length > 0 ? ccEmails.join(', ') : undefined;

  const info = await transporter.sendMail({
    from: `"${senderDisplayName}" <${cleanEmail}>`,
    to: normalizedTo,
    cc: normalizedCc,
    subject: String(subject).trim(),
    text: String(body),
    attachments: parsedAttachments
  });

  agentLog('SMTP', `메일 발송 완료: To=${to} (MessageId: ${info.messageId})`);
  return { success: true, messageId: info.messageId, accepted: info.accepted };
}

function extractTenantStampBuffer(payload, policy) {
  const stampCandidates = [
    payload && payload.stampImageUrl,
    payload && payload.stampBase64,
    policy && policy.stampImageUrl,
    policy && policy.stampBase64
  ].filter(s => typeof s === 'string' && s.trim().length > 0);

  const decodeCandidate = (raw) => {
    try {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('data:')) {
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx !== -1) {
          const b64 = trimmed.slice(commaIdx + 1).replace(/\s+/g, '');
          const buf = Buffer.from(b64, 'base64');
          if (buf.length > 500) return buf;
        }
      } else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
        const buf = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64');
        if (buf.length > 500) return buf;
      }
    } catch (e) {}
    return null;
  };

  for (const cand of stampCandidates) {
    const buf = decodeCandidate(cand);
    if (buf) return buf;
  }
  return null;
}

function replaceWorksheetStampBuffers(wb, ws, stampBuffer) {
  if (!wb || !ws || !stampBuffer || stampBuffer.length <= 500) return;
  try {
    const imgs = ws.getImages ? ws.getImages() : [];
    for (const img of imgs) {
      const media = wb.getImage ? wb.getImage(img.imageId) : null;
      if (media) {
        media.buffer = stampBuffer;
        media.extension = 'png';
      }
    }
  } catch (e) {}
}

const psEscape = (val) => String(val ?? '')
  .replace(/`/g, '``')
  .replace(/"/g, '""')
  .replace(/\$/g, '`$');

const MODEL_SAFETY_CERT_DATES = {
  '1230ES': '2019-05-07', '1414EPLUS': '2023-06-20', '1532R': '2018-03-30', '1930ES': '2015-06-10',
  '4069LE': '2018-04-04', 'ES1330L': '2020-01-17', 'ES2646': '2022-06-30', 'GS1330M': '2019-03-19',
  'GS1432': '2021-04-08', 'GS1930': '2010-07-07', 'GS1930EDRIVE': '2021-02-09', 'GS2632': '2011-06-13',
  'GS2632EDRIVE': '2021-11-16', 'GS2646': '2010-12-29', 'GS2646EDRIVE': '2021-02-09', 'GS3246': '2010-09-06',
  'GS3246EDRIVE': '2021-02-09', 'GS4046': '2021-07-08', 'GS4047': '2013-03-11', 'GS4069DC': '2013-07-09',
  'GS4655': '2020-06-18', 'GS4655EDRIVE': '2020-06-18', 'GS5390RT': '2010-09-29', 'GS5390': '2010-09-29',
  'GTBZ16AE': '2022-07-12', 'GTJZ0608ME': '2023-06-20', 'GTJZ0808E': '2023-06-20', 'GTJZ0812E': '2024-10-02',
  'GTJZ1012E': '2023-06-20', 'GTJZ1212E': '2023-06-20', 'JCPT0607DCS': '2016-04-25', 'JCPT0807AC': '2021-07-29',
  'JCPT1008AC': '2021-07-29', 'JCPT1012AC': '2021-07-29', 'JCPT1212AC': '2021-07-29', 'JCPT1412AC': '2021-07-29',
  'JCPT1614ACZ': '2023-06-28', 'MS104': '2009-06-03', 'MS10.4': '2009-06-03', 'MS118': '2014-04-03', 'MS11.8': '2014-04-03',
  'OPTIMUM8': '2017-09-21', 'R1532I': '2020-11-12', 'S0807AC+': '2024-09-24', 'S0808E': '2023-12-14',
  'S0812E': '2023-12-14', 'S1008AC+': '2025-04-15', 'S1012AC+': '2025-04-15', 'S1012E': '2023-11-14',
  'S1212AC+': '2025-04-15', 'S1212E': '2023-11-14', 'S1412AC+': '2025-04-22', 'S1413E': '2023-11-28',
  'S1612AC+': '2025-04-15', 'S1614AC+': '2025-03-13', 'SJ12': '2010-09-14', 'SJ3215': '2023-04-28',
  'SJ3219': '2023-04-28', 'SJ3226': '2009-09-18', 'SR1623E': '2024-07-30', 'STAR6': '2017-09-21',
  'Z3422DC': '2010-03-19', 'Z4525J': '2009-09-14'
};

async function executeContractBundleInternal(payload) {
  const tempBuildDir = path.join(AGENT_HOME, 'temp_build_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  try {
    if (!fs.existsSync(tempBuildDir)) fs.mkdirSync(tempBuildDir, { recursive: true });
    const effectiveCode = getEffectiveTenantCode(payload.tenantCode);
    const tenantDirs = getTenantDirs(effectiveCode);
    const masterXlsxPath = resolveMirrorReadPath(effectiveCode, '01.계약서패키지_마스터.xlsx');
    if (!fs.existsSync(masterXlsxPath)) {
      agentLog('SYNC', `[${effectiveCode}] 마스터 엑셀 파일 부재 감지 -> Cloudflare R2 즉시 동기화 실행`);
      try { await autoSyncFromCloudflare(effectiveCode); } catch (e) {}
    }
    const resolvedMasterXlsxPath = resolveMirrorReadPath(effectiveCode, '01.계약서패키지_마스터.xlsx');
    const resolvedCheckXlsxPath = resolveMirrorReadPath(effectiveCode, '02.반입전체크리스트.xlsx');
    const resolvedSafetyXlsxPath = resolveMirrorReadPath(effectiveCode, '03.안전점검결과서.xlsx');
    const policy = getTenantPolicy(effectiveCode);
    let tenantStampBuffer = extractTenantStampBuffer(payload, policy);
    const defaultMirrorStampPath = path.join(tenantDirs.driveMirrorDir, 'tenant_stamp.png');
    const fallbackMirrorStampPath = resolveMirrorReadPath(effectiveCode, 'tenant_stamp.png');
    let stampPngPath = path.join(tempBuildDir, 'tenant_stamp.png');
    if (!tenantStampBuffer) {
      const stampUrlCandidates = [
        payload && payload.stampImageUrl,
        policy && policy.stampImageUrl
      ].filter(s => typeof s === 'string' && /^https?:\/\//i.test(s.trim()));
      for (const sUrl of stampUrlCandidates) {
        try {
          await downloadFileWithRedirects(sUrl.trim(), stampPngPath);
          if (fs.existsSync(stampPngPath) && fs.statSync(stampPngPath).size > 500) {
            tenantStampBuffer = fs.readFileSync(stampPngPath);
            break;
          }
        } catch (e) {}
      }
    }
    if (tenantStampBuffer && tenantStampBuffer.length > 500) {
      try {
        fs.writeFileSync(stampPngPath, tenantStampBuffer);
        fs.writeFileSync(defaultMirrorStampPath, tenantStampBuffer);
      } catch (e) {}
    } else if (fs.existsSync(fallbackMirrorStampPath)) {
      stampPngPath = fallbackMirrorStampPath;
    }
    const effectiveStampBuffer = (tenantStampBuffer && tenantStampBuffer.length > 500)
      ? tenantStampBuffer
      : (fs.existsSync(stampPngPath) ? fs.readFileSync(stampPngPath) : null);

    const isGiyeon = effectiveCode === 'GIYEONLIFT';
    const tenantName = payload.tenantName || payload.corporateName || policy.tenantName || policy.corporateName || (isGiyeon ? '주식회사 기연리프트' : effectiveCode);
    const tenantCorp = String(payload.corporateName || payload.tenantName || policy.corporateName || tenantName).trim();
    const tenantBizNo = String(payload.businessNumber || policy.businessNumber || (isGiyeon ? '138-81-83251' : '')).trim();
    const rawTenantRepName = payload.representativeName || policy.representativeName || (isGiyeon ? '이수용' : '');
    // 테넌트 대표자 성명은 "이 수 용"처럼 띄어쓰기 없이 출력
    const tenantRepName = String(rawTenantRepName).replace(/\s+/g, '').trim() || (isGiyeon ? '이수용' : '');
    const tenantTel = payload.salesRepPhone || payload.tel || policy.salesPhone || policy.tel || '';
    const salesRepName = String(payload.salesRepName || payload.salespersonName || tenantRepName || '영업담당자').replace(/`/g, '``').replace(/"/g, '""').replace(/\$/g, '`$');
    const salesRepPhone = String(payload.salesRepPhone || payload.salespersonPhone || tenantTel || '010-0000-0000').replace(/`/g, '``').replace(/"/g, '""').replace(/\$/g, '`$');
    const tenantBankAccount = payload.bankAccount || (policy.bankAccounts?.[0] ? `${policy.bankAccounts[0].bankName} ${policy.bankAccounts[0].accountNumber} (${policy.bankAccounts[0].accountHolder})` : '');
    const inspectorName = payload.inspectorName || '김관주';

    const custName = payload.customerName || '고객사';
    const bizRegNo = payload.bizRegNo || '등록번호미지정';
    const ceoName = payload.ceoName || '대표자';
    const contractDate = payload.contractDate || new Date().toISOString().split('T')[0];
    const siteName = payload.siteName || '현장미지정';
    const siteAddress = payload.siteAddress || '';
    const managerName = payload.siteManagerName || payload.managerName || '';
    const managerPhone = payload.siteManagerPhone || payload.managerPhone || '';
    const paidOptions = Array.isArray(payload.paidOptions) ? payload.paidOptions : [];
    const optionsText = ''; // 기존 {옵션} 칸 표기 삭제 (아무 옵션도 표시하지 말 것)
    const remarksText = String(payload.remarksText || '').replace(/안전발판\s*지급/g, '').trim();
    const freightStd = payload.freightBillingStandard === '2/4' ? '2/4' : '3/5';
    const minPeriod = String(payload.minRentalMonths || (freightStd === '2/4' ? '2' : '3'));
    const basePeriod = String(payload.baseRentalMonths || (freightStd === '2/4' ? '4' : '5'));
    const deliveryDate = payload.deliveryDate || payload.unloadingDate || payload.contractStartDate || contractDate;
    let inspectionDate = payload.inspectionDate;
    if (!inspectionDate) {
      try {
        const cleanD = String(deliveryDate).replace(/[^0-9-]/g, '').slice(0, 10);
        const d = new Date(cleanD);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - 2);
          inspectionDate = d.toISOString().split('T')[0];
        } else {
          inspectionDate = contractDate;
        }
      } catch (e) {
        inspectionDate = contractDate;
      }
    }

    const rawAssets = payload.assets && payload.assets.length > 0 ? payload.assets : [
      { assetNo: 'G06119', modelName: 'GTJZ0608ME', sn: '0108000379', rentalFee: 390000 }
    ];

    const normKey = (s) => String(s || '').replace(/[\s\-_/]/g, '').toUpperCase();

    const eqRoot = resolveMirrorReadPath(effectiveCode, 'Eq_doc');
    const eqDocDirs = (() => {
      try {
        if (!fs.existsSync(eqRoot)) return [];
        return fs.readdirSync(eqRoot, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => ({ name: d.name, norm: normKey(d.name), full: path.join(eqRoot, d.name) }));
      } catch (e) { return []; }
    })();

    const resolveEqDocModelDir = (modelName) => {
      if (!modelName || eqDocDirs.length === 0) return null;
      const sanitized = String(modelName).replace(/[\\/:*?"<>|]/g, ' ');
      const exactMatch = eqDocDirs.find(d => d.name === sanitized);
      if (exactMatch) return exactMatch.full;
      const targetNorm = normKey(modelName);
      const match = eqDocDirs.find(d =>
        d.norm === targetNorm ||
        (targetNorm === 'GS4655' && d.norm === 'GS4655EDRIVE') ||
        (targetNorm === 'GS5390RT' && d.norm === 'GS5390')
      );
      return match ? match.full : null;
    };

    const extractDateFromCertFiles = (modelName) => {
      const dir = resolveEqDocModelDir(modelName);
      if (dir && fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.startsWith('5.') || f.includes('인증'));
        for (const f of files) {
          const kr = f.match(/(20\d{2}|\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
          if (kr) {
            const yr = kr[1].length === 2 ? `20${kr[1]}` : kr[1];
            return `${yr}-${kr[2].padStart(2, '0')}-${kr[3].padStart(2, '0')}`;
          }
          const dot = f.match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/);
          if (dot) {
            return `${dot[1]}-${dot[2].padStart(2, '0')}-${dot[3].padStart(2, '0')}`;
          }
        }
      }
      return MODEL_SAFETY_CERT_DATES[normKey(modelName)] || null;
    };

    const PRESET_SPECS = (() => {
      try { return require('../src/data/presetProductSpecs.json'); } catch (e) { return {}; }
    })();

    const findPresetSpec = (modelName) => {
      if (!modelName) return null;
      const upper = String(modelName).trim().toUpperCase();
      if (PRESET_SPECS[modelName]) return PRESET_SPECS[modelName];
      if (PRESET_SPECS[upper]) return PRESET_SPECS[upper];
      const targetNorm = normKey(modelName);
      for (const [k, v] of Object.entries(PRESET_SPECS)) {
        if (normKey(k) === targetNorm || (v.shortName && normKey(v.shortName) === targetNorm)) {
          return v;
        }
      }
      return null;
    };

    const assets = rawAssets.map(a => {
      const mName = a.modelName || 'GTJZ0608ME';
      const preset = findPresetSpec(mName);
      const certFromFiles = extractDateFromCertFiles(mName) || (preset && preset.safetyCertDate) || null;
      // 구버전 프론트엔드가 비-GS-2646 모델에 하드코딩 기본값 '2010-12-29'를 보낸 경우 모델 실제 인증일로 우선 교정
      const incomingCert = (a.safetyCertDate && a.safetyCertDate !== '-')
        ? a.safetyCertDate
        : ((a.certDate && a.certDate !== '-' && !(a.certDate === '2010-12-29' && normKey(mName) !== 'GS2646')) ? a.certDate : null);
      const resolvedCert = incomingCert || certFromFiles || '-';

      // 제조연도: '2025' -> '2025년', '2026년7월' 등 'yyyy년mm월' 형식 데이터가 있더라도 'mm월'을 떼어내고 'yyyy년'만 표시
      const rawYr = a.manufactureYear ? String(a.manufactureYear).trim() : '';
      const yrMatch = rawYr.match(/(\d{4})/);
      const resolvedYr = yrMatch
        ? `${yrMatch[1]}년`
        : (rawYr && rawYr !== '-' ? rawYr : '-');

      const pickSpec = (val, fallbackVal) => (val && val !== '-') ? val : (fallbackVal || '-');

      return {
        ...a,
        modelName: (preset && preset.modelName) || mName,
        manufacturer: pickSpec(a.manufacturer, preset && preset.manufacturer),
        powerSource: pickSpec(a.powerSource, (preset && preset.powerSource) || '배터리'),
        weight: pickSpec(a.weight, preset && preset.weight),
        speed: pickSpec(a.speed, preset && preset.speed),
        workingHeight: pickSpec(a.workingHeight, preset && preset.workingHeight),
        platformHeight: pickSpec(a.platformHeight, preset && preset.platformHeight),
        capacityPreExt: pickSpec(a.capacityPreExt, preset && preset.capacityPreExt),
        manufactureYear: resolvedYr,
        safetyCertDate: resolvedCert,
        certDate: resolvedCert
      };
    });

    const primaryAsset = assets[0];
    const totalRentalFee = assets.reduce((sum, a) => sum + (Number(a.rentalFee) || 0), 0);
    const totalPaidOptionsFee = paidOptions.reduce((sum, o) => {
      const sub = o.subTotal !== undefined ? Number(o.subTotal) : (Number(o.unitPrice) || 0) * (Number(o.quantity) || 1);
      return sum + (Number(sub) || 0);
    }, 0);
    const grandTotalFee = totalRentalFee + totalPaidOptionsFee;

    const contractItems = [
      ...assets.map(ast => {
        const aNo = (ast.assetNo && ast.assetNo !== '-') ? String(ast.assetNo).trim() : '';
        const aSn = (ast.sn && ast.sn !== '-') ? String(ast.sn).trim() : '';
        const col4 = (aNo && aSn) ? `${psEscape(aNo)}\`n${psEscape(aSn)}` : psEscape(aNo || aSn || '');
        const feeStr = (Number(ast.rentalFee) || 480000).toLocaleString();
        return {
          col1: psEscape(ast.modelName || 'GS-2646'),
          col3: '1',
          col4,
          hasNewline: Boolean(aNo && aSn),
          col5: psEscape(feeStr),
          col7: psEscape(feeStr)
        };
      }),
      ...paidOptions.map(opt => {
        const qty = Math.max(1, Number(opt.quantity) || 1);
        const uPrice = Number(opt.unitPrice) || 0;
        const sTotal = opt.subTotal !== undefined ? Number(opt.subTotal) : uPrice * qty;
        return {
          col1: psEscape(opt.name || ''),
          col3: psEscape(String(qty)),
          col4: '',
          hasNewline: false,
          col5: psEscape(uPrice.toLocaleString()),
          col7: psEscape(sTotal.toLocaleString())
        };
      })
    ];
    const totalItemRows = Math.max(12, contractItems.length);

    const psScript = `\ufeff
$ErrorActionPreference = 'Stop'

$excel = $null
$wb = $null
try {
${PS_INIT_EXCEL_COM_BLOCK}

function Replace-Tag($targetWs, $tag, $val) {
  $null = $targetWs.Cells.Replace($tag, $val, 2, 1, $false, $false, $false)
}

function Replace-Sheet-Stamp($targetWs, $stampPath, [double]$fbLeft, [double]$fbTop, [double]$fbW, [double]$fbH) {
  if ([string]::IsNullOrEmpty($stampPath) -or -not (Test-Path $stampPath)) { return }
  try {
    $picLeft = $fbLeft
    $picTop = $fbTop
    $picW = $fbW
    $picH = $fbH
    $foundPic = $false
    for ($sIdx = $targetWs.Shapes.Count; $sIdx -ge 1; $sIdx--) {
      $sh = $targetWs.Shapes.Item($sIdx)
      if ($sh.Type -eq 13 -or $sh.Type -eq 11 -or $sh.Name -like '*Picture*' -or $sh.Name -like '*그림*') {
        if (-not $foundPic -and $sh.Width -gt 5 -and $sh.Height -gt 5) {
          $picLeft = [double]$sh.Left
          $picTop = [double]$sh.Top
          $picW = [double]$sh.Width
          $picH = [double]$sh.Height
          $foundPic = $true
        }
        $sh.Delete()
      }
    }
    if ($foundPic -or ($picW -gt 5 -and $picH -gt 5)) {
      $boxSize = [Math]::Max($picW, $picH)
      $origCenterX = $picLeft + ($picW / 2.0)
      $origCenterY = $picTop + ($picH / 2.0)
      $addedPic = $targetWs.Shapes.AddPicture($stampPath, 0, -1, $picLeft, $picTop, -1, -1)
      try {
        $addedPic.PictureFormat.CropTop = 0
        $addedPic.PictureFormat.CropBottom = 0
        $addedPic.PictureFormat.CropLeft = 0
        $addedPic.PictureFormat.CropRight = 0
      } catch {}
      try {
        $origW = [double]$addedPic.Width
        $origH = [double]$addedPic.Height
        if ($origW -gt 0 -and $origH -gt 0) {
          $scale = [Math]::Min($boxSize / $origW, $boxSize / $origH)
          $finalW = $origW * $scale
          $finalH = $origH * $scale
          $addedPic.LockAspectRatio = 0
          $addedPic.Width = $finalW
          $addedPic.Height = $finalH
          $addedPic.Left = $origCenterX - ($finalW / 2.0)
          $addedPic.Top = [Math]::Max(1.0, $origCenterY - ($finalH / 2.0))
        } else {
          $addedPic.Width = $boxSize
          $addedPic.Height = $boxSize
        }
      } catch {
        try {
          $addedPic.LockAspectRatio = 0
          $addedPic.Width = $boxSize
          $addedPic.Height = $boxSize
        } catch {}
      }
      try { $addedPic.Placement = 3 } catch {}
      try { $addedPic.ZOrder(0) } catch {}
    }
  } catch {}
}

function Place-Contract-Rep-Stamp($targetWs, $stampPath, [string]$repNameText) {
  if ([string]::IsNullOrEmpty($stampPath) -or -not (Test-Path $stampPath)) { return }
  try {
    for ($sIdx = $targetWs.Shapes.Count; $sIdx -ge 1; $sIdx--) {
      $sh = $targetWs.Shapes.Item($sIdx)
      if ($sh.Type -eq 13 -or $sh.Type -eq 11 -or $sh.Name -like '*Picture*' -or $sh.Name -like '*그림*') {
        $sh.Delete()
      }
    }
    $repRange = $targetWs.Range("D32:F32")
    $stampBox = 42.0
    $cleanLen = if ($repNameText) { $repNameText.Trim().Length } else { 3 }
    $halfTextW = [Math]::Min(65.0, [Math]::Max(18.0, [double]$cleanLen * 7.0))
    $rangeCenterX = [double]$repRange.Left + ([double]$repRange.Width / 2.0)
    $targetCenterX = [Math]::Min(([double]$repRange.Left + [double]$repRange.Width - ($stampBox / 2.0) - 6.0), ($rangeCenterX + $halfTextW + ($stampBox / 2.0) - 4.0))
    $targetCenterY = [double]$repRange.Top + ([double]$repRange.Height / 2.0)

    $addedPic = $targetWs.Shapes.AddPicture($stampPath, 0, -1, 0, 0, -1, -1)
    try {
      $addedPic.PictureFormat.CropTop = 0
      $addedPic.PictureFormat.CropBottom = 0
      $addedPic.PictureFormat.CropLeft = 0
      $addedPic.PictureFormat.CropRight = 0
    } catch {}
    try {
      $origW = [double]$addedPic.Width
      $origH = [double]$addedPic.Height
      if ($origW -gt 0 -and $origH -gt 0) {
        $scale = [Math]::Min($stampBox / $origW, $stampBox / $origH)
        $finalW = $origW * $scale
        $finalH = $origH * $scale
      } else {
        $finalW = $stampBox
        $finalH = $stampBox
      }
      $addedPic.LockAspectRatio = 0
      $addedPic.Width = $finalW
      $addedPic.Height = $finalH
      $addedPic.Left = $targetCenterX - ($finalW / 2.0)
      $addedPic.Top = [Math]::Max(2.0, $targetCenterY - ($finalH / 2.0))
    } catch {
      try {
        $addedPic.LockAspectRatio = 0
        $addedPic.Width = $stampBox
        $addedPic.Height = $stampBox
        $addedPic.Left = $targetCenterX - ($stampBox / 2.0)
        $addedPic.Top = [Math]::Max(2.0, $targetCenterY - ($stampBox / 2.0))
      } catch {}
    }
    try { $addedPic.Placement = 3 } catch {}
    try { $addedPic.ZOrder(0) } catch {}
  } catch {}
}

# --- 1. 마스터 파일 복사 및 열기 (02.반입전체크리스트.xlsx 및 03.안전점검결과서.xlsx 최신 시트 실시간 결합) ---
$masterIn = '${resolvedMasterXlsxPath.replace(/\\/g, '\\\\')}'
$checkIn = '${resolvedCheckXlsxPath.replace(/\\/g, '\\\\')}'
$safetyIn = '${resolvedSafetyXlsxPath.replace(/\\/g, '\\\\')}'
$masterWork = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\01.마스터_작업용.xlsx'
$masterPdf = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\01.계약서패키지.pdf'
$stampPath = '${stampPngPath.replace(/\\/g, '\\\\')}'
Copy-Item $masterIn $masterWork -Force
$wb = $excel.Workbooks.Open($masterWork)

function Get-SheetByKeyword($workbook, $keyword, $fallbackIndex) {
    foreach ($sheet in $workbook.Sheets) {
        if ($sheet.Name -match $keyword) {
            return $sheet
        }
    }
    return $workbook.Sheets.Item($fallbackIndex)
}

if (Test-Path $checkIn) {
    try {
        $excel.DisplayAlerts = $false
        $wbCheck = $excel.Workbooks.Open($checkIn, 0, $true)
        $oldCheck = Get-SheetByKeyword $wb "반입전|체크리스트" 2
        try { $oldCheck.Name = "__OLD_CHECK__" } catch {}
        $wbCheck.Sheets.Item(1).Copy($oldCheck)
        $newCheck = $wb.Sheets.Item($oldCheck.Index - 1)
        try { $newCheck.Name = "반입전체크리스트" } catch {}
        $excel.DisplayAlerts = $false
        try { $oldCheck.Delete() } catch {}
        if ($oldCheck.Name -eq "__OLD_CHECK__") {
            try { $oldCheck.Visible = 0 } catch {}
        }
        $wbCheck.Close($false)
    } catch {}
}

if (Test-Path $safetyIn) {
    try {
        $excel.DisplayAlerts = $false
        $wbSafety = $excel.Workbooks.Open($safetyIn, 0, $true)
        $oldSafety = Get-SheetByKeyword $wb "안전점검|결과서" 3
        try { $oldSafety.Name = "__OLD_SAFETY__" } catch {}
        $wbSafety.Sheets.Item(1).Copy($oldSafety)
        $newSafety = $wb.Sheets.Item($oldSafety.Index - 1)
        try { $newSafety.Name = "안전점검결과서" } catch {}
        $excel.DisplayAlerts = $false
        try { $oldSafety.Delete() } catch {}
        if ($oldSafety.Name -eq "__OLD_SAFETY__") {
            try { $oldSafety.Visible = 0 } catch {}
        }
        $wbSafety.Close($false)
    } catch {}
}

# 불필요한 잔여 임시 시트(__OLD_*, Sheet*) 정리
for ($sIdx = $wb.Sheets.Count; $sIdx -ge 1; $sIdx--) {
    try {
        $sItem = $wb.Sheets.Item($sIdx)
        if ($sItem.Name -match "^(__OLD_|Sheet\d+)") {
            $excel.DisplayAlerts = $false
            $sItem.Delete()
        }
    } catch {}
}

$wsContract = Get-SheetByKeyword $wb "계약서" 1
$wsChecklistBase = Get-SheetByKeyword $wb "반입전|체크리스트" 2
$wsSafetyBase = Get-SheetByKeyword $wb "안전점검|결과서" 3

Replace-Sheet-Stamp $wsChecklistBase $stampPath 624 65.25 38.4 31.5
Replace-Sheet-Stamp $wsSafetyBase $stampPath 606 133.5 38.4 37.8

# --- 2. 계약서 데이터 주입 (Sheet 1) ---
Replace-Tag $wsContract "{Today}" "${psEscape(contractDate)}"
Replace-Tag $wsContract "{테넌트사업자번호}" "${psEscape(tenantBizNo)}"
Replace-Tag $wsContract "{테넌트사업자등록번호}" "${psEscape(tenantBizNo)}"
Replace-Tag $wsContract "{테넌트상호}" "${psEscape(tenantCorp)}"
Replace-Tag $wsContract "{테넌트명}" "${psEscape(tenantCorp)}"
Replace-Tag $wsContract "{테넌트}" "${psEscape(tenantCorp)}"
Replace-Tag $wsContract "(주)기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $wsContract "주식회사 기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $wsContract "{테넌트대표자}" "${psEscape(tenantRepName)}"
Replace-Tag $wsContract "{테넌트대표}" "${psEscape(tenantRepName)}"
Replace-Tag $wsContract "이 수 용" "${psEscape(tenantRepName)}"
Replace-Tag $wsContract "이수용" "${psEscape(tenantRepName)}"
try { $wsContract.Range("D32:F32").HorizontalAlignment = -4108 } catch {}
${tenantBizNo ? `Replace-Tag $wsContract "138-81-83251" "${psEscape(tenantBizNo)}"` : ''}
${tenantBankAccount ? `Replace-Tag $wsContract "{입금계좌}" "${psEscape(tenantBankAccount)}"` : ''}
${(tenantBankAccount && !tenantCorp.includes('기연리프트')) ? `Replace-Tag $wsContract "신한은행 140-010-007060 예금주 주식회사 기연리프트" "${psEscape(tenantBankAccount)}"\nReplace-Tag $wsContract "신한은행 140-010-007060 예금주 ${psEscape(tenantCorp)}" "${psEscape(tenantBankAccount)}"` : ''}
Replace-Tag $wsContract "{사업자등록번호}" "${psEscape(bizRegNo)}"
Replace-Tag $wsContract "{고객명}" "${psEscape(custName)}"
Replace-Tag $wsContract "{대표자}" "${psEscape(ceoName)}"
Replace-Tag $wsContract "{현장명}" "${psEscape(siteName)}"
Replace-Tag $wsContract "{하차일시}" "${psEscape(deliveryDate)}"
Replace-Tag $wsContract "{현장주소}" "${psEscape(siteAddress)}"
Replace-Tag $wsContract "{현장담당자}" "${psEscape(managerName)}"
Replace-Tag $wsContract "{현장담당자연락처}" "${psEscape(managerPhone)}"
Replace-Tag $wsContract "{영업담당자}" "${salesRepName}"
Replace-Tag $wsContract "{영업담당자연락처}" "${salesRepPhone}"
Replace-Tag $wsContract "{최소기간}" "${psEscape(minPeriod)}"
Replace-Tag $wsContract "{최고기간}" "${psEscape(minPeriod)}"
Replace-Tag $wsContract "{기준기간}" "${psEscape(basePeriod)}"
Replace-Tag $wsContract "■ 3개월 이하: 왕복 운반비 임차인 부담 ■ 5개월 이하: 편도 운반비 임차인 부담 ■ 5개월 초과 : 왕복 운반비 임대인 부담" "■ ${psEscape(minPeriod)}개월 이하: 왕복 운반비 임차인 부담 ■ ${psEscape(basePeriod)}개월 이하: 편도 운반비 임차인 부담 ■ ${psEscape(basePeriod)}개월 초과 : 왕복 운반비 임대인 부담"
$wsContract.Range("C56").Value2 = "■ ${psEscape(minPeriod)}개월 이하: 왕복 운반비 임차인 부담 ■ ${psEscape(basePeriod)}개월 이하: 편도 운반비 임차인 부담 ■ ${psEscape(basePeriod)}개월 초과 : 왕복 운반비 임대인 부담 "
Replace-Tag $wsContract "{합계}" "₩${grandTotalFee.toLocaleString()}"
Replace-Tag $wsContract "{옵션}" ""
$wsContract.Range("C57").Value2 = ""
${remarksText ? `Replace-Tag $wsContract "{특이사항}" "${psEscape(remarksText)}"` : `Replace-Tag $wsContract "{특이사항} " ""\nReplace-Tag $wsContract "{특이사항}" ""`}
Replace-Tag $wsContract "(유상옵션)" ""
Replace-Tag $wsContract "(수량) / {단위}" ""
Replace-Tag $wsContract "(수량)" ""
Replace-Tag $wsContract "{단가}" ""
Replace-Tag $wsContract "{제조번호}" ""

if (${contractItems.length} -gt 12) {
    $extraRows = ${contractItems.length} - 12
    for ($k = 0; $k -lt $extraRows; $k++) {
        $wsContract.Rows.Item(54).Copy()
        $null = $wsContract.Rows.Item(55).Insert(-4121)
    }
}

` + Array.from({ length: totalItemRows }, (_, idx) => {
  const row = 44 + idx;
  const item = contractItems[idx];
  if (item) {
    return `
$wsContract.Cells.Item(${row}, 1).Value2 = "${item.col1}"
$wsContract.Cells.Item(${row}, 3).Value2 = "${item.col3}"
$wsContract.Cells.Item(${row}, 4).Value2 = "${item.col4}"
$wsContract.Cells.Item(${row}, 4).WrapText = $${item.hasNewline ? 'true' : 'false'}
$wsContract.Cells.Item(${row}, 5).Value2 = "${item.col5}"
$wsContract.Cells.Item(${row}, 7).Value2 = "${item.col7}"
`;
  }
  return `
$wsContract.Cells.Item(${row}, 1).Value2 = ""
$wsContract.Cells.Item(${row}, 3).Value2 = ""
$wsContract.Cells.Item(${row}, 4).Value2 = ""
$wsContract.Cells.Item(${row}, 5).Value2 = ""
$wsContract.Cells.Item(${row}, 7).Value2 = ""
`;
}).join('') + `

Place-Contract-Rep-Stamp $wsContract $stampPath "${psEscape(tenantRepName)}"

try {
  $wsContract.PageSetup.PaperSize = 9
  $wsContract.PageSetup.Orientation = 1
  $wsContract.PageSetup.Zoom = $false
  $wsContract.PageSetup.FitToPagesWide = 1
  if (${contractItems.length} -le 12) {
    $wsContract.PageSetup.PrintArea = "A26:K78"
    $wsContract.PageSetup.FitToPagesTall = 1
  } else {
    $endRow = 78 + (${contractItems.length} - 12)
    $wsContract.PageSetup.PrintArea = "A26:K$endRow"
    $wsContract.PageSetup.FitToPagesTall = $false
  }
} catch {}

# --- 3. 자산별 반입전체크리스트 & 안전점검결과서 순회 생성 ---
# 원본 시트($wsChecklistBase, $wsSafetyBase)의 태그가 치환되기 전에 먼저 자산 대수만큼 시트를 복제하여 배열에 보관
$checkSheets = @($wsChecklistBase)
$safetySheets = @($wsSafetyBase)
for ($cIdx = 1; $cIdx -lt ${assets.length}; $cIdx++) {
    $wsChecklistBase.Copy([Type]::Missing, $checkSheets[$cIdx - 1])
    $copiedCheck = $wb.Sheets.Item($checkSheets[$cIdx - 1].Index + 1)
    try { $copiedCheck.Name = "반입전체크리스트_$($cIdx + 1)" } catch {}
    $checkSheets += $copiedCheck
}
for ($sIdx = 1; $sIdx -lt ${assets.length}; $sIdx++) {
    $wsSafetyBase.Copy([Type]::Missing, $safetySheets[$sIdx - 1])
    $copiedSafety = $wb.Sheets.Item($safetySheets[$sIdx - 1].Index + 1)
    try { $copiedSafety.Name = "안전점검결과서_$($sIdx + 1)" } catch {}
    $safetySheets += $copiedSafety
}

` + assets.map((ast, idx) => {
  const astInspDate = psEscape(ast.inspectionDate || inspectionDate);
  const astInspName = psEscape(ast.inspectorName || inspectorName);
  const astModel = psEscape(ast.modelName || '-');
  const astNo = psEscape(ast.assetNo || '-');
  const astMfg = psEscape((ast.manufacturer && ast.manufacturer !== '-') ? ast.manufacturer : '-');
  const astPower = psEscape((ast.powerSource && ast.powerSource !== '-') ? ast.powerSource : '배터리');
  const astWeight = psEscape((ast.weight && ast.weight !== '-') ? ast.weight : '-');
  const astSpeed = psEscape((ast.speed && ast.speed !== '-') ? ast.speed : '-');
  const astWorkingHeight = psEscape((ast.workingHeight && ast.workingHeight !== '-') ? ast.workingHeight : '-');
  const astCapacity = psEscape((ast.capacityPreExt && ast.capacityPreExt !== '-') ? ast.capacityPreExt : '-');
  const astMfgYear = psEscape((ast.manufactureYear && ast.manufactureYear !== '-') ? ast.manufactureYear : '-');
  const astCertDate = psEscape((ast.safetyCertDate && ast.safetyCertDate !== '-') ? ast.safetyCertDate : ((ast.certDate && ast.certDate !== '-') ? ast.certDate : '-'));

  return `
$curChecklist = $checkSheets[${idx}]
$curSafety = $safetySheets[${idx}]

Replace-Tag $curChecklist "{테넌트사업자번호}" "${psEscape(tenantBizNo)}"
Replace-Tag $curChecklist "{테넌트상호}" "${psEscape(tenantCorp)}"
Replace-Tag $curChecklist "{테넌트대표자}" "${psEscape(tenantRepName)}"
Replace-Tag $curChecklist "(주)기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $curChecklist "주식회사 기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $curChecklist "{테넌트}" "${psEscape(tenantCorp)}"
Replace-Tag $curChecklist "{모델명}" "${astModel}"
Replace-Tag $curChecklist "{관리번호}" "${astNo}"
Replace-Tag $curChecklist "{점검일시}" "${astInspDate}"
Replace-Tag $curChecklist "{안전점검일시}" "${astInspDate}"
Replace-Tag $curChecklist "{{배차일)-2} 또는 {지정}" "${astInspDate}"
Replace-Tag $curChecklist "{(배차일)-2} 또는 {지정}" "${astInspDate}"
Replace-Tag $curChecklist "{(배차일)-2}" "${astInspDate}"
Replace-Tag $curChecklist "{Today}" "${astInspDate}"
Replace-Tag $curChecklist "{점검자}" "${astInspName}"
Replace-Tag $curChecklist "{점점자}" "${astInspName}"
Replace-Tag $curChecklist "김관주" "${astInspName}"
try {
  $curChecklist.PageSetup.Orientation = 1
  $curChecklist.PageSetup.Zoom = $false
  $curChecklist.PageSetup.FitToPagesWide = 1
  $curChecklist.PageSetup.FitToPagesTall = 1
} catch {}

Replace-Tag $curSafety "{사업장명}" "${psEscape(siteName)}"
Replace-Tag $curSafety "{형식}" "자주식 시저형"
Replace-Tag $curSafety "{제조사}" "${astMfg}"
Replace-Tag $curSafety "{테넌트사업자번호}" "${psEscape(tenantBizNo)}"
Replace-Tag $curSafety "{테넌트상호}" "${psEscape(tenantCorp)}"
Replace-Tag $curSafety "{테넌트대표자}" "${psEscape(tenantRepName)}"
Replace-Tag $curSafety "(주)기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $curSafety "주식회사 기연리프트" "${psEscape(tenantCorp)}"
Replace-Tag $curSafety "{테넌트}" "${psEscape(tenantCorp)}"
Replace-Tag $curSafety "{고객명}" "${psEscape(custName)}"
Replace-Tag $curSafety "{동력방식}" "${astPower}"
Replace-Tag $curSafety "{모델명}" "${astModel}"
Replace-Tag $curSafety "{중량}" "${astWeight}"
Replace-Tag $curSafety "{운행속도}" "${astSpeed}"
Replace-Tag $curSafety "{작업높이}" "${astWorkingHeight}"
Replace-Tag $curSafety "{적재}" "${astCapacity}"
Replace-Tag $curSafety "{관리번호}" "${astNo}"
Replace-Tag $curSafety "{차량번호}" "${astNo}"
Replace-Tag $curSafety "{제조연도}년" "${astMfgYear}"
Replace-Tag $curSafety "{제조연도}" "${astMfgYear}"
Replace-Tag $curSafety "{안전인증일}" "${astCertDate}"
Replace-Tag $curSafety "{Today}" "${astInspDate}"
Replace-Tag $curSafety "{점검일시}" "${astInspDate}"
Replace-Tag $curSafety "{안전점검일시}" "${astInspDate}"
Replace-Tag $curSafety "{{배차일)-2} 또는 {지정}" "${astInspDate}"
Replace-Tag $curSafety "{(배차일)-2} 또는 {지정}" "${astInspDate}"
Replace-Tag $curSafety "{(배차일)-2}" "${astInspDate}"
Replace-Tag $curSafety "{점검자}" "${astInspName}"
Replace-Tag $curSafety "{점점자}" "${astInspName}"
Replace-Tag $curSafety "김관주" "${astInspName}"
try {
  $curSafety.PageSetup.Orientation = 1
  $curSafety.PageSetup.Zoom = $false
  $curSafety.PageSetup.FitToPagesWide = 1
  $curSafety.PageSetup.FitToPagesTall = 1
} catch {}
`;
}).join('\n') + `

$wb.ExportAsFixedFormat(0, $masterPdf)
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }
  if ($excel) {
    try { $excel.Quit() } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
  }
}
`;

    const masterPdfOut = path.join(tempBuildDir, '01.계약서패키지.pdf');
    try {
      const psFile = path.join(tempBuildDir, 'build_bundle.ps1');
      fs.writeFileSync(psFile, psScript, 'utf8');

      const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      await runCommandAsync(`"${psExe}" -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { cwd: tempBuildDir });
      if (!fs.existsSync(masterPdfOut) || fs.statSync(masterPdfOut).size === 0) {
        throw new Error('EXCEL_COM_EMPTY_OUTPUT');
      }
    } catch (excelComErr) {
      agentLog('WARN', `계약서패키지 Excel COM 변환 실패 -> 내장 ExcelJS + Edge Headless 엔진 자동 전환 (${excelComErr.message})`);
      const ExcelJS = require('exceljs');
      const pageHtmls = [];

      const wbContract = new ExcelJS.Workbook();
      await wbContract.xlsx.readFile(resolvedMasterXlsxPath);
      const wsContract = wbContract.worksheets.find(s => s.name.includes('계약서')) || wbContract.worksheets[0];
      if (effectiveStampBuffer && effectiveStampBuffer.length > 500) {
        const existingContractImgs = wsContract.getImages ? wsContract.getImages() : [];
        if (existingContractImgs.length > 0) {
          replaceWorksheetStampBuffers(wbContract, wsContract, effectiveStampBuffer);
        } else {
          const stampId = wbContract.addImage({ buffer: effectiveStampBuffer, extension: 'png' });
          wsContract.addImage(stampId, {
            tl: { col: 4.15, row: 30.82 },
            br: { col: 5.25, row: 32.18 },
            editAs: 'oneCell'
          });
        }
      }

      const rawSalesRepName = String(payload.salesRepName || payload.salespersonName || tenantRepName || '영업담당자');
      const rawSalesRepPhone = String(payload.salesRepPhone || payload.salespersonPhone || tenantTel || '010-0000-0000');

      replaceTagInWorksheet(wsContract, '{Today}', contractDate);
      replaceTagInWorksheet(wsContract, '{테넌트사업자번호}', tenantBizNo);
      replaceTagInWorksheet(wsContract, '{테넌트사업자등록번호}', tenantBizNo);
      replaceTagInWorksheet(wsContract, '{테넌트상호}', tenantCorp);
      replaceTagInWorksheet(wsContract, '{테넌트명}', tenantCorp);
      replaceTagInWorksheet(wsContract, '{테넌트}', tenantCorp);
      replaceTagInWorksheet(wsContract, '(주)기연리프트', tenantCorp);
      replaceTagInWorksheet(wsContract, '주식회사 기연리프트', tenantCorp);
      replaceTagInWorksheet(wsContract, '{테넌트대표자}', tenantRepName);
      replaceTagInWorksheet(wsContract, '{테넌트대표}', tenantRepName);
      replaceTagInWorksheet(wsContract, '이 수 용', tenantRepName);
      replaceTagInWorksheet(wsContract, '이수용', tenantRepName);
      try {
        const repCell = wsContract.getCell('D32');
        repCell.alignment = { ...(repCell.alignment || {}), horizontal: 'center', vertical: 'middle' };
      } catch (e) {}
      if (tenantBizNo) replaceTagInWorksheet(wsContract, '138-81-83251', tenantBizNo);
      if (tenantBankAccount) {
        replaceTagInWorksheet(wsContract, '{입금계좌}', tenantBankAccount);
        if (!tenantCorp.includes('기연리프트')) {
          replaceTagInWorksheet(wsContract, '신한은행 140-010-007060 예금주 주식회사 기연리프트', tenantBankAccount);
          replaceTagInWorksheet(wsContract, `신한은행 140-010-007060 예금주 ${tenantCorp}`, tenantBankAccount);
        }
      }
      replaceTagInWorksheet(wsContract, '{사업자등록번호}', bizRegNo);
      replaceTagInWorksheet(wsContract, '{고객명}', custName);
      replaceTagInWorksheet(wsContract, '{대표자}', ceoName);
      replaceTagInWorksheet(wsContract, '{현장명}', siteName);
      replaceTagInWorksheet(wsContract, '{하차일시}', deliveryDate);
      replaceTagInWorksheet(wsContract, '{현장주소}', siteAddress);
      replaceTagInWorksheet(wsContract, '{현장담당자}', managerName);
      replaceTagInWorksheet(wsContract, '{현장담당자연락처}', managerPhone);
      replaceTagInWorksheet(wsContract, '{영업담당자}', rawSalesRepName);
      replaceTagInWorksheet(wsContract, '{영업담당자연락처}', rawSalesRepPhone);
      replaceTagInWorksheet(wsContract, '{최소기간}', minPeriod);
      replaceTagInWorksheet(wsContract, '{최고기간}', minPeriod);
      replaceTagInWorksheet(wsContract, '{기준기간}', basePeriod);
      const freightRuleStr = `■ ${minPeriod}개월 이하: 왕복 운반비 임차인 부담 ■ ${basePeriod}개월 이하: 편도 운반비 임차인 부담 ■ ${basePeriod}개월 초과 : 왕복 운반비 임대인 부담 `;
      replaceTagInWorksheet(wsContract, '■ 3개월 이하: 왕복 운반비 임차인 부담 ■ 5개월 이하: 편도 운반비 임차인 부담 ■ 5개월 초과 : 왕복 운반비 임대인 부담', freightRuleStr);
      wsContract.getCell('C56').value = freightRuleStr;
      replaceTagInWorksheet(wsContract, '{합계}', `₩${grandTotalFee.toLocaleString()}`);
      replaceTagInWorksheet(wsContract, '{옵션}', '');
      wsContract.getCell('C57').value = '';
      if (remarksText) {
        replaceTagInWorksheet(wsContract, '{특이사항}', remarksText);
      } else {
        replaceTagInWorksheet(wsContract, '{특이사항} ', '');
        replaceTagInWorksheet(wsContract, '{특이사항}', '');
      }
      replaceTagInWorksheet(wsContract, '(유상옵션)', '');
      replaceTagInWorksheet(wsContract, '(수량) / {단위}', '');
      replaceTagInWorksheet(wsContract, '(수량)', '');
      replaceTagInWorksheet(wsContract, '{단가}', '');
      replaceTagInWorksheet(wsContract, '{제조번호}', '');

      const rawContractItems = [
        ...assets.map(ast => {
          const aNo = (ast.assetNo && ast.assetNo !== '-') ? String(ast.assetNo).trim() : '';
          const aSn = (ast.sn && ast.sn !== '-') ? String(ast.sn).trim() : '';
          const col4 = (aNo && aSn) ? `${aNo}\n${aSn}` : (aNo || aSn || '');
          const feeStr = (Number(ast.rentalFee) || 480000).toLocaleString();
          return {
            col1: String(ast.modelName || 'GS-2646'),
            col3: '1',
            col4,
            hasNewline: Boolean(aNo && aSn),
            col5: feeStr,
            col7: feeStr
          };
        }),
        ...paidOptions.map(opt => {
          const qty = Math.max(1, Number(opt.quantity) || 1);
          const uPrice = Number(opt.unitPrice) || 0;
          const sTotal = opt.subTotal !== undefined ? Number(opt.subTotal) : uPrice * qty;
          return {
            col1: String(opt.name || ''),
            col3: String(qty),
            col4: '',
            hasNewline: false,
            col5: uPrice.toLocaleString(),
            col7: sTotal.toLocaleString()
          };
        })
      ];

      if (rawContractItems.length > 12) {
        const extraRows = rawContractItems.length - 12;
        try { wsContract.duplicateRow(54, extraRows, true); } catch (e) {}
      }

      for (let idx = 0; idx < totalItemRows; idx++) {
        const rNum = 44 + idx;
        const itm = rawContractItems[idx];
        const rowObj = wsContract.getRow(rNum);
        rowObj.getCell(1).value = itm ? itm.col1 : '';
        rowObj.getCell(3).value = itm ? itm.col3 : '';
        rowObj.getCell(4).value = itm ? itm.col4 : '';
        rowObj.getCell(5).value = itm ? itm.col5 : '';
        rowObj.getCell(7).value = itm ? itm.col7 : '';
      }

      const contractEndRow = rawContractItems.length <= 12 ? 78 : (78 + rawContractItems.length - 12);
      pageHtmls.push(renderExcelWorksheetToHtmlPage(wbContract, wsContract, 26, contractEndRow, 1, 11));

      const checkTemplatePath = fs.existsSync(resolvedCheckXlsxPath)
        ? resolvedCheckXlsxPath
        : resolvedMasterXlsxPath;

      for (const ast of assets) {
        const wbChk = new ExcelJS.Workbook();
        await wbChk.xlsx.readFile(checkTemplatePath);
        const wsChk = wbChk.worksheets.find(s => /반입전|체크리스트/.test(s.name)) || wbChk.worksheets[0];
        replaceWorksheetStampBuffers(wbChk, wsChk, effectiveStampBuffer);
        const astInspDate = String(ast.inspectionDate || inspectionDate);
        const astInspName = String(ast.inspectorName || inspectorName);
        const astModel = String(ast.modelName || '-');
        const astNo = String(ast.assetNo || '-');

        replaceTagInWorksheet(wsChk, '{테넌트사업자번호}', tenantBizNo);
        replaceTagInWorksheet(wsChk, '{테넌트상호}', tenantCorp);
        replaceTagInWorksheet(wsChk, '{테넌트대표자}', tenantRepName);
        replaceTagInWorksheet(wsChk, '(주)기연리프트', tenantCorp);
        replaceTagInWorksheet(wsChk, '주식회사 기연리프트', tenantCorp);
        replaceTagInWorksheet(wsChk, '{테넌트}', tenantCorp);
        replaceTagInWorksheet(wsChk, '{모델명}', astModel);
        replaceTagInWorksheet(wsChk, '{관리번호}', astNo);
        replaceTagInWorksheet(wsChk, '{점검일시}', astInspDate);
        replaceTagInWorksheet(wsChk, '{안전점검일시}', astInspDate);
        replaceTagInWorksheet(wsChk, '{{배차일)-2} 또는 {지정}', astInspDate);
        replaceTagInWorksheet(wsChk, '{(배차일)-2} 또는 {지정}', astInspDate);
        replaceTagInWorksheet(wsChk, '{(배차일)-2}', astInspDate);
        replaceTagInWorksheet(wsChk, '{Today}', astInspDate);
        replaceTagInWorksheet(wsChk, '{점검자}', astInspName);
        replaceTagInWorksheet(wsChk, '{점점자}', astInspName);
        replaceTagInWorksheet(wsChk, '김관주', astInspName);

        pageHtmls.push(renderExcelWorksheetToHtmlPage(wbChk, wsChk, 1, Math.min(46, wsChk.rowCount || 46), 1, 14));
      }

      const safetyTemplatePath = fs.existsSync(resolvedSafetyXlsxPath)
        ? resolvedSafetyXlsxPath
        : resolvedMasterXlsxPath;

      for (const ast of assets) {
        const wbSaf = new ExcelJS.Workbook();
        await wbSaf.xlsx.readFile(safetyTemplatePath);
        const wsSaf = wbSaf.worksheets.find(s => /안전점검|결과서/.test(s.name)) || wbSaf.worksheets[wbSaf.worksheets.length - 1];
        replaceWorksheetStampBuffers(wbSaf, wsSaf, effectiveStampBuffer);
        const astInspDate = String(ast.inspectionDate || inspectionDate);
        const astInspName = String(ast.inspectorName || inspectorName);
        const astModel = String(ast.modelName || '-');
        const astNo = String(ast.assetNo || '-');
        const astMfg = (ast.manufacturer && ast.manufacturer !== '-') ? String(ast.manufacturer) : '-';
        const astPower = (ast.powerSource && ast.powerSource !== '-') ? String(ast.powerSource) : '배터리';
        const astWeight = (ast.weight && ast.weight !== '-') ? String(ast.weight) : '-';
        const astSpeed = (ast.speed && ast.speed !== '-') ? String(ast.speed) : '-';
        const astWorkingHeight = (ast.workingHeight && ast.workingHeight !== '-') ? String(ast.workingHeight) : '-';
        const astCapacity = (ast.capacityPreExt && ast.capacityPreExt !== '-') ? String(ast.capacityPreExt) : '-';
        const astMfgYear = (ast.manufactureYear && ast.manufactureYear !== '-') ? String(ast.manufactureYear) : '-';
        const astCertDate = (ast.safetyCertDate && ast.safetyCertDate !== '-') ? String(ast.safetyCertDate) : ((ast.certDate && ast.certDate !== '-') ? String(ast.certDate) : '-');

        replaceTagInWorksheet(wsSaf, '{사업장명}', siteName);
        replaceTagInWorksheet(wsSaf, '{형식}', '자주식 시저형');
        replaceTagInWorksheet(wsSaf, '{제조사}', astMfg);
        replaceTagInWorksheet(wsSaf, '{테넌트사업자번호}', tenantBizNo);
        replaceTagInWorksheet(wsSaf, '{테넌트상호}', tenantCorp);
        replaceTagInWorksheet(wsSaf, '{테넌트대표자}', tenantRepName);
        replaceTagInWorksheet(wsSaf, '(주)기연리프트', tenantCorp);
        replaceTagInWorksheet(wsSaf, '주식회사 기연리프트', tenantCorp);
        replaceTagInWorksheet(wsSaf, '{테넌트}', tenantCorp);
        replaceTagInWorksheet(wsSaf, '{고객명}', custName);
        replaceTagInWorksheet(wsSaf, '{동력방식}', astPower);
        replaceTagInWorksheet(wsSaf, '{모델명}', astModel);
        replaceTagInWorksheet(wsSaf, '{중량}', astWeight);
        replaceTagInWorksheet(wsSaf, '{운행속도}', astSpeed);
        replaceTagInWorksheet(wsSaf, '{작업높이}', astWorkingHeight);
        replaceTagInWorksheet(wsSaf, '{적재}', astCapacity);
        replaceTagInWorksheet(wsSaf, '{관리번호}', astNo);
        replaceTagInWorksheet(wsSaf, '{차량번호}', astNo);
        replaceTagInWorksheet(wsSaf, '{제조연도}년', astMfgYear);
        replaceTagInWorksheet(wsSaf, '{제조연도}', astMfgYear);
        replaceTagInWorksheet(wsSaf, '{안전인증일}', astCertDate);
        replaceTagInWorksheet(wsSaf, '{Today}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{점검일시}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{안전점검일시}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{{배차일)-2} 또는 {지정}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{(배차일)-2} 또는 {지정}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{(배차일)-2}', astInspDate);
        replaceTagInWorksheet(wsSaf, '{점검자}', astInspName);
        replaceTagInWorksheet(wsSaf, '{점점자}', astInspName);
        replaceTagInWorksheet(wsSaf, '김관주', astInspName);

        pageHtmls.push(renderExcelWorksheetToHtmlPage(wbSaf, wsSaf, 1, Math.min(46, wsSaf.rowCount || 46), 1, 11));
      }

      await convertHtmlPagesToPdfViaEdge(pageHtmls, masterPdfOut, tempBuildDir);
    }

    const { PDFDocument } = require('pdf-lib');

    const mergedPdf = await PDFDocument.create();
    const pdfSources = [
      path.join(tempBuildDir, '01.계약서패키지.pdf')
    ];

    const uniqueModels = [...new Set((assets || []).map(a => a.modelName).filter(Boolean))];
    
    for (const model of uniqueModels) {
      const eqDocDir = resolveEqDocModelDir(model) || resolveMirrorReadPath(effectiveCode, path.join('Eq_doc', model));
      if (fs.existsSync(eqDocDir)) {
        const files = fs.readdirSync(eqDocDir).filter(f => f.toLowerCase().endsWith('.pdf'));
        files.sort();
        for (const f of files) {
          pdfSources.push(path.join(eqDocDir, f));
        }
      }
    }

    pdfSources.push(resolveMirrorReadPath(effectiveCode, '08.생산물배상책임보험증권.pdf'));
    pdfSources.push(resolveMirrorReadPath(effectiveCode, '09.사업자등록증.pdf'));
    pdfSources.push(resolveMirrorReadPath(effectiveCode, '10.통장사본.pdf'));

    for (const p of pdfSources) {
      if (fs.existsSync(p)) {
        const bytes = fs.readFileSync(p);
        const doc = await PDFDocument.load(bytes);
        const copied = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copied.forEach(page => mergedPdf.addPage(page));
      }
    }

    const finalPdfBytes = await mergedPdf.save();
    const pageCount = mergedPdf.getPageCount();
    const safeCustName = (payload.customerName || '고객').replace(/[\\/:*?"<>|]/g, '');
    const safeSiteName = String(payload.siteName || '현장').replace(/[\\/:*?"<>|]/g, '');
    const contractStartDateStr = String(payload.contractStartDate || payload.contractDate || '').replace(/[\\/:*?"<>|]/g, '');
    const cleanTenantPrefix = String(tenantName).replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
    const fileName = `[${cleanTenantPrefix}계약서]_${safeCustName}_${safeSiteName}_${contractStartDateStr}.pdf`;

    const yyyyMm = contractDate.substring(0, 7) || new Date().toISOString().substring(0, 7);
    const archiveDir = path.join(tenantDirs.archiveRoot, yyyyMm);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const localSavePath = path.join(archiveDir, fileName);
    fs.writeFileSync(localSavePath, finalPdfBytes);

    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}

    agentLog('JOB', `계약서패키지 PDF 조립 완료: ${localSavePath} (${pageCount}p)`);
    return {
      success: true,
      fileName,
      pageCount,
      localPath: localSavePath,
      message: `100% 정품 엑셀 기반 7종 통합 서류팩 생성 완료 (총 ${pageCount}페이지)`
    };
  } catch (bundleErr) {
    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}
    throw bundleErr;
  }
}

async function executeGenerateStatementInternal(payload) {
  const tempBuildDir = path.join(AGENT_HOME, 'temp_statement_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  try {
    if (!fs.existsSync(tempBuildDir)) fs.mkdirSync(tempBuildDir, { recursive: true });
    const effectiveCode = getEffectiveTenantCode(payload.tenantCode);
    const tenantDirs = getTenantDirs(effectiveCode);
    const isGiyeon = effectiveCode === 'GIYEONLIFT';
    let statementMasterPath = resolveMirrorReadPath(effectiveCode, '00.거래명세서양식.xlsx');
    if (!fs.existsSync(statementMasterPath)) {
      agentLog('SYNC', `[${effectiveCode}] 거래명세서 양식 파일 부재 감지 -> Cloudflare R2 즉시 동기화 실행`);
      try { await autoSyncFromCloudflare(effectiveCode); } catch (e) {}
      statementMasterPath = resolveMirrorReadPath(effectiveCode, '00.거래명세서양식.xlsx');
    }

    const policy = getTenantPolicy(effectiveCode);
    const tenantName = payload.tenantName || payload.lessorName || policy.tenantName || policy.corporateName || (isGiyeon ? '주식회사 기연리프트' : effectiveCode);
    const rawLessorName = payload.lessorName || policy.tenantName || policy.corporateName || tenantName;
    const lessorName = psEscape(rawLessorName);
    const lessorBizNo = psEscape(payload.lessorBizNo || policy.businessNumber || (isGiyeon ? '138-81-83251' : ''));
    const lessorCeo = psEscape(String(payload.lessorCeo || policy.representativeName || (isGiyeon ? '이수용' : '')).replace(/\s+/g, '').trim() || (isGiyeon ? '이수용' : ''));
    const lessorAddress = psEscape(payload.lessorAddress || policy.businessAddress || '');
    const lessorBizType = psEscape(payload.lessorBizType || policy.businessCategory || '사업지원및임대서비스업');
    const lessorBizItem = psEscape(payload.lessorBizItem || policy.businessItem || (isGiyeon ? '고소장비임대업' : ''));
    const lessorTel = psEscape(payload.billingManagerPhone || payload.lessorTel || policy.tel || (isGiyeon ? '031-334-5295' : ''));
    const lessorEmail = psEscape(payload.lessorEmail || policy.taxEmail || policy.email || (isGiyeon ? 'giyeonlift@naver.com' : ''));

    let defaultBank = isGiyeon ? '기업은행 123-456789-01-011 (주식회사 기연리프트)' : '';
    if (Array.isArray(policy.bankAccounts) && policy.bankAccounts.length > 0) {
      const b0 = policy.bankAccounts[0];
      if (typeof b0 === 'object' && b0.bankName) {
        defaultBank = `${b0.bankName} ${b0.accountNumber || ''} (${b0.accountHolder || b0.holder || rawLessorName})`;
      }
    }
    const bankAccount = psEscape(payload.bankAccount || defaultBank);

    const rawCustName = payload.customerName || '고객사';
    const rawSiteName = payload.siteName || '현장';
    const custName = psEscape(rawCustName);
    const bizRegNo = psEscape(payload.customerBizNo || payload.bizRegNo || '-');
    const ceoName = psEscape(payload.customerCeo || '-');
    const billingDate = psEscape(payload.billingDate || new Date().toISOString().split('T')[0]);
    const siteName = psEscape(rawSiteName);
    const siteAddress = psEscape(payload.customerAddress || payload.siteAddress || payload.address || '-');
    const siteManagerName = psEscape(payload.siteManagerName || '-');
    const siteManagerPhone = psEscape(payload.siteManagerPhone || '-');
    const custBillingName = psEscape(payload.custBillingManagerName || payload.customerBillingManagerName || '-');
    const custBillingPhone = psEscape(payload.custBillingManagerPhone || payload.customerBillingManagerPhone || '-');
    const custBillingEmail = psEscape(payload.custBillingEmail || payload.customerBillingEmail || '-');
    const custBizType = psEscape(payload.customerBizType || '-');
    const custBizItem = psEscape(payload.customerBizItem || '-');

    const salespersonName = psEscape(payload.salespersonName || payload.lessorCeo || policy.representativeName || '영업담당자');
    const salespersonPhone = psEscape(payload.salespersonPhone || payload.lessorTel || policy.salesPhone || policy.tel || '-');
    const billingManagerName = psEscape(payload.billingManagerName || '정수아');
    const billingManagerPhone = psEscape(payload.billingManagerPhone || payload.lessorTel || policy.tel || '031-334-5295');
    const yyyyMm = (payload.billingYm || (payload.billingDate ? payload.billingDate.substring(0, 7) : new Date().toISOString().substring(0, 7))).replace(/[\\/:*?"<>|]/g, '');

    // 테넌트 도장/인감 이미지 바이너리 버퍼 추출 (00.거래명세서양식.xlsx 내 대표자 성명 우측 직인 배치용)
    const tenantStampBuffer = extractTenantStampBuffer(payload, policy);

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const items = rawItems.filter(it => {
      if (!it) return false;
      const hasAsset = Boolean(it.assetNo && it.assetNo !== '-');
      const uPrice = Number(it.unitPrice ?? it.price ?? 0);
      const sAmt = Number(it.supplyAmount ?? it.amount ?? 0);
      return hasAsset || uPrice !== 0 || sAmt !== 0;
    });

    const defaultMirrorStampPath = path.join(tenantDirs.driveMirrorDir, 'tenant_stamp.png');
    const fallbackMirrorStampPath = resolveMirrorReadPath(effectiveCode, 'tenant_stamp.png');
    let stampPngPath = path.join(tempBuildDir, 'tenant_stamp.png');
    if (tenantStampBuffer && tenantStampBuffer.length > 500) {
      try {
        fs.writeFileSync(stampPngPath, tenantStampBuffer);
        fs.writeFileSync(defaultMirrorStampPath, tenantStampBuffer);
      } catch (e) {}
    } else if (fs.existsSync(fallbackMirrorStampPath)) {
      stampPngPath = fallbackMirrorStampPath;
    }

    // 거래내역 정렬 표준 (SSOT): 1) 렌탈 자산 항목(현장투입일 오름차순) ➔ 2) 추가비용청구항목(유통 ➔ 소모품 ➔ 운송비 ➔ 수리비 ➔ 유상옵션 ➔ 매각 ➔ 기타)
    const normalizeSortDateKey = (raw) => {
      const s = String(raw || '').trim();
      if (!s || s === '-') return '9999-99-99';
      const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      return `9999-99-98_${s}`;
    };
    const classifyAgentStatementRow = (it) => {
      const cat = String(it?.billingCategory || '').trim();
      if ((cat === '임대료' || cat === '렌탈료') && it?.isRentalAsset === true) {
        return { billingCategory: cat, isRentalAsset: true };
      }
      if (cat && it?.isRentalAsset === false) {
        return { billingCategory: cat, isRentalAsset: false };
      }
      const text = `${it?.displayName || ''} ${it?.modelName || it?.model || ''} ${it?.itemDescription || it?.description || it?.itemName || ''}`.trim();
      const billingType = String(it?.billingType || '').trim();
      const contractType = String(it?.contractType || '').trim();
      const itemCategory = String(it?.itemCategory || '').trim();
      const assetNo = String(it?.assetNo || '').trim();
      const periodStart = String(it?.periodStart || '').trim();
      const hasContractAsset = Boolean(it?.hasContractAsset || it?.contractAssetId);
      const hasReceivable = Boolean(it?.hasReceivable || it?.receivableId);

      if (cat === '유통' || /\[유통출고|유통출고|유통판매|물품대금|중간발판|발판/i.test(text)) {
        return { billingCategory: '유통', isRentalAsset: false };
      }
      if (cat === '소모품' || /소모품|자재비|자재|부자재|보양재/i.test(text)) {
        return { billingCategory: '소모품', isRentalAsset: false };
      }
      if (
        cat === '운송비' ||
        cat === '운반비' ||
        billingType === 'TRANSPORT' ||
        itemCategory === 'TRANSPORT' ||
        /운반|운송|배차|회수|상하차|기타배차/i.test(text)
      ) {
        return { billingCategory: cat === '운반비' ? '운반비' : '운송비', isRentalAsset: false };
      }
      if (
        cat === '수리비' ||
        billingType === 'REPAIR' ||
        itemCategory === 'REPAIR' ||
        /수리|파손|정비|부품|인건비|출장비|출장|현장\s*AS|임차장비\s*파손|구상금|청소비|세척비/i.test(text)
      ) {
        return { billingCategory: '수리비', isRentalAsset: false };
      }
      if (cat === '유상옵션' || /\[유상옵션\]|\[옵션\s*추가장착\]|\[OPT:/i.test(text)) {
        return { billingCategory: '유상옵션', isRentalAsset: false };
      }
      if (cat === '매각' || billingType === 'ASSET_SALE' || contractType === 'SALE' || /매각|양도/i.test(text)) {
        return { billingCategory: '매각', isRentalAsset: false };
      }

      const hasAssetNo = Boolean(assetNo && assetNo !== '-');
      const hasPeriodStart = Boolean(periodStart && periodStart !== '-');
      const isManualOrReceivableNote = /추가 청구 항목|\[외상청구\]/i.test(text);
      if (
        !hasReceivable &&
        !isManualOrReceivableNote &&
        (
          hasContractAsset ||
          cat === '임대료' ||
          cat === '렌탈료' ||
          (hasAssetNo && (hasPeriodStart || /렌탈|임대|일할\s*청구|월렌탈료/.test(text))) ||
          /정기\s*월렌탈료|일할\s*청구|고소작업대\s*렌탈료|고소작업대\s*임대료/.test(text)
        )
      ) {
        return { billingCategory: cat === '렌탈료' ? '렌탈료' : '임대료', isRentalAsset: true };
      }
      return { billingCategory: cat || '기타', isRentalAsset: false };
    };
    const stripAgentCategoryPrefix = (raw) => {
      const s = String(raw || '').trim();
      if (!s) return '';
      const cleaned = s
        .replace(/^(?:\s*\[(?:유통출고[^\]]*|유통[^\]]*|유상옵션[^\]]*|무상옵션[^\]]*|옵션\s*추가장착[^\]]*|안전옵션[^\]]*|외상청구[^\]]*|외상미수[^\]]*|수리비[^\]]*|현장\s*AS[^\]]*|임차장비[^\]]*|고객부담[^\]]*|기타배차[^\]]*|운송료[^\]]*|운송비[^\]]*|운반비[^\]]*|자산매각[^\]]*|매각[^\]]*|소모품[^\]]*|자재비[^\]]*|청소비[^\]]*|세척비[^\]]*|구상금[^\]]*|추가청구[^\]]*)\]\s*)+/i, '')
        .replace(/\s*\[OPT:[^\]]*\]\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned || s;
    };
    const getAgentExtraRank = (catOrItem) => {
      const cat = typeof catOrItem === 'string'
        ? catOrItem.trim()
        : classifyAgentStatementRow(catOrItem).billingCategory;
      if (cat === '유통') return 1;
      if (cat === '소모품') return 2;
      if (cat === '운송비' || cat === '운반비') return 3;
      if (cat === '수리비') return 4;
      if (cat === '유상옵션') return 5;
      if (cat === '매각') return 6;
      return 7;
    };
    const sortedItems = items
      .map((it, idx) => {
        const cls = classifyAgentStatementRow(it);
        return { it, idx, isRental: cls.isRentalAsset, extraRank: getAgentExtraRank(cls.billingCategory) };
      })
      .sort((a, b) => {
        if (a.isRental !== b.isRental) return a.isRental ? -1 : 1;
        if (a.isRental) {
          const entryCmp = normalizeSortDateKey(a.it?.siteEntryDate).localeCompare(normalizeSortDateKey(b.it?.siteEntryDate));
          if (entryCmp !== 0) return entryCmp;
          const pStartCmp = normalizeSortDateKey(a.it?.periodStart).localeCompare(normalizeSortDateKey(b.it?.periodStart));
          if (pStartCmp !== 0) return pStartCmp;
          const modelCmp = String(a.it?.modelName || a.it?.model || '').localeCompare(String(b.it?.modelName || b.it?.model || ''));
          if (modelCmp !== 0) return modelCmp;
          const assetCmp = String(a.it?.assetNo || '').localeCompare(String(b.it?.assetNo || ''));
          if (assetCmp !== 0) return assetCmp;
          return a.idx - b.idx;
        }
        if (a.extraRank !== b.extraRank) return a.extraRank - b.extraRank;
        const dateA = normalizeSortDateKey(a.it?.siteEntryDate && a.it.siteEntryDate !== '-' ? a.it.siteEntryDate : a.it?.periodStart);
        const dateB = normalizeSortDateKey(b.it?.siteEntryDate && b.it.siteEntryDate !== '-' ? b.it.siteEntryDate : b.it?.periodStart);
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return a.idx - b.idx;
      })
      .map(entry => entry.it);

    // 단일 시트 연속 행 작성 (13행 분할 제거: 필요한 항목 수만큼 행 동적 조정)
    const rowCount = Math.max(1, sortedItems.length);
    const lastItemRow = 15 + rowCount;
    const totalRow = 16 + rowCount;
    const footerRow = 17 + rowCount;

    const itemWriteStatements = (() => {
      let s = '';
      for (let r = 0; r < rowCount; r++) {
        const item = sortedItems[r];
        const rowNum = 16 + r;
        if (item) {
          const globalNo = r + 1;
          let m = item.month !== undefined && item.month !== null ? item.month : '';
          let d = item.day !== undefined && item.day !== null ? item.day : '';
          if ((!m || !d) && (item.billingDate || item.date || item.transactionDate || billingDate)) {
            const dtParts = String(item.billingDate || item.date || item.transactionDate || billingDate).split('-');
            if (dtParts.length === 3) {
              if (!m) m = parseInt(dtParts[1], 10);
              if (!d) d = parseInt(dtParts[2], 10);
            }
          }

          let model = String(item.modelName || item.model || '').trim();
          let height = String(item.workingHeight || item.height || '').trim();
          let assetNo = String(item.assetNo || '').trim();
          let siteEntryDate = String(item.siteEntryDate || '').trim();
          let periodStart = String(item.periodStart || '').trim();
          let periodEnd = String(item.periodEnd || '').trim();
          let billingCategory = String(item.billingCategory || '').trim();
          const rawDesc = String(item.itemDescription || item.description || item.itemName || '').trim();

          if (!model && rawDesc) {
            const parts = rawDesc.split('_');
            if (parts.length >= 3 && parts[parts.length - 1].includes('~')) {
              model = parts[0];
              if (!assetNo) assetNo = parts[1];
              const [ps, pe] = parts[parts.length - 1].split('~');
              if (!periodStart && ps) periodStart = ps.trim();
              if (!periodEnd && pe) periodEnd = pe.trim();
            } else {
              model = rawDesc;
            }
          }
          const classifiedRow = classifyAgentStatementRow({ ...item, billingCategory, assetNo, periodStart, modelName: model, itemDescription: rawDesc });
          const rawCategory = classifiedRow.billingCategory;
          const isRentalRow = classifiedRow.isRentalAsset;
          if (!isRentalRow) {
            model = stripAgentCategoryPrefix(model);
          }
          const cleanedDesc = isRentalRow ? rawDesc : stripAgentCategoryPrefix(rawDesc);
          const rawSiteEntry = isRentalRow
            ? (siteEntryDate && siteEntryDate !== '-' ? siteEntryDate : (periodStart || '-'))
            : (siteEntryDate && siteEntryDate !== '-' ? siteEntryDate : '-');
          const rawPStart = periodStart || '-';
          const rawPEnd = periodEnd || '-';
          const safeTilde = (rawPStart !== '-' || rawPEnd !== '-') ? '~' : '';

          const baseModelAndHeight = item.modelAndHeight
            ? (isRentalRow ? item.modelAndHeight : stripAgentCategoryPrefix(item.modelAndHeight))
            : (height ? `${model} / ${height}` : (model || cleanedDesc || '-'));
          const modelAndHeight = psEscape(baseModelAndHeight);
          const safeAssetNo = psEscape(assetNo || '-');
          const safeCategory = psEscape(rawCategory);
          const safeSiteEntry = psEscape(rawSiteEntry);
          const safePStart = psEscape(rawPStart);
          const safePEnd = psEscape(rawPEnd);

          const qty = Number(item.quantity || item.qty || 1);
          const priceNum = item.unitPrice !== undefined ? Number(item.unitPrice) : (item.price !== undefined ? Number(item.price) : 0);
          const supplyNum = item.supplyAmount !== undefined ? Number(item.supplyAmount) : (item.amount !== undefined ? Number(item.amount) : (priceNum * qty));
          const vatNum = item.vatAmount !== undefined ? Number(item.vatAmount) : (item.vat !== undefined ? Number(item.vat) : Math.round(supplyNum * 0.1));
          const notes = psEscape(item.notes || item.remarks || item.memo || '');

          s += `
$curWs.Cells.Item(${rowNum}, 2).Value2 = ${globalNo}
$curWs.Cells.Item(${rowNum}, 3).Value2 = "${m}"
$curWs.Cells.Item(${rowNum}, 4).Value2 = "${d}"
$curWs.Cells.Item(${rowNum}, 5).Value2 = "${modelAndHeight}"
$curWs.Cells.Item(${rowNum}, 8).Value2 = "${safeAssetNo}"
$curWs.Cells.Item(${rowNum}, 11).Value2 = "${safeSiteEntry}"
$curWs.Cells.Item(${rowNum}, 12).Value2 = "${safePStart}"
$curWs.Cells.Item(${rowNum}, 13).Value2 = "${safeTilde}"
$curWs.Cells.Item(${rowNum}, 14).Value2 = "${safePEnd}"
$curWs.Cells.Item(${rowNum}, 15).Value2 = "${safeCategory}"
$curWs.Cells.Item(${rowNum}, 17).Value2 = ${qty}
$curWs.Cells.Item(${rowNum}, 18).Value2 = ${priceNum}
$curWs.Cells.Item(${rowNum}, 20).Value2 = ${supplyNum}
$curWs.Cells.Item(${rowNum}, 23).Value2 = ${vatNum}
$curWs.Cells.Item(${rowNum}, 25).Value2 = "${notes}"
`;
        } else {
          s += `
$curWs.Cells.Item(${rowNum}, 2).Value2 = $null
$curWs.Cells.Item(${rowNum}, 3).Value2 = $null
$curWs.Cells.Item(${rowNum}, 4).Value2 = $null
$curWs.Cells.Item(${rowNum}, 5).Value2 = $null
$curWs.Cells.Item(${rowNum}, 8).Value2 = $null
$curWs.Cells.Item(${rowNum}, 11).Value2 = $null
$curWs.Cells.Item(${rowNum}, 12).Value2 = $null
$curWs.Cells.Item(${rowNum}, 13).Value2 = $null
$curWs.Cells.Item(${rowNum}, 14).Value2 = $null
$curWs.Cells.Item(${rowNum}, 15).Value2 = $null
$curWs.Cells.Item(${rowNum}, 17).Value2 = $null
$curWs.Cells.Item(${rowNum}, 18).Value2 = $null
$curWs.Cells.Item(${rowNum}, 20).Value2 = $null
$curWs.Cells.Item(${rowNum}, 23).Value2 = $null
$curWs.Cells.Item(${rowNum}, 25).Value2 = $null
`;
        }
      }
      return s;
    })();

    const psScript = `\ufeff
$ErrorActionPreference = 'Stop'

$excel = $null
$wb = $null
try {
${PS_INIT_EXCEL_COM_BLOCK}

function Replace-Tag($targetWs, $tag, $val) {
  $null = $targetWs.Cells.Replace($tag, $val, 2, 1, $false, $false, $false)
}

function Prepare-Dynamic-Item-Table($targetWs, [int]$rowCount) {
  $lastItemRow = 15 + $rowCount
  $totalRow = 16 + $rowCount
  $borderColor = $targetWs.Range("B15").Borders.Item(8).Color
  $targetWs.Range("B16:AA28").UnMerge()

  if ($rowCount -gt 13) {
    $extra = $rowCount - 13
    $insertEnd = 20 + $extra - 1
    $insAddr = "A20:A" + $insertEnd
    $null = $targetWs.Range($insAddr).EntireRow.Insert(-4121)
    $null = $targetWs.Range("A17:AA17").EntireRow.Copy()
    $null = $targetWs.Range($insAddr).EntireRow.PasteSpecial(-4122)
  } elseif ($rowCount -lt 13) {
    $delStart = 16 + $rowCount
    $delAddr = "A" + $delStart + ":A28"
    $null = $targetWs.Range($delAddr).EntireRow.Delete(-4162)
  }

  $targetWs.Range("AB16:AB" + $lastItemRow).Clear()
  $targetWs.Range("A16:A" + $lastItemRow).EntireRow.RowHeight = 40

  for ($r = 16; $r -le $lastItemRow; $r++) {
    foreach ($rng in @('E:G','H:J','O:P','R:S','T:V','W:X','Y:AA')) {
      $parts = $rng -split ':'
      $addr = $parts[0] + $r + ':' + $parts[1] + $r
      $targetWs.Range($addr).Merge()
    }
  }

  $itemRange = $targetWs.Range("B16:AA" + $lastItemRow)
  $itemRange.Font.Color = 0
  foreach ($bIdx in @(7, 8, 9, 10, 11, 12)) {
    $itemRange.Borders.Item($bIdx).LineStyle = 1
    $itemRange.Borders.Item($bIdx).Color = $borderColor
    $itemRange.Borders.Item($bIdx).Weight = if ($bIdx -in @(11, 12)) { 1 } else { -4138 }
  }
  $targetWs.Range("L16:N" + $lastItemRow).Borders.Item(11).LineStyle = -4142

  $targetWs.Range("A" + $totalRow).EntireRow.RowHeight = 51
  $targetWs.Cells.Item($totalRow, 5).Formula = "=SUM(T16:V" + $lastItemRow + ")"
  $targetWs.Cells.Item($totalRow, 12).Formula = "=SUM(W16:X" + $lastItemRow + ")"
  $targetWs.Cells.Item($totalRow, 17).Formula = "=E" + $totalRow + "+L" + $totalRow
}

function Inject-Tenant-Stamp($targetWs, $stampPath) {
  if ([string]::IsNullOrEmpty($stampPath) -or -not (Test-Path $stampPath)) { return }
  try {
    for ($sIdx = $targetWs.Shapes.Count; $sIdx -ge 1; $sIdx--) {
      $sh = $targetWs.Shapes.Item($sIdx)
      if ($sh.Type -eq 13 -or $sh.Name -like '*Picture*' -or $sh.Name -like '*그림*') {
        $sh.Delete()
      }
    }
    $null = $targetWs.Shapes.AddPicture($stampPath, 0, -1, 610, 141, 42, 42)
  } catch {}
}

function Setup-Sheet-Page($targetWs, [int]$footerRow) {
  try {
    $targetWs.PageSetup.PaperSize = 9
    $targetWs.PageSetup.Orientation = 1
    $targetWs.PageSetup.PrintArea = "B1:AA$footerRow"
    $targetWs.PageSetup.PrintTitleRows = '$15:$15'
    $targetWs.PageSetup.Zoom = $false
    $targetWs.PageSetup.FitToPagesWide = 1
    $targetWs.PageSetup.FitToPagesTall = $false
    $targetWs.PageSetup.CenterHorizontally = $true
    $targetWs.PageSetup.LeftMargin = $excel.InchesToPoints(0.15)
    $targetWs.PageSetup.RightMargin = $excel.InchesToPoints(0.15)
    $targetWs.PageSetup.TopMargin = $excel.InchesToPoints(0.2)
    $targetWs.PageSetup.BottomMargin = $excel.InchesToPoints(0.2)
  } catch {}
}

# --- 1. 거래명세서 마스터 템플릿 복사 및 열기 ---
$masterIn = '${statementMasterPath.replace(/\\/g, '\\\\')}'
$statementWork = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\거래명세서_작업용.xlsx'
$statementPdf = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\거래명세서.pdf'
$stampPath = '${stampPngPath.replace(/\\/g, '\\\\')}'

Copy-Item $masterIn $statementWork -Force
$wb = $excel.Workbooks.Open($statementWork)
$wsBase = $wb.Sheets.Item(1)
$wsBase.Name = "거래명세서"
Inject-Tenant-Stamp $wsBase $stampPath

$curWs = $wsBase

# 공급자(테넌트) 및 공급받는자(고객사) {} 태그 치환
Replace-Tag $curWs "{테넌트사업자등록번호}" "${lessorBizNo}"
Replace-Tag $curWs "{테넌트상호}" "${lessorName}"
Replace-Tag $curWs "{테넌트대표}" "${lessorCeo}"
Replace-Tag $curWs "{테넌트주소}" "${lessorAddress}"
Replace-Tag $curWs "{테넌트업태}" "${lessorBizType}"
Replace-Tag $curWs "{테넌트종목}" "${lessorBizItem}"
Replace-Tag $curWs "{영업담당자}" "${salespersonName}"
Replace-Tag $curWs "{영업담당자연락처}" "${salespersonPhone}"
Replace-Tag $curWs "{테넌트계산서담당자}" "${billingManagerName}"
Replace-Tag $curWs "{테넌트전화}" "${billingManagerPhone}"
Replace-Tag $curWs "{테넌트세금계산서메일}" "${lessorEmail}"
Replace-Tag $curWs "{테넌트계좌}" "${bankAccount}"

Replace-Tag $curWs "{고객사업자등록증번호}" "${bizRegNo}"
Replace-Tag $curWs "{고객상호}" "${custName}"
Replace-Tag $curWs "{고객대표}" "${ceoName}"
Replace-Tag $curWs "{고객주소}" "${siteAddress}"
Replace-Tag $curWs "{고객업태}" "${custBizType}"
Replace-Tag $curWs "{고객종목}" "${custBizItem}"
Replace-Tag $curWs "{현장담당자}" "${siteManagerName}"
Replace-Tag $curWs "{현장담당자연락처}" "${siteManagerPhone}"
Replace-Tag $curWs "{계산서담당자}" "${custBillingName}"
Replace-Tag $curWs "{계산서담당자연락처}" "${custBillingPhone}"
Replace-Tag $curWs "{계산서메일}" "${custBillingEmail}"
Replace-Tag $curWs "{현장명}" "${siteName}"
Replace-Tag $curWs "{작성일자}" "${billingDate}"

Prepare-Dynamic-Item-Table $curWs ${rowCount}
${itemWriteStatements}
$curWs.Calculate()
Setup-Sheet-Page $curWs ${footerRow}

$wb.Save()

# --- 5. 전체 워크북 1회 Export ---
$wb.ExportAsFixedFormat(0, $statementPdf, 0, $true, $false, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, $false)
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }
  if ($excel) {
    try { $excel.Quit() } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
`;

    const statementPdfPath = path.join(tempBuildDir, '거래명세서.pdf');
    const xlsxWorkFile = path.join(tempBuildDir, '거래명세서_작업용.xlsx');
    const psFile = path.join(tempBuildDir, 'generate_statement.ps1');
    fs.writeFileSync(psFile, psScript, { encoding: 'utf8' });

    const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
    await runCommandAsync(`"${psExe}" -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, {
      cwd: tempBuildDir
    });
    if (!fs.existsSync(statementPdfPath) || fs.statSync(statementPdfPath).size === 0) {
      throw new Error('EXCEL_COM_EMPTY_OUTPUT');
    }

    const pdfBuffer = fs.readFileSync(statementPdfPath);
    const b64 = pdfBuffer.toString('base64');
    let pageCount = Math.max(1, Math.ceil(rowCount / 13));
    try {
      const { PDFDocument } = require('pdf-lib');
      const parsedPdf = await PDFDocument.load(pdfBuffer);
      pageCount = parsedPdf.getPageCount() || pageCount;
    } catch (e) {}

    const xlsxBuffer = fs.existsSync(xlsxWorkFile) ? fs.readFileSync(xlsxWorkFile) : null;
    const xlsxB64 = xlsxBuffer ? xlsxBuffer.toString('base64') : '';
    const safeCustName = String(rawCustName || '고객사').replace(/[\\/:*?"<>|]/g, '');
    const safeSiteName = String(rawSiteName || '현장').replace(/[\\/:*?"<>|]/g, '');
    const cleanTenantPrefix = String(tenantName).replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
    const fileName = `[${cleanTenantPrefix}]_거래명세서_${safeCustName}_${safeSiteName}_${yyyyMm}.pdf`;
    const xlsxFileName = `[${cleanTenantPrefix}]_거래명세서_${safeCustName}_${safeSiteName}_${yyyyMm}.xlsx`;

    const archiveDir = path.join(tenantDirs.archiveRoot, yyyyMm);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const localSavePath = path.join(archiveDir, fileName);
    const localXlsxSavePath = path.join(archiveDir, xlsxFileName);
    fs.writeFileSync(localSavePath, pdfBuffer);

    if (xlsxBuffer) {
      fs.writeFileSync(localXlsxSavePath, xlsxBuffer);
    }

    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}

    agentLog('JOB', `거래명세서 정품 엑셀 편집 및 PDF 출력 완료: ${localSavePath} (${pageCount}p)`);
    return {
      success: true,
      fileName,
      xlsxFileName,
      localPath: localSavePath,
      xlsxLocalPath: localXlsxSavePath,
      pageCount,
      base64Content: b64,
      xlsxBase64Content: xlsxB64,
      message: '100% 정품 엑셀 기반 거래명세서 편집 및 로컬 문서고 영구 아카이빙 완료'
    };
  } catch (statementErr) {
    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}
    throw statementErr;
  }
}

async function executeMonthlySafetyChecklistInternal(payload) {
  const tempBuildDir = path.join(AGENT_HOME, 'temp_monthly_chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  try {
    if (!fs.existsSync(tempBuildDir)) fs.mkdirSync(tempBuildDir, { recursive: true });

    const effectiveCode = getEffectiveTenantCode(payload.tenantCode);
    const tenantDirs = getTenantDirs(effectiveCode);
    const getTemplateCandidates = () => [
      resolveMirrorReadPath(effectiveCode, '고소작업대(TL)_월간_Checklist.xlsx'),
      resolveMirrorReadPath(effectiveCode, '05.월간안전점검체크리스트.xlsx')
    ];
    let templatePath = getTemplateCandidates().find(p => fs.existsSync(p));
    if (!templatePath) {
      agentLog('SYNC', `[${effectiveCode}] 월간 안전점검 체크리스트 양식 파일 부재 감지 -> Cloudflare R2 동기화 시도`);
      try { await autoSyncFromCloudflare(effectiveCode); } catch (e) {}
      templatePath = getTemplateCandidates().find(p => fs.existsSync(p));
    }
    if (!templatePath) {
      throw new Error(`로컬 미러링 폴더(${tenantDirs.driveMirrorDir})에 고소작업대(TL)_월간_Checklist.xlsx 양식 파일이 존재하지 않습니다.`);
    }

    const policy = getTenantPolicy(effectiveCode);
    const tenantName = payload.tenantName || payload.corporateName || policy.tenantName || policy.corporateName || effectiveCode;
    const tenantCorp = payload.corporateName || payload.tenantName || policy.corporateName || tenantName;
    const custName = payload.customerName || '고객사';
    const siteName = payload.siteName || '현장';
    const inspectionDate = payload.inspectionDate || new Date().toISOString().split('T')[0];
    const inspectorName = payload.inspectorName || '김관주';
    const targetMonth = payload.targetMonth || inspectionDate.substring(0, 7);

    const rawAssets = Array.isArray(payload.assets) && payload.assets.length > 0 ? payload.assets : [
      { assetNo: '-', modelName: '-' }
    ];

    const psScript = `\ufeff
$ErrorActionPreference = 'Stop'
$excel = $null
$wb = $null
try {
${PS_INIT_EXCEL_COM_BLOCK}

  function Replace-Tag($targetWs, $tag, $val) {
    $null = $targetWs.Cells.Replace($tag, $val, 2, 1, $false, $false, $false)
  }

  $templateIn = '${templatePath.replace(/\\/g, '\\\\')}'
  $workXlsx = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\월간안전점검_작업용.xlsx'
  $outPdf = '${tempBuildDir.replace(/\\/g, '\\\\')}\\\\월간안전점검.pdf'
  Copy-Item $templateIn $workXlsx -Force
  $wb = $excel.Workbooks.Open($workXlsx)
  $wsBase = $wb.Sheets.Item(1)

  $sheets = @($wsBase)
  for ($idx = 1; $idx -lt ${rawAssets.length}; $idx++) {
    $wsBase.Copy([Type]::Missing, $sheets[$idx - 1])
    $copied = $wb.Sheets.Item($sheets[$idx - 1].Index + 1)
    try { $copied.Name = "점검표_$($idx + 1)" } catch {}
    $sheets += $copied
  }

` + rawAssets.map((ast, idx) => {
  const astModel = psEscape(ast.modelName || '-');
  const astNo = psEscape(ast.assetNo || '-');
  const astInspDate = psEscape(ast.inspectionDate || inspectionDate);
  const astInspName = psEscape(ast.inspectorName || inspectorName);
  const safeSheetTitle = psEscape(`${ast.assetNo || `장비${idx + 1}`}_${ast.modelName || ''}`).replace(/[\\/?*:[\]]/g, '_').slice(0, 28);
  return `
  $curWs = $sheets[${idx}]
  try { $curWs.Name = "${safeSheetTitle}_${idx + 1}" } catch {}
  Replace-Tag $curWs "{고객명}" "${psEscape(custName)}"
  Replace-Tag $curWs "{현장명}" "${psEscape(siteName)}"
  Replace-Tag $curWs "{모델명}" "${astModel}"
  Replace-Tag $curWs "{관리번호}" "${astNo}"
  Replace-Tag $curWs "{자산번호}" "${astNo}"
  Replace-Tag $curWs "{안전점검일}" "${astInspDate}"
  Replace-Tag $curWs "{안전점검일시}" "${astInspDate}"
  Replace-Tag $curWs "{점검일시}" "${astInspDate}"
  Replace-Tag $curWs "{테넌트명}" "${psEscape(tenantCorp)}"
  Replace-Tag $curWs "{테넌트}" "${psEscape(tenantCorp)}"
  Replace-Tag $curWs "{점검자}" "${astInspName}"
  Replace-Tag $curWs "{점점자}" "${astInspName}"
  try {
    $curWs.PageSetup.PaperSize = 9
    $curWs.PageSetup.Orientation = 1
    $curWs.PageSetup.Zoom = $false
    $curWs.PageSetup.FitToPagesWide = 1
    $curWs.PageSetup.FitToPagesTall = 1
  } catch {}
`;
}).join('\n') + `

  $wb.Save()
  $wb.ExportAsFixedFormat(0, $outPdf)
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }
  if ($excel) {
    try { $excel.Quit() } catch {}
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
  }
}
`;

    const outPdfPath = path.join(tempBuildDir, '월간안전점검.pdf');
    const workXlsxPath = path.join(tempBuildDir, '월간안전점검_작업용.xlsx');
    try {
      const psFile = path.join(tempBuildDir, 'build_monthly_chk.ps1');
      fs.writeFileSync(psFile, psScript, 'utf8');

      const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      await runCommandAsync(`"${psExe}" -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { cwd: tempBuildDir });
      if (!fs.existsSync(outPdfPath) || fs.statSync(outPdfPath).size === 0) {
        throw new Error('EXCEL_COM_EMPTY_OUTPUT');
      }
    } catch (excelComErr) {
      agentLog('WARN', `월간안전점검 Excel COM 변환 실패 -> 내장 ExcelJS + Edge Headless 엔진 자동 전환 (${excelComErr.message})`);
      const ExcelJS = require('exceljs');
      const pageHtmls = [];
      let firstWb = null;

      for (let idx = 0; idx < rawAssets.length; idx++) {
        const ast = rawAssets[idx];
        const wbChk = new ExcelJS.Workbook();
        await wbChk.xlsx.readFile(templatePath);
        if (idx === 0) firstWb = wbChk;
        const curWs = wbChk.worksheets[0];

        const astModel = String(ast.modelName || '-');
        const astNo = String(ast.assetNo || '-');
        const astInspDate = String(ast.inspectionDate || inspectionDate);
        const astInspName = String(ast.inspectorName || inspectorName);

        replaceTagInWorksheet(curWs, '{고객명}', custName);
        replaceTagInWorksheet(curWs, '{현장명}', siteName);
        replaceTagInWorksheet(curWs, '{모델명}', astModel);
        replaceTagInWorksheet(curWs, '{관리번호}', astNo);
        replaceTagInWorksheet(curWs, '{자산번호}', astNo);
        replaceTagInWorksheet(curWs, '{안전점검일}', astInspDate);
        replaceTagInWorksheet(curWs, '{안전점검일시}', astInspDate);
        replaceTagInWorksheet(curWs, '{점검일시}', astInspDate);
        replaceTagInWorksheet(curWs, '{테넌트명}', tenantCorp);
        replaceTagInWorksheet(curWs, '{테넌트}', tenantCorp);
        replaceTagInWorksheet(curWs, '{점검자}', astInspName);
        replaceTagInWorksheet(curWs, '{점점자}', astInspName);

        pageHtmls.push(renderExcelWorksheetToHtmlPage(wbChk, curWs, 1, Math.min(44, curWs.rowCount || 44), 1, 10));
      }

      if (firstWb) {
        try { await firstWb.xlsx.writeFile(workXlsxPath); } catch (e) {}
      }
      await convertHtmlPagesToPdfViaEdge(pageHtmls, outPdfPath, tempBuildDir);
    }

    if (!fs.existsSync(outPdfPath)) {
      throw new Error('월간 안전점검 체크리스트 PDF 파일이 생성되지 않았습니다.');
    }

    const safeCustName = String(custName).replace(/[\\/:*?"<>|]/g, '');
    const safeSiteName = String(siteName).replace(/[\\/:*?"<>|]/g, '');
    const cleanTenantPrefix = String(tenantName).replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
    const fileName = `[${cleanTenantPrefix}]_월간안전점검체크리스트_${safeCustName}_${safeSiteName}_${targetMonth}(${rawAssets.length}대).pdf`;
    const xlsxFileName = `[${cleanTenantPrefix}]_월간안전점검체크리스트_${safeCustName}_${safeSiteName}_${targetMonth}(${rawAssets.length}대).xlsx`;

    const archiveDir = path.join(tenantDirs.archiveRoot, targetMonth.substring(0, 7));
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const localSavePath = path.join(archiveDir, fileName);
    const localXlsxSavePath = path.join(archiveDir, xlsxFileName);

    fs.copyFileSync(outPdfPath, localSavePath);
    if (fs.existsSync(workXlsxPath)) {
      fs.copyFileSync(workXlsxPath, localXlsxSavePath);
    }

    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}

    agentLog('JOB', `월간 안전점검 체크리스트 생성 완료: ${localSavePath} (${rawAssets.length}p)`);
    return {
      success: true,
      fileName,
      xlsxFileName,
      pageCount: rawAssets.length,
      localPath: localSavePath,
      xlsxLocalPath: localXlsxSavePath,
      message: `월간 안전점검 체크리스트 생성 완료 (총 ${rawAssets.length}대)`
    };
  } catch (err) {
    try { fs.rmSync(tempBuildDir, { recursive: true, force: true }); } catch (e) {}
    throw err;
  }
}

function processSystemJobQueue() {
  if (isSystemJobWorkerRunning) return;
  // FIFO 순서 보장: 가장 먼저 들어온 PENDING 작업부터 순차 처리
  const nextJob = systemJobQueue.slice().reverse().find(j => j.status === 'PENDING');
  if (!nextJob) return;

  isSystemJobWorkerRunning = true;
  (async () => {
    try {
      nextJob.status = 'RUNNING';
      nextJob.startedAt = new Date().toISOString();
      agentLog('JOB', `[큐 워커 시작] ${nextJob.jobType} (ID: ${nextJob.id})`);

      if (nextJob.jobType === 'SEND_EMAIL') {
        nextJob.result = await executeSendEmailInternal(nextJob.payload);
      } else if (nextJob.jobType === 'CONTRACT_BUNDLE_EMAIL') {
        const { bundleOptions, emailPayload } = nextJob.payload;
        let pdfFilePath = emailPayload?.localPath;
        let pdfFileName = emailPayload?.fileName;
        let pageCount = emailPayload?.pageCount || 0;
        if (!pdfFilePath || !fs.existsSync(pdfFilePath)) {
          const bundleRes = await executeContractBundleInternal(bundleOptions);
          pdfFilePath = bundleRes.localPath;
          pdfFileName = bundleRes.fileName;
          pageCount = bundleRes.pageCount;
        }
        const finalEmailPayload = {
          ...emailPayload,
          attachments: [{ filename: pdfFileName, localPath: pdfFilePath }]
        };
        const mailRes = await executeSendEmailInternal(finalEmailPayload);
        nextJob.result = { ...mailRes, localPath: pdfFilePath, fileName: pdfFileName, pageCount };
      } else if (nextJob.jobType === 'GENERATE_BUNDLE') {
        const bundleRes = await executeContractBundleInternal(nextJob.payload);
        if (nextJob.payload?.openAfterComplete && bundleRes.localPath && fs.existsSync(bundleRes.localPath)) {
          exec(`cmd /c start "" "${bundleRes.localPath}"`, { windowsHide: true });
        }
        nextJob.result = {
          success: true,
          fileName: bundleRes.fileName,
          pageCount: bundleRes.pageCount,
          localPath: bundleRes.localPath
        };
      } else if (nextJob.jobType === 'GENERATE_STATEMENT') {
        const stmtRes = await executeGenerateStatementInternal(nextJob.payload);
        if (nextJob.payload?.openAfterComplete && stmtRes.localPath && fs.existsSync(stmtRes.localPath)) {
          exec(`cmd /c start "" "${stmtRes.localPath}"`, { windowsHide: true });
        }
        nextJob.result = stmtRes;
      } else if (nextJob.jobType === 'GENERATE_MONTHLY_CHECKLIST') {
        const chkRes = await executeMonthlySafetyChecklistInternal(nextJob.payload);
        if (nextJob.payload?.openAfterComplete && chkRes.localPath && fs.existsSync(chkRes.localPath)) {
          exec(`cmd /c start "" "${chkRes.localPath}"`, { windowsHide: true });
        }
        nextJob.result = chkRes;
      }
      nextJob.status = 'COMPLETED';
      nextJob.completedAt = new Date().toISOString();
      agentLog('JOB', `[큐 워커 완료] ${nextJob.jobType} (ID: ${nextJob.id})`);
    } catch (err) {
      nextJob.status = 'FAILED';
      nextJob.error = err.message || String(err);
      nextJob.completedAt = new Date().toISOString();
      agentLog('ERROR', `[큐 워커 실패] ${nextJob.jobType} (ID: ${nextJob.id}): ${nextJob.error}`);
    } finally {
      isSystemJobWorkerRunning = false;
      setTimeout(processSystemJobQueue, 200);
    }
  })();
}

function enqueueSystemJob(jobType, payload) {
  const job = {
    id: `JOB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
    jobType,
    payload,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };
  systemJobQueue.unshift(job);
  if (systemJobQueue.length > 30) systemJobQueue.pop();
  processSystemJobQueue();
  return job;
}

let macAddressesCache = { value: null, expiresAt: 0 };

function getPhysicalMacAddresses() {
  const now = Date.now();
  if (macAddressesCache.value && now < macAddressesCache.expiresAt) {
    return macAddressesCache.value;
  }
  let uniqueMacs = [];
  try {
    const ifaces = os.networkInterfaces();
    const rawMacs = Object.values(ifaces)
      .flat()
      .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac.toUpperCase().replace(/:/g, '-'));
    uniqueMacs = [...new Set(rawMacs)];
  } catch (e) {}
  macAddressesCache = { value: uniqueMacs, expiresAt: now + 60000 };
  return uniqueMacs;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function getMirrorBasenameMap(tenantCode, dirs) {
  const code = getEffectiveTenantCode(tenantCode);
  const now = Date.now();
  const cached = mirrorBasenameIndexCache.get(code);
  if (cached && (now - cached.builtAt) < 15000) {
    return cached.map;
  }
  const map = new Map();
  const scanDir = (dir, skipTenantSubdirs = false) => {
    if (!fs.existsSync(dir)) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'archive') continue;
      if (skipTenantSubdirs && ent.isDirectory() && TENANT_NS_DIR_RE.test(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDir(full, false);
      } else {
        const lower = ent.name.toLowerCase();
        if (!map.has(lower)) map.set(lower, full);
      }
    }
  };
  scanDir(dirs.driveMirrorDir, false);
  if (code === 'GIYEONLIFT') {
    scanDir(BASE_DRIVE_MIRROR_DIR, true);
  }
  mirrorBasenameIndexCache.set(code, { builtAt: now, map });
  return map;
}

const server = http.createServer(async (req, res) => {
  // CORS 및 W3C Private Network Access (PNA) 헤더 전사 허용 (헌장 1.1, 5.2)
  const reqOrigin = req.headers.origin;
  if (reqOrigin) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  const reqHeaders = req.headers['access-control-request-headers'];
  if (reqHeaders) {
    res.setHeader('Access-Control-Allow-Headers', `${reqHeaders}, Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, Cache-Control, Pragma, Access-Control-Request-Private-Network, *`);
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, Cache-Control, Pragma, Access-Control-Request-Private-Network, *');
  }
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url || '';
  const pathname = rawUrl.split('?')[0];
  const queryIndex = rawUrl.indexOf('?');
  const queryString = queryIndex !== -1 ? rawUrl.substring(queryIndex + 1) : '';
  const searchParams = new URLSearchParams(queryString);
  const reqTenantCode = searchParams.get('tenantCode') || '';

  //  eBro AI Agent 지시 스튜디오 및 큐 API 처리
  const isStudioHandled = await handleStudioRequest(req, res, pathname, searchParams, PORT, VERSION, getEffectiveTenantCode(reqTenantCode));
  if (isStudioHandled) {
    if (pathname === '/api/policy/sync') {
      setTimeout(() => {
        const syncedCode = getEffectiveTenantCode(reqTenantCode);
        autoSyncFromCloudflare(syncedCode).catch(() => {});
        checkAndRunScheduledDailyBackup(syncedCode).catch(() => {});
      }, 1000);
    }
    return;
  }

  // 1. 헬스체크 및 동적 콜사인 바인딩 API
  if (req.method === 'GET' && pathname === '/health') {
    const queryCallsign = searchParams.get('callsign');
    if (queryCallsign && queryCallsign.trim()) {
      activeCallsign = queryCallsign.trim();
    }

    const macAddresses = getPhysicalMacAddresses();
    const dirs = getTenantDirs(reqTenantCode);
    sendJson(res, 200, {
      status: 'ONLINE',
      version: VERSION,
      coreHash: CORE_HASH,
      tenantCode: dirs.tenantCode,
      callsign: activeCallsign,
      machineName: MACHINE_NAME,
      macAddresses: macAddresses,
      archiveRoot: dirs.archiveRoot,
      driveMirrorDir: dirs.driveMirrorDir,
      baseArchiveRoot: BASE_ARCHIVE_ROOT,
      baseDriveMirrorDir: BASE_DRIVE_MIRROR_DIR,
      uptimeSeconds: Math.floor(process.uptime()),
      updateState: updateState,
      policy: reqTenantCode ? getTenantPolicy(reqTenantCode) : getAgentPolicy(),
      isAiEnabled: isAiEnabled(),
      timestamp: new Date().toISOString()
    });
    return;
  }

  // 1-1. 로컬 물리 단말기 네트워크 MAC 주소 직접 수집 API
  if (req.method === 'GET' && pathname === '/api/device/physical-mac') {
    try {
      const uniqueMacs = getPhysicalMacAddresses();
      sendJson(res, 200, {
        success: true,
        macAddresses: uniqueMacs,
        hostname: MACHINE_NAME,
        platform: os.platform()
      });
    } catch (e) {
      sendJson(res, 500, { success: false, error: e.message });
    }
    return;
  }

  // 1-2. 에이전트 자가 자동 업데이트 즉시 검사 및 실행 API
  if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/check-update') {
    const isForce = searchParams.get('force') === 'true' || searchParams.get('force') === '1';
    checkAndApplyUpdate(isForce).then((result) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, result, updateState }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message, updateState }));
    });
    return;
  }

  // 1-3. 에이전트 업데이트 진행 상태 조회 API
  if (req.method === 'GET' && pathname === '/api/update-status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, updateState }));
    return;
  }

  // 1-4. 개발자 오류신고 코드 수정 지시 큐 수신 API (/api/dev-error-fix-queue)
  if (req.method === 'POST' && pathname === '/api/dev-error-fix-queue') {
    try {
      const payload = await readJsonBody(req);
      const savedInfo = saveDevErrorFixTaskLocally(payload);
      sendJson(res, 200, { success: true, ...savedInfo });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 2. 에이전트 원클릭 핫 재시작 (Restart) API (/api/restart 및 /restart 별칭 지원)
  if (req.method === 'POST' && (pathname === '/api/restart' || pathname === '/restart')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: '에이전트를 1초 후 자동 재시작합니다.' }));
    setTimeout(() => {
      try {
        // WMI Win32_Process.Create를 통해 부모 Job Object와 완전히 분리된 독립 데몬으로 기동
        const psDetach = `Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList '"${TARGET_EXE_PATH}" --daemon'`;
        execSync(`powershell.exe -NoProfile -WindowStyle Hidden -Command "${psDetach}"`, { stdio: 'ignore', windowsHide: true });
      } catch (e) {
        const child = spawn(TARGET_EXE_PATH, ['--daemon'], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
      }
      process.exit(0);
    }, 400);
    return;
  }

  // 3. 에이전트 원클릭 셧다운 (Shutdown) API
  if (req.method === 'POST' && pathname === '/api/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: '에이전트를 안전하게 종료합니다.' }));
    setTimeout(() => { process.exit(0); }, 500);
    return;
  }

  // 3-2. Cloudflare R2 원본 실시간 강제 재동기화 API
  if (req.method === 'POST' && pathname === '/api/trigger-sync') {
    let payload = {};
    try { payload = await readJsonBody(req); } catch (e) {}
    const targetCode = getEffectiveTenantCode(payload.tenantCode || reqTenantCode);
    try {
      const syncRes = await autoSyncFromCloudflare(targetCode);
      sendJson(res, 200, syncRes || {
        success: true,
        tenantCode: targetCode,
        message: 'Cloudflare R2 실시간 버킷 동기화가 완료되었습니다.'
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 3-2-0. 로컬 미러링 폴더 파일 현황 조회 API (/api/mirror-status) 및 직접 미러링 업로드 API (/api/sync-drive)
  if (req.method === 'GET' && pathname === '/api/mirror-status') {
    try {
      const dirs = getTenantDirs(reqTenantCode);
      const files = [];
      const walkMirror = (dir, prefix = '', skipTenantSubdirs = false) => {
        if (!fs.existsSync(dir)) return;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (ent.name.startsWith('.')) continue;
          if (skipTenantSubdirs && ent.isDirectory() && TENANT_NS_DIR_RE.test(ent.name)) continue;
          const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            walkMirror(full, rel, false);
          } else {
            const st = fs.statSync(full);
            files.push({ name: rel, size: st.size, modifiedTime: st.mtime.toISOString() });
          }
        }
      };
      walkMirror(dirs.driveMirrorDir, '', false);
      if (files.length === 0 && dirs.tenantCode === 'GIYEONLIFT') {
        walkMirror(BASE_DRIVE_MIRROR_DIR, '', true);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, tenantCode: dirs.tenantCode, files, mirrorPath: dirs.driveMirrorDir }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, files: [], error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sync-drive') {
    try {
      const payload = await readJsonBody(req);
      const dirs = getTenantDirs(payload.tenantCode || reqTenantCode);
      const files = Array.isArray(payload.files) ? payload.files : [];
      const syncedFiles = [];
      for (const f of files) {
        if (!f || !f.name) continue;
        const targetPath = path.join(dirs.driveMirrorDir, f.name);
        if (f.name.endsWith('/')) {
          if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
          continue;
        }
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const buf = Buffer.from(f.base64Content || '', 'base64');
        fs.writeFileSync(targetPath, buf);
        syncedFiles.push({ name: f.name, size: buf.length });
      }
      if (syncedFiles.length > 0) invalidateMirrorIndex(dirs.tenantCode);
      sendJson(res, 200, { success: true, tenantCode: dirs.tenantCode, mirrorPath: dirs.driveMirrorDir, syncedCount: syncedFiles.length, syncedFiles });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 3-2-1.  국세청 홈택스 매입세금계산서 로컬 자동 수집 API (/api/hometax/purchase-invoices)
  if (req.method === 'GET' && pathname === '/api/hometax/purchase-invoices') {
    try {
      const dirs = getTenantDirs(reqTenantCode);
      if (!fs.existsSync(dirs.hometaxDir)) {
        fs.mkdirSync(dirs.hometaxDir, { recursive: true });
      }

      const listInvoiceFiles = (dir) => {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
          .filter(f => /\.(xlsx|xls|xml)$/i.test(f))
          .map(f => {
            const filePath = path.join(dir, f);
            const stat = fs.statSync(filePath);
            return { name: f, path: filePath, mtime: stat.mtime.getTime() };
          })
          .sort((a, b) => b.mtime - a.mtime);
      };

      let files = listInvoiceFiles(dirs.hometaxDir);
      if (files.length === 0 && dirs.tenantCode === 'GIYEONLIFT') {
        files = listInvoiceFiles(BASE_HOMETAX_DIR);
      }

      if (files.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          message: `폴더(${dirs.hometaxDir})에 홈택스 엑셀 또는 XML 파일이 존재하지 않습니다. 파일을 해당 폴더에 저장해 주십시오.`,
          items: []
        }));
        return;
      }

      const latestFile = files[0];
      let items = [];

      if (/\.xml$/i.test(latestFile.name)) {
        // XML 파싱
        const content = fs.readFileSync(latestFile.path, 'utf8');
        const getTagVal = (tag) => {
          const m = content.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'));
          return m ? m[1].trim() : '';
        };

        const issueId = getTagVal('IssueID') || getTagVal('TaxInvoiceDocumentId');
        const supplierBizNo = getTagVal('ID').replace(/[^0-9]/g, '');
        const supplierName = getTagVal('NameText');
        const writeDate = (getTagVal('CalculatedDateTime') || getTagVal('IssueDateTime') || '').slice(0, 10);
        const supplyAmt = parseInt(getTagVal('ChargeTotalAmount') || '0', 10);
        const vatAmt = parseInt(getTagVal('TaxTotalAmount') || '0', 10);
        const totalAmt = parseInt(getTagVal('GrandTotalAmount') || String(supplyAmt + vatAmt), 10);

        items.push({
          taxInvoiceNo: issueId || `XML-${Date.now()}`,
          writeDate: writeDate || new Date().toISOString().slice(0, 10),
          supplierBizNo,
          formattedSupplierBizNo: supplierBizNo.length === 10 ? `${supplierBizNo.slice(0,3)}-${supplierBizNo.slice(3,5)}-${supplierBizNo.slice(5)}` : supplierBizNo,
          supplierName: supplierName || '공급자',
          supplyAmount: supplyAmt,
          vatAmount: vatAmt,
          totalAmount: totalAmt,
          itemName: getTagVal('DescriptionText') || undefined
        });
      } else {
        // 엑셀 파싱 시도 (xlsx 모듈 필요 시 동적 require)
        try {
          const XLSX = require('xlsx');
          const workbook = XLSX.readFile(latestFile.path);
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

          let headerIdx = -1;
          let colMap = {};
          for (let r = 0; r < Math.min(rawData.length, 15); r++) {
            const rowStr = (rawData[r] || []).map(c => String(c).trim()).join(' ');
            if (rowStr.includes('승인번호') || rowStr.includes('작성일자') || rowStr.includes('공급자')) {
              headerIdx = r;
              rawData[r].forEach((c, idx) => {
                const s = String(c || '').replace(/\s/g, '');
                if (s.includes('승인번호')) colMap['taxInvoiceNo'] = idx;
                if (s.includes('작성일')) colMap['writeDate'] = idx;
                if (s.includes('등록번호') || s.includes('사업자')) colMap['supplierBizNo'] = idx;
                if (s.includes('상호')) colMap['supplierName'] = idx;
                if (s.includes('공급가')) colMap['supplyAmount'] = idx;
                if (s.includes('세액')) colMap['vatAmount'] = idx;
                if (s.includes('합계')) colMap['totalAmount'] = idx;
              });
              break;
            }
          }

          if (headerIdx !== -1) {
            for (let r = headerIdx + 1; r < rawData.length; r++) {
              const row = rawData[r];
              if (!row) continue;
              const bNo = colMap['supplierBizNo'] !== undefined ? String(row[colMap['supplierBizNo']]).replace(/[^0-9]/g, '') : '';
              const invNo = colMap['taxInvoiceNo'] !== undefined ? String(row[colMap['taxInvoiceNo']]).trim() : '';
              const name = colMap['supplierName'] !== undefined ? String(row[colMap['supplierName']]).trim() : '';
              if (!bNo && !invNo && !name) continue;
              if (name.includes('합계')) continue;

              const sAmt = colMap['supplyAmount'] !== undefined ? (parseFloat(String(row[colMap['supplyAmount']]).replace(/,/g, '')) || 0) : 0;
              const vAmt = colMap['vatAmount'] !== undefined ? (parseFloat(String(row[colMap['vatAmount']]).replace(/,/g, '')) || 0) : 0;
              const tAmt = colMap['totalAmount'] !== undefined ? (parseFloat(String(row[colMap['totalAmount']]).replace(/,/g, '')) || (sAmt + vAmt)) : (sAmt + vAmt);

              items.push({
                taxInvoiceNo: invNo || `EXCEL-${r}`,
                writeDate: colMap['writeDate'] !== undefined ? String(row[colMap['writeDate']]).replace(/[^0-9]/g, '').slice(0, 8) : '',
                supplierBizNo: bNo,
                formattedSupplierBizNo: bNo.length === 10 ? `${bNo.slice(0,3)}-${bNo.slice(3,5)}-${bNo.slice(5)}` : bNo,
                supplierName: name || '공급자',
                supplyAmount: Math.round(sAmt),
                vatAmount: Math.round(vAmt),
                totalAmount: Math.round(tAmt)
              });
            }
          }
        } catch (excelErr) {
          agentLog('WARN', '엑셀 파싱 오류: ' + (excelErr.message || excelErr));
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        fileName: latestFile.name,
        filePath: latestFile.path,
        items
      }));
    } catch (err) {
      agentLog('ERROR', '홈택스 수집 오류: ' + (err.message || err));
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3-2-1-B. 로컬 파일/폴더 즉시 열기 API (/api/open-local-file) 및 엑셀 바이너리 저장 후 열기 (/api/open-excel-binary)
  if (req.method === 'POST' && pathname === '/api/open-local-file') {
    try {
      const payload = await readJsonBody(req);
      let targetPath = payload.filePath || payload.localPath;
      if (!targetPath) {
        sendJson(res, 400, { success: false, error: '열기 대상 파일 경로(filePath)가 지정되지 않았습니다.' });
        return;
      }
      if (!fs.existsSync(targetPath)) {
        const dirs = getTenantDirs(payload.tenantCode || reqTenantCode);
        const relFromBase = path.relative(BASE_ARCHIVE_ROOT, targetPath);
        if (relFromBase && !relFromBase.startsWith('..') && !path.isAbsolute(relFromBase)) {
          const tenantCandidate = path.join(dirs.archiveRoot, relFromBase);
          if (fs.existsSync(tenantCandidate)) {
            targetPath = tenantCandidate;
          }
        }
      }
      if (!fs.existsSync(targetPath)) {
        sendJson(res, 404, { success: false, error: `로컬 파일을 찾을 수 없습니다: ${targetPath}` });
        return;
      }
      if (!payload.skipLaunch) {
        exec(`cmd /c start "" "${targetPath}"`, { windowsHide: true });
      }
      sendJson(res, 200, { success: true, filePath: targetPath });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/open-excel-binary') {
    try {
      const payload = await readJsonBody(req);
      const dirs = getTenantDirs(payload.tenantCode || reqTenantCode);
      const safeName = String(payload.fileName || `문서_${Date.now()}.xlsx`).replace(/[\\/:*?"<>|]/g, '_');
      const yyyyMm = new Date().toISOString().substring(0, 7);
      const archiveDir = path.join(dirs.archiveRoot, yyyyMm);
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const targetPath = path.join(archiveDir, safeName);
      const buf = Buffer.from(payload.fileContent || '', 'base64');
      fs.writeFileSync(targetPath, buf);
      if (!payload.skipLaunch) {
        exec(`cmd /c start "" "${targetPath}"`, { windowsHide: true });
      }
      sendJson(res, 200, { success: true, tenantCode: dirs.tenantCode, filePath: targetPath });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 3-2-1-C. 백그라운드 시스템 작업 큐 등록 및 조회 API (/api/job-queue)
  if (pathname === '/api/job-queue') {
    if (req.method === 'GET') {
      const jobId = searchParams.get('jobId');
      const target = jobId ? systemJobQueue.find(j => j.id === jobId) : null;
      sendJson(res, 200, {
        success: true,
        job: target,
        jobs: systemJobQueue.slice(0, 30).map(j => ({
          id: j.id,
          jobType: j.jobType,
          status: j.status,
          createdAt: j.createdAt,
          completedAt: j.completedAt,
          error: j.error,
          result: j.result
        }))
      });
      return;
    }
    if (req.method === 'POST') {
      try {
        const payload = await readJsonBody(req);
        if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
        const job = enqueueSystemJob(payload.jobType || 'GENERAL', payload);
        sendJson(res, 200, {
          success: true,
          queued: true,
          jobId: job.id,
          status: job.status,
          message: '작업이 로컬 에이전트 큐에 등록되어 백그라운드에서 실행됩니다.'
        });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }
  }

  // 3-2-2. 실시간 SMTP 이메일 발송 API (/api/send-email) — 동기 및 큐(asyncQueue) 지원
  if (req.method === 'POST' && pathname === '/api/send-email') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      if (payload.asyncQueue) {
        const job = enqueueSystemJob('SEND_EMAIL', payload);
        sendJson(res, 200, { success: true, queued: true, jobId: job.id });
        return;
      }
      const info = await executeSendEmailInternal(payload);
      sendJson(res, 200, info);
    } catch (err) {
      agentLog('ERROR', '메일 전송 오류: ' + (err.message || err));
      sendJson(res, 500, { success: false, error: err.message || '이메일 발송에 실패했습니다.' });
    }
    return;
  }

  // 3-3. 정품 엑셀 원본 기반 7종 통합 계약 서류팩 PDF 생성 엔진 (Excel COM + pdf-lib)
  if (req.method === 'POST' && pathname === '/api/generate-contract-bundle') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      if (payload.asyncQueue) {
        const job = enqueueSystemJob('GENERATE_BUNDLE', payload);
        sendJson(res, 200, { success: true, queued: true, jobId: job.id });
        return;
      }
      const bundleRes = await executeContractBundleInternal(payload);
      sendJson(res, 200, bundleRes);
    } catch (bundleErr) {
      agentLog('ERROR', '서류팩 생성 실패: ' + (bundleErr.message || bundleErr));
      sendJson(res, 500, { success: false, error: bundleErr.message });
    }
    return;
  }

  // 3-4. 정품 엑셀 원본 기반 거래명세서 A4 PDF 생성 엔진 (Excel COM & 다중 페이지 자동 분할 — 동기 및 큐(asyncQueue) 지원)
  if (req.method === 'POST' && pathname === '/api/generate-statement') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      if (payload.asyncQueue) {
        const job = enqueueSystemJob('GENERATE_STATEMENT', payload);
        sendJson(res, 200, { success: true, queued: true, jobId: job.id });
        return;
      }
      const stmtRes = await executeGenerateStatementInternal(payload);
      sendJson(res, 200, stmtRes);
    } catch (statementErr) {
      agentLog('ERROR', '거래명세서 생성 실패: ' + (statementErr.message || statementErr));
      sendJson(res, 500, { success: false, error: statementErr.message });
    }
    return;
  }

  // 3-5. 정품 엑셀 원본 기반 월간 안전점검 체크리스트 PDF/XLSX 생성 엔진 (/api/generate-monthly-checklist)
  if (req.method === 'POST' && pathname === '/api/generate-monthly-checklist') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      if (payload.asyncQueue) {
        const job = enqueueSystemJob('GENERATE_MONTHLY_CHECKLIST', payload);
        sendJson(res, 200, { success: true, queued: true, jobId: job.id });
        return;
      }
      const chkRes = await executeMonthlySafetyChecklistInternal(payload);
      sendJson(res, 200, chkRes);
    } catch (chkErr) {
      agentLog('ERROR', '월간 안전점검 체크리스트 생성 실패: ' + (chkErr.message || chkErr));
      sendJson(res, 500, { success: false, error: chkErr.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/get-file') {
    const fileId = searchParams.get('fileId');
    const fileName = searchParams.get('fileName') || (fileId ? `${fileId}.pdf` : '');
    if (!fileId && !fileName) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'fileId or fileName is required' }));
      return;
    }

    (async () => {
      try {
        const effectiveCode = getEffectiveTenantCode(reqTenantCode);
        const dirs = getTenantDirs(effectiveCode);
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
          '.pdf': 'application/pdf',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.xls': 'application/vnd.ms-excel',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.txt': 'text/plain',
          '.json': 'application/json'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // 0순위: fileName이 C:\eBroAgent 하위 절대 경로로 전달된 경우 즉시 반환
        if (path.isAbsolute(fileName) && fs.existsSync(fileName) && fs.statSync(fileName).isFile()) {
          const fileBuf = fs.readFileSync(fileName);
          res.writeHead(200, { 'Content-Type': contentType, 'X-Cache-Source': 'LOCAL_ABSOLUTE' });
          res.end(fileBuf);
          return;
        }

        // 1순위: 테넌트 격리 미러링 폴더(C:\eBroAgent\drive_mirror\<CODE>\) 및 기연 레거시 폴백 확인
        const localFilePath = resolveMirrorReadPath(effectiveCode, fileName);
        if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
          const fileBuf = fs.readFileSync(localFilePath);
          res.writeHead(200, { 'Content-Type': contentType, 'X-Cache-Source': 'LOCAL_MIRROR' });
          res.end(fileBuf);
          return;
        }

        // 2순위: 테넌트 미러 basename 인덱스 캐시 O(1) 조회
        const basenameMap = getMirrorBasenameMap(effectiveCode, dirs);
        const foundPath = basenameMap.get(path.basename(fileName).toLowerCase()) || null;
        if (foundPath && fs.existsSync(foundPath)) {
          const fileBuf = fs.readFileSync(foundPath);
          res.writeHead(200, { 'Content-Type': contentType, 'X-Cache-Source': 'LOCAL_MIRROR_RECURSIVE' });
          res.end(fileBuf);
          return;
        }

        // 3순위: 테넌트 R2 공개 도메인 또는 SigV4 직접 수신 후 테넌트 미러 폴더에 캐싱
        const r2Cfg = await resolveEffectiveR2Config(effectiveCode);
        const cacheTargetPath = path.join(dirs.driveMirrorDir, fileName.replace(/^[\\/]+/, ''));
        const explicitUrl = searchParams.get('url');
        const r2PublicBase = r2Cfg?.publicDomain ? r2Cfg.publicDomain.replace(/\/$/, '') : '';
        const directUrl = explicitUrl || (fileName && r2PublicBase ? `${r2PublicBase}/${fileName.split('/').map(encodeURIComponent).join('/')}` : null);
        if (directUrl && directUrl.startsWith('http')) {
          try {
            const targetDir = path.dirname(cacheTargetPath);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            await downloadFileWithRedirects(directUrl, cacheTargetPath);
            if (fs.existsSync(cacheTargetPath) && fs.statSync(cacheTargetPath).size > 100) {
              invalidateMirrorIndex(effectiveCode);
              const fileBuf = fs.readFileSync(cacheTargetPath);
              res.writeHead(200, { 'Content-Type': contentType, 'X-Cache-Source': 'R2_URL_DOWNLOADED' });
              res.end(fileBuf);
              return;
            }
          } catch (urlErr) {}
        }

        if (r2Cfg && !explicitUrl) {
          try {
            const targetDir = path.dirname(cacheTargetPath);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            await downloadR2ObjectViaSigV4(r2Cfg, fileName.replace(/^[\\/]+/, ''), cacheTargetPath);
            if (fs.existsSync(cacheTargetPath) && fs.statSync(cacheTargetPath).size > 0) {
              invalidateMirrorIndex(effectiveCode);
              const fileBuf = fs.readFileSync(cacheTargetPath);
              res.writeHead(200, { 'Content-Type': contentType, 'X-Cache-Source': 'R2_SIGV4_DOWNLOADED' });
              res.end(fileBuf);
              return;
            }
          } catch (sigErr) {}
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: `파일을 찾을 수 없습니다: ${fileName}` }));
      } catch (err) {
        agentLog('ERROR', '파일 요청 오류: ' + (err.message || err));
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }
  // 4. 계약 서류 팩 무손실 생산 및 로컬 문서고 보관 API
  if (req.method === 'POST' && pathname === '/api/execute-job') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      const dirs = getTenantDirs(payload.tenantCode);
      agentLog('JOB', `작업 수신: ${payload.jobType || 'CONTRACT_BUNDLE'} (테넌트: ${dirs.tenantCode}, 계약: ${payload.contractNo || 'N/A'}, 작업자: ${activeCallsign})`);

      const today = new Date().toISOString().split('T')[0];
      const monthDir = path.join(dirs.archiveRoot, today.substring(0, 7));
      if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

      const policy = getTenantPolicy(dirs.tenantCode);
      const cleanTenantPrefix = String(payload.tenantName || policy.tenantName || policy.corporateName || dirs.tenantCode || 'eBro').replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
      const safeCustName = (payload.customerName || '고객사').replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `[${cleanTenantPrefix}]_${payload.contractNo || '계약'}_${safeCustName}_${today}.pdf`;
      const localSavePath = path.join(monthDir, fileName);

      if (payload.base64Content) {
        const pdfBuffer = Buffer.from(payload.base64Content, 'base64');
        fs.writeFileSync(localSavePath, pdfBuffer);
      }

      sendJson(res, 200, {
        success: true,
        tenantCode: dirs.tenantCode,
        callsign: activeCallsign,
        localFilePath: localSavePath,
        message: ` 로컬 에이전트(${activeCallsign})가 정품 문서를 생산하여 로컬 문서고(${localSavePath})에 안전 보관했습니다.`
      });
    } catch (err) {
      agentLog('ERROR', '작업 처리 실패: ' + (err.message || err));
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 6. 로컬 설치 프린터 목록 조회 API (비동기 Non-blocking)
  if (req.method === 'GET' && pathname === '/api/printers') {
    (async () => {
      try {
        const psCmd = 'Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default | ConvertTo-Json';
        const output = (await runCommandAsync(`powershell -NoProfile -Command "${psCmd}"`)).trim();
        let printerData = [];
        try {
          const parsed = JSON.parse(output || '[]');
          printerData = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          printerData = [];
        }

        const printers = printerData.map(p => p.Name).filter(Boolean);
        const defaultPrinterObj = printerData.find(p => p.Default);
        const defaultPrinter = defaultPrinterObj ? defaultPrinterObj.Name : (printers[0] || '');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          printers,
          defaultPrinter,
          count: printers.length
        }));
      } catch (err) {
        agentLog('ERROR', '프린터 목록 조회 오류: ' + (err.message || err));
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message, printers: [], defaultPrinter: '' }));
      }
    })();
    return;
  }

  // 7. 출고요청서 및 다이렉트 즉시 인쇄 API (/api/print-dispatch, /api/print-direct)
  if (req.method === 'POST' && (pathname === '/api/print-dispatch' || pathname === '/api/print-direct')) {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      const effectiveCode = getEffectiveTenantCode(payload.tenantCode);
      const policy = getTenantPolicy(effectiveCode);
      const stationCfg = loadStationConfigForTenant(effectiveCode) || activeStationConfig;
      const cleanTenantPrefix = String(payload.tenantName || policy.tenantName || 'eBro').replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
      const printerName = payload.printerName || (stationCfg ? stationCfg.localPrinterName : 'Apeos C2060');
      const htmlContent = payload.htmlContent || '';
      const title = payload.title || `${cleanTenantPrefix}_출고요청서`;

      if (!htmlContent) {
        sendJson(res, 400, { success: false, error: 'htmlContent is required' });
        return;
      }

      await sendHtmlToPhysicalPrinter(htmlContent, printerName, title);

      sendJson(res, 200, {
        success: true,
        printer: printerName,
        message: `전용 프린터 [${printerName}] 로 출고요청서가 즉시 전송되었습니다.`
      });
    } catch (err) {
      agentLog('ERROR', '인쇄 요청 오류: ' + (err.message || err));
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 8. 로컬 인쇄 스테이션 설정 조회 API
  if (req.method === 'GET' && pathname === '/api/station-config') {
    const dirs = getTenantDirs(reqTenantCode);
    const cfg = loadStationConfigForTenant(dirs.tenantCode);
    sendJson(res, 200, {
      success: true,
      tenantCode: dirs.tenantCode,
      config: cfg || {
        stationId: '',
        stationName: '',
        localPrinterName: '',
        docTypeDefault: 'ALL',
        machineName: MACHINE_NAME
      }
    });
    return;
  }

  // 9. 로컬 인쇄 스테이션 설정 저장 API
  if (req.method === 'POST' && pathname === '/api/station-config') {
    try {
      const payload = await readJsonBody(req);
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      const dirs = getTenantDirs(payload.tenantCode);
      const savedStationConfig = {
        stationId: payload.stationId || '',
        stationName: payload.stationName || '',
        localPrinterName: payload.localPrinterName || '',
        docTypeDefault: payload.docTypeDefault || 'ALL',
        machineName: payload.machineName || MACHINE_NAME,
        tenantCode: dirs.tenantCode,
        updatedAt: new Date().toISOString()
      };
      if (dirs.tenantCode === 'GIYEONLIFT') {
        activeStationConfig = savedStationConfig;
      }
      if (fs.existsSync(dirs.stationConfigFile)) {
        try { fs.unlinkSync(dirs.stationConfigFile); } catch (e) {}
      }
      fs.writeFileSync(dirs.stationConfigFile, JSON.stringify(savedStationConfig, null, 2), 'utf8');
      stationConfigCache.delete(dirs.stationConfigFile);
      if (process.platform === 'win32') exec(`attrib +h "${dirs.stationConfigFile}"`, { windowsHide: true }, () => {});
      agentLog('SYSTEM', `[${dirs.tenantCode}] 스테이션 설정 저장: ${savedStationConfig.stationName} -> [${savedStationConfig.localPrinterName}]`);

      if (savedStationConfig.stationId) {
        sendStationHeartbeat(dirs.tenantCode).catch(() => {});
        scheduleNextPrintQueueCheck(1000);
      }

      sendJson(res, 200, { success: true, tenantCode: dirs.tenantCode, config: savedStationConfig });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 10. 로컬 DB 백업 현황 및 정책 상태 조회 API (/api/backup/status)
  if (req.method === 'GET' && pathname === '/api/backup/status') {
    try {
      const statusInfo = getLocalBackupStatusInfo(reqTenantCode);
      sendJson(res, 200, { success: true, ...statusInfo });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 11. 로컬 DB 즉시 수동 백업 실행 API (/api/backup/run-now)
  if (req.method === 'POST' && pathname === '/api/backup/run-now') {
    try {
      let payload = {};
      try { payload = await readJsonBody(req); } catch (e) {}
      if (reqTenantCode && !payload.tenantCode) payload.tenantCode = reqTenantCode;
      if (payload && typeof payload === 'object' && Object.keys(payload).length > 0 && typeof updateAgentPolicy === 'function') {
        updateAgentPolicy(payload);
      }
      const targetCode = getEffectiveTenantCode(payload.tenantCode || reqTenantCode);
      const result = await executeLocalDatabaseBackup('MANUAL', targetCode);
      sendJson(res, result.success ? 200 : 500, result);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 12. 로컬 DB 백업 폴더 열기 API (/api/backup/open-folder)
  if (req.method === 'POST' && pathname === '/api/backup/open-folder') {
    try {
      let payload = {};
      try { payload = await readJsonBody(req); } catch (e) {}
      const dirs = getTenantDirs(payload.tenantCode || reqTenantCode);
      const backupDir = dirs.dbBackupDir;
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      if (!payload.skipExplorer) {
        exec(`explorer.exe "${backupDir}"`);
      }
      sendJson(res, 200, { success: true, tenantCode: dirs.tenantCode, folderPath: backupDir });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, request) => {
  handleWebSocketConnection(ws, request);
});

// ── 운영체제 기본 브라우저로 대상 URL 실행 (온디맨드/기동 시) ──
function openDefaultBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const psCmd = `Start-Process '${url}'`;
      exec(`powershell.exe -NoProfile -Command "${psCmd}"`, { windowsHide: true }, (err) => {
        if (err) {
          exec(`start "" "${url}"`, { windowsHide: true });
        }
      });
    } else {
      exec(`xdg-open "${url}"`);
    }
    agentLog('SYSTEM', `기본 브라우저 웹페이지 호출: ${url}`);
  } catch (e) {
    agentLog('WARN', '기본 브라우저 호출 오류: ' + e.message);
  }
}

// ── 포트 선점 프로세스 강제 정리 및 Windows 시스템 트레이 워커 관리 ──
function freePortIfOccupied(port) {
  try {
    const netstatOut = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    const lines = netstatOut.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('듣는 중'))) {
        const parts = line.trim().split(/\s+/);
        const pidStr = parts[parts.length - 1];
        const targetPid = parseInt(pidStr, 10);
        if (targetPid && targetPid !== process.pid && targetPid !== 0 && targetPid !== 4) {
          agentLog('WARN', `포트 ${port} 점유 프로세스(PID: ${targetPid}) 강제 정리`);
          try { process.kill(targetPid, 'SIGKILL'); } catch (k) {
            try { execSync(`taskkill /F /PID ${targetPid}`, { stdio: 'ignore', windowsHide: true }); } catch (t) {}
          }
        }
      }
    }
  } catch (e) {}
}

let activeTrayChild = null;
let hasBootstrappedTray = false;
let isTrayWorkerChecking = false;
let EMBEDDED_TRAY_PS1 = '';
try {
  EMBEDDED_TRAY_PS1 = require('./trayIcon.ps1');
} catch (e) {}

async function startTrayWorker() {
  if (isTrayWorkerChecking) return;
  if (activeTrayChild && activeTrayChild.exitCode === null && !activeTrayChild.killed) {
    return;
  }

  isTrayWorkerChecking = true;
  const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
  const trayScriptInHome = path.join(AGENT_HOME, 'trayIcon.ps1');
  const trayScriptInDir = path.join(__dirname, 'trayIcon.ps1');

  try {
    // 최초 기동 시 구버전/비고정(IsPromoted 미적용) trayIcon.ps1 프로세스가 있으면 1회 정리 후 최신 UTF-8 BOM 스크립트 강제 동기화
    if (!hasBootstrappedTray) {
      hasBootstrappedTray = true;
      try {
        execSync(`"${psExe}" -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne $PID -and $_.CommandLine -notlike '*-Command*' -and $_.CommandLine -like ('*' + 'trayIcon' + '.ps1*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore', windowsHide: true });
      } catch (e) {}

      if (EMBEDDED_TRAY_PS1 && typeof EMBEDDED_TRAY_PS1 === 'string') {
        try {
          if (fs.existsSync(trayScriptInHome)) {
            try { fs.unlinkSync(trayScriptInHome); } catch (e) {}
          }
          const cleanStr = EMBEDDED_TRAY_PS1.replace(/^\uFEFF/, '');
          const bomBuf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(cleanStr, 'utf8')]);
          fs.writeFileSync(trayScriptInHome, bomBuf);
          if (process.platform === 'win32') exec(`attrib +h "${trayScriptInHome}"`, { windowsHide: true }, () => {});
        } catch (wErr) {}
      }
    } else {
      // 이미 실행 중인 trayIcon.ps1 프로세스가 있는지 비동기로 확인 (이벤트 루프 블로킹 방지)
      try {
        const runningTray = (await runCommandAsync(`"${psExe}" -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne $PID -and $_.CommandLine -notlike '*-Command*' -and $_.CommandLine -like ('*' + 'trayIcon' + '.ps1*') }).ProcessId"`)).trim();
        if (runningTray) {
          return;
        }
      } catch (chkErr) {}
    }

    const targetScript = fs.existsSync(trayScriptInHome) ? trayScriptInHome : (fs.existsSync(trayScriptInDir) ? trayScriptInDir : null);
    if (!targetScript) return;

    // 💡 Windows PowerShell 5.1 한글 파싱 오류 방지를 위해 UTF-8 BOM(0xEF,0xBB,0xBF) 강제 보장
    try {
      const rawBuf = fs.readFileSync(targetScript);
      if (rawBuf.length >= 3 && !(rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF)) {
        try { fs.unlinkSync(targetScript); } catch (e) {}
        fs.writeFileSync(targetScript, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), rawBuf]));
        if (process.platform === 'win32') exec(`attrib +h "${targetScript}"`, { windowsHide: true }, () => {});
      }
    } catch (bomErr) {}

    writeAgentStatusSnapshot();
    const ps = spawn(psExe, [
      '-STA',
      '-NoProfile',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', targetScript,
      String(process.pid),
      String(PORT),
      String(VERSION)
    ], {
      windowsHide: true,
      stdio: 'ignore'
    });
    activeTrayChild = ps;
    ps.on('exit', () => {
      if (activeTrayChild === ps) activeTrayChild = null;
    });
    ps.unref();
    agentLog('SYSTEM', `트레이 아이콘 워커 가동 완료 (PID: ${ps.pid})`);
  } catch (e) {
    agentLog('WARN', '트레이 아이콘 워커 실행 오류: ' + e.message);
  } finally {
    isTrayWorkerChecking = false;
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    agentLog('WARN', `포트 ${PORT} 사용 중, 정리 후 재시도`);
    freePortIfOccupied(PORT);
    setTimeout(() => {
      try { server.close(); } catch (e) {}
      server.listen(PORT, '127.0.0.1', () => {
        agentLog('INFO', `로컬 서비스 리스닝: http://127.0.0.1:${PORT}`);
        startTrayWorker();
      });
    }, 1000);
  } else {
    agentLog('ERROR', '서버 에러: ' + (err.message || err));
  }
});

// ── 0. Cloudflare R2 실시간 버킷 동적 스캔 및 자동 미러링 엔진 (Zero-Dependency SigV4, 테넌트별 격리) ──
const SUPABASE_REST_URL = 'https://wywgkikkjgbnlljkkmnz.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5d2draWtramdibmxsamtrbW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjcxMzgsImV4cCI6MjA5OTk0MzEzOH0.gSftxhQjFmWUQzikx-Q5UsdgNKSZISZqJvUGeLBOCqU';
const CENTRAL_SUPABASE_REST_URL = 'https://lkohpffieaanwhohttbu.supabase.co/rest/v1';
const CENTRAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2hwZmZpZWFhbndob2h0dGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODkxOTQsImV4cCI6MjEwODU2NTE5NH0.lOXz6JWfLNcfH4ApH74F7qtlPky8lVwGiAqY_ybSZ6E';

// 기연리프트(유료 운영 테넌트) 전용 기본 R2 설정 (비기연 테넌트에는 절대 폴백 적용 금지)
const GIYEON_DEFAULT_R2 = {
  accountId: '35014a2514680107d74e1e68d96e6c32',
  bucketName: 'giyeon-storage',
  accessKeyId: '03cdb7560d37242de608a5db2a976030',
  secretAccessKey: 'b2407ab4532e02317860bc3d63226fb7bc232e88083b150c15023906ed141986',
  publicDomain: 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev'
};

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest();
}
function hash(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}
function encodeR2KeyPath(objectKey) {
  return String(objectKey || '')
    .replace(/^[\\/]+/, '')
    .split('/')
    .map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

let centralTenantsCache = [];
let centralTenantsCacheAt = 0;

async function fetchCentralTenantsCached(forceRefresh = false) {
  if (!forceRefresh && centralTenantsCache.length > 0 && (Date.now() - centralTenantsCacheAt) < 60 * 1000) {
    return centralTenantsCache;
  }
  try {
    const res = await httpRequestJson(`${CENTRAL_SUPABASE_REST_URL}/core_tenants?select=*`, {
      method: 'GET',
      headers: {
        'apikey': CENTRAL_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CENTRAL_SUPABASE_ANON_KEY}`
      },
      timeout: 6000
    });
    if (res.ok && Array.isArray(res.data)) {
      centralTenantsCache = res.data;
      centralTenantsCacheAt = Date.now();
    }
  } catch (e) {}
  return centralTenantsCache;
}

function findCentralTenantRow(rows, targetCode) {
  const norm = normalizeTenantCode(targetCode);
  return (rows || []).find(row => {
    const candidates = [row.tenantCode, row.tenant_code, row.subdomain, row.id];
    return candidates.some(c => c && normalizeTenantCode(c) === norm);
  }) || null;
}

async function resolveEffectiveR2Config(hint) {
  const code = getEffectiveTenantCode(hint);
  const isGiyeon = code === 'GIYEONLIFT';
  const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(code) || {}) : {};
  const polR2 = (policy.r2Config && typeof policy.r2Config === 'object') ? policy.r2Config : policy;

  const rows = await fetchCentralTenantsCached();
  const row = findCentralTenantRow(rows, code);
  const rowFeatures = (row && row.features && typeof row.features === 'object') ? row.features : {};
  const dbR2 = (rowFeatures.r2Config && typeof rowFeatures.r2Config === 'object') ? rowFeatures.r2Config : {};

  const pickVal = (...vals) => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  let accountId = pickVal(dbR2.r2AccountId, dbR2.accountId, polR2.r2AccountId, polR2.accountId);
  let bucketName = pickVal(dbR2.r2BucketName, dbR2.bucketName, polR2.r2BucketName, polR2.bucketName);
  let accessKeyId = pickVal(dbR2.r2AccessKeyId, dbR2.accessKeyId, polR2.r2AccessKeyId, polR2.accessKeyId);
  const secretRaw = pickVal(dbR2.r2SecretAccessKey, dbR2.secretAccessKey, polR2.r2SecretAccessKey, polR2.secretAccessKey);
  let publicDomain = pickVal(dbR2.r2PublicDomain, dbR2.publicDomain, polR2.r2PublicDomain, polR2.publicDomain);

  let secretAccessKey = secretRaw
    ? (secretRaw.startsWith('__EBRO_ENC__v1__') ? decryptVaultSecret(secretRaw) : secretRaw)
    : '';

  if (isGiyeon) {
    if (!accountId) accountId = GIYEON_DEFAULT_R2.accountId;
    if (!bucketName) bucketName = GIYEON_DEFAULT_R2.bucketName;
    if (!accessKeyId) accessKeyId = GIYEON_DEFAULT_R2.accessKeyId;
    if (!secretAccessKey) secretAccessKey = GIYEON_DEFAULT_R2.secretAccessKey;
    if (!publicDomain) publicDomain = GIYEON_DEFAULT_R2.publicDomain;
  } else {
    // 비(非) 기연 테넌트는 기연리프트 버킷으로 절대 폴백하지 않고 격리
    if (!accountId || !bucketName || !accessKeyId || !secretAccessKey || bucketName === 'giyeon-storage') {
      return null;
    }
  }

  return {
    tenantCode: code,
    accountId,
    bucketName,
    accessKeyId,
    secretAccessKey,
    publicDomain: publicDomain ? publicDomain.replace(/\/+$/, '') : ''
  };
}

async function resolveTenantSupabaseConfig(hint) {
  const code = getEffectiveTenantCode(hint);
  if (code === 'GIYEONLIFT') {
    return {
      tenantCode: 'GIYEONLIFT',
      tenantId: 'giyeun',
      solutionType: 'AWP',
      restUrl: SUPABASE_REST_URL,
      anonKey: SUPABASE_ANON_KEY,
      prefix: 'awp_'
    };
  }
  const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(code) || {}) : {};
  const rows = await fetchCentralTenantsCached();
  const row = findCentralTenantRow(rows, code);
  const solutionType = String(
    (row && (row.solutionType || row.solution_type)) ||
    policy.solutionType ||
    (code.includes('FL') ? 'FL' : code.includes('IT') ? 'IT' : 'AWP')
  ).toUpperCase();
  const prefix = solutionType === 'FL' ? 'fl_' : solutionType === 'IT' ? 'it_' : 'awp_';
  return {
    tenantCode: code,
    tenantId: (row && row.id) || policy.tenantId || code.toLowerCase(),
    solutionType,
    restUrl: CENTRAL_SUPABASE_REST_URL,
    anonKey: CENTRAL_SUPABASE_ANON_KEY,
    prefix
  };
}

function getConfiguredTenantCodes() {
  const codes = new Set(['GIYEONLIFT']);
  const pol = typeof getAgentPolicy === 'function' ? (getAgentPolicy() || {}) : {};
  if (pol.tenantCode) codes.add(normalizeTenantCode(pol.tenantCode));
  if (pol.tenants && typeof pol.tenants === 'object') {
    for (const k of Object.keys(pol.tenants)) {
      codes.add(normalizeTenantCode(k));
    }
  }
  return Array.from(codes);
}

function buildR2SignedRequestOptions(r2Cfg, method, canonicalUri, canonicalQuery = '') {
  const host = `${r2Cfg.accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  const payloadHash = hash('');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

  const kDate = hmac('AWS4' + r2Cfg.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${r2Cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    agent: SHARED_HTTPS_AGENT,
    hostname: host,
    port: 443,
    path: canonicalQuery ? `${canonicalUri}?${canonicalQuery}` : canonicalUri,
    method,
    headers: {
      'Host': host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authHeader
    }
  };
}

async function fetchR2BucketAllObjects(r2Cfg) {
  if (!r2Cfg || !r2Cfg.accountId || !r2Cfg.bucketName || !r2Cfg.accessKeyId || !r2Cfg.secretAccessKey) {
    return [];
  }
  let isTruncated = true;
  let nextContinuationToken = null;
  const allObjects = [];

  while (isTruncated) {
    const canonicalUri = '/' + r2Cfg.bucketName;
    let canonicalQuery = '';
    if (nextContinuationToken) {
      canonicalQuery = `continuation-token=${encodeURIComponent(nextContinuationToken)}&list-type=2`;
    } else {
      canonicalQuery = 'list-type=2';
    }
    const reqOpts = buildR2SignedRequestOptions(r2Cfg, 'GET', canonicalUri, canonicalQuery);

    const xmlData = await new Promise((resolve, reject) => {
      const req = https.request(reqOpts, res => {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const d = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 200) resolve(d);
          else reject(new Error('HTTP ' + res.statusCode + ': ' + d));
        });
      });
      req.setTimeout(15000, () => req.destroy(new Error('R2 ListObjectsV2 시간 초과')));
      req.on('error', reject);
      req.end();
    });

    const isTruncatedMatch = /<IsTruncated>(true|false)<\/IsTruncated>/.exec(xmlData);
    isTruncated = isTruncatedMatch ? isTruncatedMatch[1] === 'true' : false;

    const tokenMatch = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xmlData);
    nextContinuationToken = tokenMatch ? tokenMatch[1] : null;

    const contentBlockRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let blockMatch;
    while ((blockMatch = contentBlockRegex.exec(xmlData)) !== null) {
      const block = blockMatch[1];
      const keyMatch = /<Key>([^<]+)<\/Key>/.exec(block);
      const sizeMatch = /<Size>(\d+)<\/Size>/.exec(block);
      const etagMatch = /<ETag>([^<]+)<\/ETag>/.exec(block);
      const lastModMatch = /<LastModified>([^<]+)<\/LastModified>/.exec(block);
      if (!keyMatch || !sizeMatch) continue;

      const key = keyMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      const size = parseInt(sizeMatch[1], 10);
      const etag = etagMatch ? etagMatch[1].replace(/&quot;|"/g, '').trim().toLowerCase() : '';
      const lastModified = lastModMatch ? lastModMatch[1].trim() : '';
      const isDirectory = key.endsWith('/');
      allObjects.push({ key, size, etag, lastModified, isDirectory });
    }
  }

  return allObjects;
}

async function downloadR2ObjectViaSigV4(r2Cfg, objectKey, destPath) {
  if (!r2Cfg || !r2Cfg.accountId || !r2Cfg.bucketName || !r2Cfg.accessKeyId || !r2Cfg.secretAccessKey) {
    throw new Error('R2 SigV4 인증 정보가 설정되어 있지 않습니다.');
  }
  const canonicalUri = `/${r2Cfg.bucketName}/${encodeR2KeyPath(objectKey)}`;
  const reqOpts = buildR2SignedRequestOptions(r2Cfg, 'GET', canonicalUri, '');

  return await new Promise((resolve, reject) => {
    const req = https.request(reqOpts, res => {
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          reject(new Error(`R2 SigV4 HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`));
        });
        return;
      }
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close(() => resolve(destPath));
      });
      ws.on('error', (err) => {
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('R2 SigV4 다운로드 시간 초과')));
    req.on('error', reject);
    req.end();
  });
}

const fileMd5Cache = new Map();

function computeFileMd5Async(filePath) {
  return new Promise((resolve) => {
    try {
      const hashSum = crypto.createHash('md5');
      const rs = fs.createReadStream(filePath);
      rs.on('data', chunk => hashSum.update(chunk));
      rs.on('end', () => resolve(hashSum.digest('hex').toLowerCase()));
      rs.on('error', () => resolve(''));
    } catch (e) {
      resolve('');
    }
  });
}

async function computeFileMd5CachedAsync(filePath, statObj) {
  const size = statObj ? statObj.size : -1;
  const mtimeMs = statObj ? Math.floor(statObj.mtimeMs) : -1;
  const cached = fileMd5Cache.get(filePath);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs && size >= 0) {
    return cached.md5;
  }
  const md5 = await computeFileMd5Async(filePath);
  if (md5 && size >= 0) {
    if (fileMd5Cache.size >= 5000) {
      const firstKey = fileMd5Cache.keys().next().value;
      if (firstKey !== undefined) fileMd5Cache.delete(firstKey);
    }
    fileMd5Cache.set(filePath, { size, mtimeMs, md5 });
  }
  return md5;
}

const r2SyncRunningByTenant = new Set();

async function autoSyncFromCloudflare(targetHint) {
  const code = getEffectiveTenantCode(targetHint);
  if (r2SyncRunningByTenant.has(code)) {
    return { success: true, configured: true, tenantCode: code, message: `[${code}] Cloudflare R2 동기화가 이미 진행 중입니다.` };
  }
  r2SyncRunningByTenant.add(code);
  try {
    const r2Cfg = await resolveEffectiveR2Config(code);
    if (!r2Cfg) {
      agentLog('SYNC', `[${code}] R2 버킷 미설정 상태 — 동기화 건너뜀`);
      return {
        success: true,
        configured: false,
        tenantCode: code,
        downloaded: 0,
        skipped: 0,
        foldersCreated: 0,
        totalFiles: 0,
        message: `[${code}] R2 버킷이 설정되지 않았습니다.`
      };
    }

    const dirs = getTenantDirs(code);
    agentLog('SYNC', `[${code}] Cloudflare R2 버킷(${r2Cfg.bucketName}) 동기화 시작 -> ${dirs.driveMirrorDir}`);
    const objects = await fetchR2BucketAllObjects(r2Cfg);
    const fileCount = objects.filter(o => !o.isDirectory).length;
    const folderCount = objects.filter(o => o.isDirectory).length;
    agentLog('SYNC', `[${code}] 파일 목록 확인: 파일 ${fileCount}개, 폴더 ${folderCount}개`);
    let downloaded = 0;
    let skipped = 0;
    let foldersCreated = 0;

    for (const obj of objects) {
      const safeRelKey = String(obj.key || '').replace(/^([\\/]+|\.\.[\\/])+/g, '');
      if (!safeRelKey) continue;

      if (obj.isDirectory) {
        const targetDir = path.join(dirs.driveMirrorDir, safeRelKey);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
          agentLog('SYNC', `[${code}] 빈 폴더 생성: ${safeRelKey}`);
          foldersCreated++;
        }
        continue;
      }

      const targetFile = path.join(dirs.driveMirrorDir, safeRelKey);
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      if (fs.existsSync(targetFile)) {
        const st = fs.statSync(targetFile);
        if (st.isDirectory()) {
          fs.rmSync(targetFile, { recursive: true, force: true });
        } else if (st.size === obj.size && st.size > 0) {
          let isSameContent = true;
          if (obj.etag && !obj.etag.includes('-')) {
            const localMd5 = await computeFileMd5CachedAsync(targetFile, st);
            if (localMd5 && localMd5 !== obj.etag) {
              isSameContent = false;
              agentLog('SYNC', `[${code}] 파일 내용 변경 감지 (MD5 불일치): ${safeRelKey}`);
            }
          } else if (obj.lastModified) {
            const remoteTime = new Date(obj.lastModified).getTime();
            if (!isNaN(remoteTime) && Math.abs(remoteTime - st.mtimeMs) > 2000 && remoteTime > st.mtimeMs) {
              isSameContent = false;
              agentLog('SYNC', `[${code}] 원본 최신 수정 시각 감지: ${safeRelKey}`);
            }
          }
          if (isSameContent) {
            skipped++;
            continue;
          }
        }
      }

      const tempFile = `${targetFile}.download`;
      try {
        let downloadedOk = false;
        if (r2Cfg.publicDomain) {
          try {
            const encKey = obj.key.split('/').map(encodeURIComponent).join('/');
            const cacheBustVer = encodeURIComponent(obj.etag || obj.lastModified || Date.now());
            const dlUrl = `${r2Cfg.publicDomain}/${encKey}?v=${cacheBustVer}`;
            await downloadFileWithRedirects(dlUrl, tempFile);
            if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
              downloadedOk = true;
            }
          } catch (pubErr) {}
        }
        if (!downloadedOk) {
          await downloadR2ObjectViaSigV4(r2Cfg, obj.key, tempFile);
        }

        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
          fs.copyFileSync(tempFile, targetFile);
          try { fs.unlinkSync(tempFile); } catch (e) {}
          if (obj.lastModified) {
            const remoteDate = new Date(obj.lastModified);
            if (!isNaN(remoteDate.getTime())) {
              try { fs.utimesSync(targetFile, remoteDate, remoteDate); } catch (uErr) {}
            }
          }
          fileMd5Cache.delete(targetFile);
          invalidateMirrorIndex(code);
          downloaded++;
          agentLog('SYNC', `[${code}] 파일 동기화 완료: ${safeRelKey}`);
        } else {
          try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
        }
      } catch (dlErr) {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
        agentLog('ERROR', `[${code}] 다운로드 실패: ${safeRelKey} (${dlErr.message})`);
      }
    }

    if (downloaded > 0 || foldersCreated > 0) {
      agentLog('SYNC', `[${code}] 동기화 완료: 갱신 ${downloaded}개, 생성 ${foldersCreated}개, 최신 ${skipped}개`);
    } else {
      agentLog('SYNC', `[${code}] 동기화 완료: 모든 파일(${fileCount}개) 최신 상태 유지`);
    }

    return {
      success: true,
      configured: true,
      tenantCode: code,
      bucketName: r2Cfg.bucketName,
      downloaded,
      skipped,
      foldersCreated,
      totalFiles: fileCount,
      message: `[${code}] Cloudflare R2 동기화 완료 (갱신: ${downloaded}개, 최신 유지: ${skipped}개)`
    };
  } catch (err) {
    agentLog('ERROR', `[${code}] CF R2 버킷 조회 오류: ` + err.message);
    return {
      success: false,
      configured: true,
      tenantCode: code,
      error: err.message,
      message: `[${code}] Cloudflare R2 버킷 스캔 오류: ${err.message}`
    };
  } finally {
    r2SyncRunningByTenant.delete(code);
  }
}

// =========================================================================
//  [분산 원격 인쇄 큐 워커 엔진 (Headless Distributed Queue Worker)]
// =========================================================================
let isQueueProcessing = false;
let printQueuePollTimer = null;

function scheduleNextPrintQueueCheck(delayMs) {
  if (printQueuePollTimer) clearTimeout(printQueuePollTimer);
  printQueuePollTimer = setTimeout(runPrintQueueLoop, delayMs);
}

async function runPrintQueueLoop() {
  let delay = 3000;
  try {
    const processed = await checkAndProcessPrintQueue();
    delay = processed ? 1000 : 3000;
  } catch (e) {
    agentLog('ERROR', '인쇄 큐 루프 오류: ' + (e.stack || e.message || e));
    delay = 10000;
  }
  scheduleNextPrintQueueCheck(delay);
}

async function checkAndProcessPrintQueue() {
  if (isQueueProcessing) return false;

  if (!activeStationConfig && fs.existsSync(STATION_CONFIG_FILE)) {
    try {
      activeStationConfig = JSON.parse(fs.readFileSync(STATION_CONFIG_FILE, 'utf8'));
    } catch (e) {}
  }

  const targets = [];
  for (const code of getConfiguredTenantCodes()) {
    const stCfg = code === 'GIYEONLIFT'
      ? (loadStationConfigForTenant('GIYEONLIFT') || activeStationConfig)
      : loadStationConfigForTenant(code);
    if (stCfg && stCfg.stationId && stCfg.localPrinterName) {
      targets.push({ code, stCfg });
    }
  }
  if (targets.length === 0) {
    return false;
  }

  isQueueProcessing = true;
  let activeJob = null;
  let activeSbCfg = null;
  let activeCode = '';
  try {
    for (const target of targets) {
      activeCode = target.code;
      const stationCfg = target.stCfg;
      const sbCfg = await resolveTenantSupabaseConfig(target.code);
      const printQueueTable = `${sbCfg.prefix}print_queue`;
      const stationId = encodeURIComponent(stationCfg.stationId);
      const queryUrl = `${sbCfg.restUrl}/${printQueueTable}?stationId=eq.${stationId}&status=eq.PENDING&order=requestedAt.asc&limit=1`;

      const res = await httpRequestJson(queryUrl, {
        method: 'GET',
        headers: {
          'apikey': sbCfg.anonKey,
          'Authorization': `Bearer ${sbCfg.anonKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
        continue;
      }

      const job = res.data[0];
      activeJob = job;
      activeSbCfg = sbCfg;
      agentLog('PRINT', `[${target.code}] 원격 인쇄 작업 수신: [${job.id}] ${job.title}`);

      try {
        await httpRequestJson(`${sbCfg.restUrl}/${printQueueTable}?id=eq.${encodeURIComponent(job.id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': sbCfg.anonKey,
            'Authorization': `Bearer ${sbCfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          timeout: 4000
        }, { status: 'PRINTING', updatedAt: new Date().toISOString() });
      } catch (lockErr) {}

      const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(target.code) || {}) : {};
      const cleanTenantPrefix = String(policy.tenantName || 'eBro').replace(/^\(주\)|주식회사/g, '').trim() || 'eBro';
      const printerName = stationCfg.localPrinterName || 'Apeos C2060';
      const title = job.title || `${cleanTenantPrefix}_출력물`;

      agentLog('PRINT', `[${target.code}] 원격 인쇄 작업 처리 시작: 프린터 [${printerName}], 작업: ${job.id}`);
      await sendHtmlToPhysicalPrinter(job.documentHtml, printerName, title);

      await httpRequestJson(`${sbCfg.restUrl}/${printQueueTable}?id=eq.${encodeURIComponent(job.id)}`, {
        method: 'PATCH',
        headers: {
          'apikey': sbCfg.anonKey,
          'Authorization': `Bearer ${sbCfg.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        timeout: 4000
      }, {
        status: 'COMPLETED',
        printedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      agentLog('PRINT', `[${target.code}] 인쇄 완료 보고 완료: 작업 ${job.id}`);
      return true;
    }
    return false;
  } catch (printErr) {
    if (activeJob && activeSbCfg) {
      agentLog('ERROR', `[${activeCode}] 원격 인쇄 작업 [${activeJob.id}] 실패: ${printErr.message || printErr}`);
      try {
        await httpRequestJson(`${activeSbCfg.restUrl}/${activeSbCfg.prefix}print_queue?id=eq.${encodeURIComponent(activeJob.id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': activeSbCfg.anonKey,
            'Authorization': `Bearer ${activeSbCfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          timeout: 4000
        }, {
          status: 'FAILED',
          errorMessage: String(printErr.message || printErr),
          updatedAt: new Date().toISOString()
        });
      } catch (e) {}
    } else {
      agentLog('ERROR', `인쇄 큐 조회 실패: ${printErr.message || printErr}`);
    }
    return false;
  } finally {
    isQueueProcessing = false;
  }
}

async function sendAgentHeartbeat(hint) {
  try {
    const code = getEffectiveTenantCode(hint);
    const sbCfg = await resolveTenantSupabaseConfig(code);
    const pcName = os.hostname();
    const deviceId = `DEV-${pcName}`;
    const id = `HEARTBEAT-${sbCfg.tenantId}-${deviceId}`;

    const netInterfaces = os.networkInterfaces();
    let ipAddress = '127.0.0.1';
    for (const dev of Object.keys(netInterfaces)) {
      for (const details of netInterfaces[dev]) {
        if (details.family === 'IPv4' && !details.internal) {
          ipAddress = details.address;
          break;
        }
      }
    }

    const payload = {
      id: id,
      tenant_id: sbCfg.tenantId,
      device_id: deviceId,
      pc_name: pcName,
      user_id: activeCallsign || CALLSIGN,
      user_name: '사용자',
      ip_address: ipAddress,
      engine_version: VERSION,
      status: 'ONLINE',
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await httpRequestJson(`${sbCfg.restUrl}/${sbCfg.prefix}agent_heartbeats`, {
      method: 'POST',
      headers: {
        'apikey': sbCfg.anonKey,
        'Authorization': `Bearer ${sbCfg.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      timeout: 4000
    }, payload);
  } catch (e) {}
}

async function sendStationHeartbeat(hint) {
  const code = getEffectiveTenantCode(hint);
  const stationCfg = loadStationConfigForTenant(code) || (code === 'GIYEONLIFT' ? activeStationConfig : null);
  if (!stationCfg || !stationCfg.stationId) return;
  try {
    const sbCfg = await resolveTenantSupabaseConfig(code);
    const stationId = encodeURIComponent(stationCfg.stationId);
    await httpRequestJson(`${sbCfg.restUrl}/${sbCfg.prefix}print_stations?id=eq.${stationId}`, {
      method: 'PATCH',
      headers: {
        'apikey': sbCfg.anonKey,
        'Authorization': `Bearer ${sbCfg.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      timeout: 4000
    }, {
      status: 'ONLINE',
      lastHeartbeat: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (e) {}
}

// =========================================================================
// 🛡️ [권한 기반 로컬 DB 매일 09:00 자동 백업 엔진 (Local DB Auto-Backup Engine, 테넌트별 격리)]
// - 권한이 부여된 임직원 PC에서만 매일 09:00 자동 백업 실행 (C:\eBroAgent\문서고\<CODE>\DB백업)
// =========================================================================
const CENTRAL_BACKUP_TABLES = new Set([
  'tenants',
  'equipment_manuals',
  'system_manuals',
  'manual_annotations',
  'apk_releases'
]);

const BACKUP_AWP_TABLES = [
  'tenants',
  'departments',
  'users',
  'permissions',
  'custom_roles',
  'role_permissions',
  'annual_leave_quotas',
  'leave_usages',
  'overtime_records',
  'payroll_closings',
  'vendors',
  'customers',
  'customer_contacts',
  'customer_sites',
  'site_masters',
  'products',
  'assets',
  'consumables',
  'consumable_purchases',
  'mechanic_consumable_stocks',
  'transport_companies',
  'transport_drivers',
  'contracts',
  'contract_assets',
  'external_leases',
  'contract_history',
  'deliveries',
  'outbound_inspections',
  'asset_inout_logs',
  'inspection_checklist_items',
  'repairs',
  'repair_consumables',
  'consumable_logs',
  'standard_options',
  'billings',
  'billing_details',
  'billing_invoices',
  'receivables',
  'payments',
  'bank_transactions',
  'payment_deposit_links',
  'bank_matching_rules',
  'bank_initial_balances',
  'purchase_settlements',
  'purchase_settlement_items',
  'settlement_payment_logs',
  'cash_flow_snapshots',
  'prepaid_transactions',
  'delinquency_action_logs',
  'legal_notice_logs',
  'legal_notice_templates',
  'depreciation_logs',
  'todos',
  'corporate_vehicles',
  'vehicle_operation_logs',
  'vehicle_fuel_logs',
  'equipment_manuals',
  'system_manuals',
  'manual_annotations',
  'apk_releases',
  'print_stations',
  'print_queue',
  'privacy_access_logs',
  'stocktaking_audits',
  'stocktaking_audit_items',
  'collected_parts',
  'approval_tier_configs',
  'approval_rules',
  'approval_requests',
  'approval_steps',
  'rule_consensus',
  'user_work_status',
  'walkie_channels',
  'call_uploads',
  'call_pipeline_logs',
  'draft_dispatch_orders'
];

const BACKUP_FL_TABLES = [
  'tenants',
  'departments',
  'users',
  'user_permissions',
  'approval_policies',
  'approval_requests',
  'document_templates',
  'partners',
  'partner_sites',
  'item_masters',
  'catalog_packages',
  'exchange_rates',
  'purchases',
  'purchase_lines',
  'logistics_dispatches',
  'ap_payables',
  'inventory_units',
  'stock_movements',
  'quotations',
  'contracts',
  'contract_lines',
  'fulfillments',
  'trade_aftercare_cases',
  'rental_maintenances',
  'asset_events',
  'billings',
  'collections',
  'bank_transactions',
  'finance_leases',
  'finance_lease_schedules',
  'hr_histories',
  'equipment_manuals',
  'system_manuals',
  'manual_annotations',
  'apk_releases'
];

const localBackupRunningByTenant = new Set();
const lastBackupErrorByTenant = new Map();

function getLocalDateYmd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLocalTimeHm(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

function getLocalBackupStatusInfo(hint) {
  const code = getEffectiveTenantCode(hint);
  const dirs = getTenantDirs(code);
  const dbBackupDir = dirs.dbBackupDir;
  try {
    if (!fs.existsSync(dbBackupDir)) {
      fs.mkdirSync(dbBackupDir, { recursive: true });
    }
  } catch (e) {}

  const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(code) || {}) : {};
  const todayYmd = getLocalDateYmd();
  const todayFileName = `eBro_DB_Backup_${todayYmd}.json`;
  const todayFilePath = path.join(dbBackupDir, todayFileName);
  const hasTodayBackup = fs.existsSync(todayFilePath) && fs.statSync(todayFilePath).size > 100;

  let backupFiles = [];
  try {
    if (fs.existsSync(dbBackupDir)) {
      backupFiles = fs.readdirSync(dbBackupDir)
        .filter(f => f.endsWith('.json') && f.startsWith('eBro_DB_Backup_'))
        .map(f => {
          const full = path.join(dbBackupDir, f);
          const st = fs.statSync(full);
          return {
            fileName: f,
            filePath: full,
            sizeBytes: st.size,
            modifiedAt: st.mtime.toISOString()
          };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    }
  } catch (e) {}

  return {
    tenantCode: code,
    autoBackupEnabled: Boolean(policy.autoBackupEnabled),
    autoBackupTime: policy.autoBackupTime || '09:00',
    autoBackupRetentionDays: Number(policy.autoBackupRetentionDays) || 30,
    backupUserId: policy.backupUserId || '',
    backupUserName: policy.backupUserName || '',
    lastAutoBackupAt: policy.lastAutoBackupAt || (backupFiles[0]?.modifiedAt || null),
    hasTodayBackup,
    isRunning: localBackupRunningByTenant.has(code),
    lastError: lastBackupErrorByTenant.get(code) || null,
    backupDir: dbBackupDir,
    backupCount: backupFiles.length,
    recentBackups: backupFiles.slice(0, 10)
  };
}

async function fetchAllRowsFromSupabaseTable(table, sbCfg) {
  const effSb = sbCfg || { restUrl: SUPABASE_REST_URL, anonKey: SUPABASE_ANON_KEY, prefix: 'awp_' };
  const isCentral = CENTRAL_BACKUP_TABLES.has(table);
  const baseUrl = isCentral ? CENTRAL_SUPABASE_REST_URL : effSb.restUrl;
  const apiKey = isCentral ? CENTRAL_SUPABASE_ANON_KEY : effSb.anonKey;
  const pfx = effSb.prefix || 'awp_';

  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const remoteTable = isCentral
      ? (table.startsWith('core_') ? table : 'core_' + table)
      : (table.startsWith(pfx) ? table : pfx + table);
    const res = await httpRequestJson(`${baseUrl}/${remoteTable}?select=*`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Range-Unit': 'items',
        'Range': `${from}-${to}`
      },
      timeout: 15000
    });

    if (!res.ok) {
      break;
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    if (rows.length > 0) {
      allRows = allRows.concat(rows);
      from += pageSize;
      if (rows.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

async function runWithConcurrency(items, limit, worker) {
  const arr = Array.isArray(items) ? items : [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length || 1) }, async () => {
    while (idx < arr.length) {
      const myIdx = idx++;
      await worker(arr[myIdx], myIdx);
    }
  });
  await Promise.all(workers);
}

async function executeLocalDatabaseBackup(triggerType = 'SCHEDULED_0900', hint) {
  const code = getEffectiveTenantCode(hint);
  if (localBackupRunningByTenant.has(code)) {
    return { success: false, tenantCode: code, message: `[${code}] 현재 로컬 DB 백업이 이미 진행 중입니다.` };
  }

  localBackupRunningByTenant.add(code);
  lastBackupErrorByTenant.set(code, null);
  const startTime = Date.now();

  try {
    const dirs = getTenantDirs(code);
    const dbBackupDir = dirs.dbBackupDir;
    if (!fs.existsSync(dbBackupDir)) {
      fs.mkdirSync(dbBackupDir, { recursive: true });
    }

    const sbCfg = await resolveTenantSupabaseConfig(code);
    const tablesToBackup = sbCfg.solutionType === 'FL' ? BACKUP_FL_TABLES : BACKUP_AWP_TABLES;
    const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(code) || {}) : {};
    const todayYmd = getLocalDateYmd();
    const nowIso = new Date().toISOString();
    agentLog('BACKUP', `[${code}] 로컬 DB 전체 백업 시작 (사유: ${triggerType}, 담당자: ${policy.backupUserName || activeCallsign || '지정담당자'})`);

    const backupData = {};
    let totalRowsCount = 0;
    let successTableCount = 0;

    await runWithConcurrency(tablesToBackup, 4, async (table) => {
      try {
        const rows = await fetchAllRowsFromSupabaseTable(table, sbCfg);
        backupData[table] = rows;
        totalRowsCount += rows.length;
        successTableCount++;
      } catch (tblErr) {
        backupData[table] = [];
      }
    });

    const fileName = `eBro_DB_Backup_${todayYmd}.json`;
    const targetFilePath = path.join(dbBackupDir, fileName);
    const tempFilePath = `${targetFilePath}.tmp`;

    fs.writeFileSync(tempFilePath, JSON.stringify(backupData, null, 2), 'utf8');
    if (fs.existsSync(targetFilePath)) {
      try { fs.unlinkSync(targetFilePath); } catch (e) {}
    }
    fs.renameSync(tempFilePath, targetFilePath);

    const retentionDays = Math.max(7, Number(policy.autoBackupRetentionDays) || 30);
    const cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    let prunedCount = 0;
    try {
      const files = fs.readdirSync(dbBackupDir);
      for (const f of files) {
        if (!f.startsWith('eBro_DB_Backup_') || !f.endsWith('.json')) continue;
        const full = path.join(dbBackupDir, f);
        const st = fs.statSync(full);
        if (st.mtimeMs < cutoffMs) {
          fs.unlinkSync(full);
          prunedCount++;
        }
      }
    } catch (pruneErr) {}

    if (typeof updateAgentPolicy === 'function') {
      updateAgentPolicy({ tenantCode: code, lastAutoBackupAt: nowIso });
    }

    const targetUserId = policy.backupUserId;
    if (targetUserId) {
      try {
        await httpRequestJson(`${sbCfg.restUrl}/${sbCfg.prefix}users?id=eq.${encodeURIComponent(targetUserId)}`, {
          method: 'PATCH',
          headers: {
            'apikey': sbCfg.anonKey,
            'Authorization': `Bearer ${sbCfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          timeout: 5000
        }, {
          lastAutoBackupAt: nowIso,
          updatedAt: nowIso
        });
      } catch (uErr) {}
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const fileSizeMb = (fs.statSync(targetFilePath).size / (1024 * 1024)).toFixed(2);
    agentLog('BACKUP', `[${code}] 로컬 DB 전체 백업 완료: ${targetFilePath} (테이블 ${successTableCount}개, 레코드 ${totalRowsCount.toLocaleString()}건, 용량 ${fileSizeMb}MB, 소요 ${elapsedSec}초)`);

    return {
      success: true,
      tenantCode: code,
      fileName,
      filePath: targetFilePath,
      tableCount: successTableCount,
      totalRowsCount,
      fileSizeMb: Number(fileSizeMb),
      prunedCount,
      completedAt: nowIso,
      message: `[${code}] 로컬 DB 백업 완료 (${fileName}, 총 ${totalRowsCount.toLocaleString()}건, ${fileSizeMb}MB)`
    };
  } catch (err) {
    const errMsg = err.message || String(err);
    lastBackupErrorByTenant.set(code, errMsg);
    agentLog('ERROR', `[${code}] 로컬 DB 자동백업 오류: ${errMsg}`);
    return {
      success: false,
      tenantCode: code,
      error: errMsg,
      message: `[${code}] 로컬 DB 백업 실패: ${errMsg}`
    };
  } finally {
    localBackupRunningByTenant.delete(code);
  }
}

async function checkAndRunScheduledDailyBackup(hint) {
  const code = getEffectiveTenantCode(hint);
  if (localBackupRunningByTenant.has(code)) return;
  try {
    const policy = typeof getTenantPolicy === 'function' ? (getTenantPolicy(code) || {}) : {};
    if (!policy.autoBackupEnabled) return;

    const scheduledTime = String(policy.autoBackupTime || '09:00').trim();
    const currentHm = getLocalTimeHm();
    if (currentHm < scheduledTime) return;

    const dirs = getTenantDirs(code);
    const todayYmd = getLocalDateYmd();
    const todayFilePath = path.join(dirs.dbBackupDir, `eBro_DB_Backup_${todayYmd}.json`);
    if (fs.existsSync(todayFilePath) && fs.statSync(todayFilePath).size > 100) {
      return;
    }

    await executeLocalDatabaseBackup(`DAILY_SCHEDULE_${scheduledTime}`, code);
  } catch (e) {}
}

// =========================================================================
// 📱 [모바일 원격 오류신고 코드 수정 지시 수신 워커 (Remote Error Fix Queue Poller)]
// - 개발자가 외부에서 핸드폰 이메일 버튼(4번)을 누르면 awp_error_reports.environmentInfo.remoteAiQueue.status = 'QUEUED' 기록됨
// - 개발자 PC(콜사인 admin)에 상주 중인 에이전트가 이를 감지하여 로컬 작업 큐 저장 + 클립보드 자동 세팅 + 알림 표시
// =========================================================================
const DEV_ERROR_QUEUE_DIR = path.join(AGENT_HOME, 'dev_error_fix_queue');
let isCheckingRemoteDevFixQueue = false;

function saveDevErrorFixTaskLocally(payload) {
  if (!fs.existsSync(DEV_ERROR_QUEUE_DIR)) {
    fs.mkdirSync(DEV_ERROR_QUEUE_DIR, { recursive: true });
  }
  const reportNo = String(payload.reportNo || payload.reportId || 'ERR-UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '_');
  const promptText = String(payload.promptText || '').trim();
  const mdFilePath = path.join(DEV_ERROR_QUEUE_DIR, `${reportNo}.md`);
  fs.writeFileSync(mdFilePath, promptText, 'utf8');

  // Windows 클립보드 자동 복사 (UTF-8 보존을 위해 파일 경유 PowerShell Set-Clipboard)
  if (process.platform === 'win32' && promptText) {
    try {
      const escapedPath = mdFilePath.replace(/'/g, "''");
      exec(`powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-Content -LiteralPath '${escapedPath}' -Raw -Encoding UTF8 | Set-Clipboard"`, { windowsHide: true }, () => {});
    } catch (e) {}

    // 원격(모바일) 지시인 경우 개발자 PC 화면에 즉시 안내 팝업 표시
    if (payload.source === 'MOBILE_REMOTE' || payload.source === 'SUPABASE_REMOTE_POLL') {
      try {
        const safeTitle = String(payload.title || '').replace(/['"`$]/g, '').slice(0, 60);
        const notifyCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('핸드폰에서 지시한 오류신고 [${reportNo}] 코드 수정 명령이 수신되어 PC 클립보드에 자동 복사되었습니다.` +
          `\\n\\n제목: ${safeTitle}\\n\\nAntigravity 채팅창에 Ctrl+V 로 붙여넣으면 즉시 수정이 시작됩니다.', 'eBro 개발자 원격 지시 수신', 'OK', 'Information')`;
        exec(`powershell.exe -NoProfile -WindowStyle Hidden -Command "${notifyCmd}"`, { windowsHide: true }, () => {});
      } catch (e) {}
    }
  }

  agentLog('INFO', `개발자 오류신고 수정 지시 수신 완료: [${reportNo}] -> ${mdFilePath}`);
  return { filePath: mdFilePath, reportNo };
}

async function checkRemoteDevErrorFixQueue() {
  if (isCheckingRemoteDevFixQueue) return;
  const currentCall = String(activeCallsign || CALLSIGN || '').toLowerCase();
  if (currentCall !== 'admin' && !fs.existsSync('d:\\01.AntiGravity\\eBro')) {
    return; // 오직 개발자 PC에서만 폴링 수행
  }
  isCheckingRemoteDevFixQueue = true;
  try {
    const queryUrl = `${SUPABASE_REST_URL}/awp_error_reports?status=neq.COMPLETED&order=updatedAt.desc&limit=20`;
    const res = await httpRequestJson(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      timeout: 6000
    });
    if (!res.ok || !Array.isArray(res.data)) return;

    for (const row of res.data) {
      let envInfo = row.environmentInfo;
      if (typeof envInfo === 'string') {
        try { envInfo = JSON.parse(envInfo); } catch { envInfo = null; }
      }
      const q = envInfo && envInfo.remoteAiQueue;
      if (q && q.status === 'QUEUED' && q.promptText) {
        saveDevErrorFixTaskLocally({
          reportId: row.id,
          reportNo: row.reportNo,
          title: row.title,
          promptText: q.promptText,
          queuedAt: q.queuedAt,
          source: 'SUPABASE_REMOTE_POLL'
        });

        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16);
        const updatedEnv = {
          ...envInfo,
          remoteAiQueue: {
            ...q,
            status: 'DELIVERED_TO_PC',
            deliveredAt: nowKst,
            deliveredPcName: MACHINE_NAME
          }
        };
        await httpRequestJson(`${SUPABASE_REST_URL}/awp_error_reports?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          timeout: 5000
        }, {
          environmentInfo: updatedEnv,
          updatedAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
  } finally {
    isCheckingRemoteDevFixQueue = false;
  }
}

// 기동 전 포트 5175 선점 프로세스(좀비) 사전 청정 정리
freePortIfOccupied(PORT);

// ── 바탕화면 바로가기 아이콘 단일화 보장 ──
function ensureDesktopShortcut() {
  try {
    const icoPath = path.join(AGENT_HOME, 'eBroAgent.ico');
    const exePath = TARGET_EXE_PATH;
    if (!fs.existsSync(icoPath) || !fs.existsSync(exePath)) return;

    const psCmd = `
      $sh = New-Object -ComObject WScript.Shell;
      $deskPaths = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'OneDrive\\Desktop'), (Join-Path $env:PUBLIC 'Desktop'));
      foreach ($dp in $deskPaths) {
        if (Test-Path $dp) {
          $linkPath = Join-Path $dp 'eBro AI Agent.lnk';
          if (Test-Path $linkPath) {
            $link = $sh.CreateShortcut($linkPath);
            $link.TargetPath = '${exePath.replace(/\\/g, '\\\\')}';
            $link.WorkingDirectory = '${AGENT_HOME.replace(/\\/g, '\\\\')}';
            $link.IconLocation = '${icoPath.replace(/\\/g, '\\\\')},0';
            $link.Save();
          }
        }
      }
    `.replace(/\r?\n\s*/g, ' ');
    exec(`powershell -NoProfile -Command "${psCmd}"`, { windowsHide: true }, () => {});
  } catch (e) {}
}

server.listen(PORT, '127.0.0.1', () => {
  agentLog('INFO', `로컬 서비스 리스닝: http://127.0.0.1:${PORT}`);

  //  윈도우 시스템 트레이(알림 영역) 아이콘 워커 가동 (상시 유지 + 20초 주기 비동기 복구 Watchdog)
  startTrayWorker().catch(() => {});
  setInterval(() => {
    startTrayWorker().catch(() => {});
  }, 20000);

  //  바탕화면 바로가기 아이콘 단일화 보장
  ensureDesktopShortcut();

  //  분산 인쇄 큐 워커 가동
  agentLog('PRINT', `인쇄 큐 워커 가동: 스테이션 [${activeStationConfig?.stationName || '미설정'}] (${activeStationConfig?.stationId || '없음'}), 프린터 [${activeStationConfig?.localPrinterName || '없음'}]`);
  scheduleNextPrintQueueCheck(1500);
  setInterval(() => {
    for (const code of getConfiguredTenantCodes()) {
      sendStationHeartbeat(code).catch(() => {});
    }
  }, 30000);

  setInterval(() => {
    sendAgentHeartbeat(getEffectiveTenantCode()).catch(() => {});
  }, 15000);
  sendAgentHeartbeat(getEffectiveTenantCode());

  // 📱 개발자 PC 전용: 핸드폰에서 원격 지시한 오류신고 코드 수정 명령 10초 주기 자동 수신 워커
  setTimeout(() => { checkRemoteDevErrorFixQueue().catch(() => {}); }, 4000);
  setInterval(() => { checkRemoteDevErrorFixQueue().catch(() => {}); }, 10000);

  // 🛡️ 매일 09:00 권한 기반 로컬 DB 자동백업 스케줄러 가동 (등록된 모든 테넌트 독립 백업)
  const runAllTenantScheduledBackups = () => {
    for (const code of getConfiguredTenantCodes()) {
      checkAndRunScheduledDailyBackup(code).catch(() => {});
    }
  };
  setTimeout(runAllTenantScheduledBackups, 8000);
  setInterval(runAllTenantScheduledBackups, 60 * 1000);

  // Cloudflare R2 원본 저장소 기동 즉시 동기화 (부팅 초기 DNS 지연 대비 자동 재시도 포함) 및 5분 주기 자동 미러링
  const initialR2SyncedByTenant = new Set();
  const runAllTenantR2Sync = async (isInitialSweep = false) => {
    for (const code of getConfiguredTenantCodes()) {
      if (isInitialSweep && initialR2SyncedByTenant.has(code)) continue;
      try {
        const res = await autoSyncFromCloudflare(code);
        if (res && (res.success || res.configured === false)) {
          initialR2SyncedByTenant.add(code);
        }
      } catch (e) {}
    }
  };
  [1500, 15000, 40000].forEach((delayMs) => {
    setTimeout(() => {
      runAllTenantR2Sync(true).catch(() => {});
    }, delayMs);
  });
  setInterval(() => {
    runAllTenantR2Sync(false).catch(() => {});
  }, 5 * 60 * 1000);

  // 순수 시스템 트레이 데몬 모드 상주 (스튜디오 창 자동 팝업 배제, 트레이 조작 시에만 실행)
  const isDaemon = process.argv.includes('--daemon') || process.argv.includes('--silent');
  if (!isDaemon) {
    setTimeout(() => {
      const pol = typeof getAgentPolicy === 'function' ? (getAgentPolicy() || {}) : {};
      const activeCode = getEffectiveTenantCode(pol.tenantCode || TENANT_CODE || 'GIYEONLIFT');
      const activePol = typeof getTenantPolicy === 'function' ? (getTenantPolicy(activeCode) || pol) : pol;
      let rawSub = activePol.subdomain || (activeCode === 'GIYEONLIFT' ? 'giyeon' : activeCode.toLowerCase());
      if (String(rawSub).toLowerCase() === 'giyeonlift' || String(rawSub).toLowerCase() === 'giyeun') rawSub = 'giyeon';
      const loginUrl = `https://${rawSub}.ebro.run`;
      openDefaultBrowser(loginUrl);
    }, 600);
  }
});



