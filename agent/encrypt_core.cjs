// agent/encrypt_core.cjs
// eBro AI Agent 비즈니스 코어 번들링, AES-256-GCM 암호화 및 전 계층 버전/해시 SSOT 자동 동기화 스크립트
const { exec, execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AGENT_DIR = __dirname;
const ROOT_DIR = path.resolve(AGENT_DIR, '..');
const CORE_DIR = path.join(AGENT_DIR, 'core');
const ENTRY_FILE = path.join(AGENT_DIR, 'eBroAgent.js');
const STUDIO_FILE = path.join(AGENT_DIR, 'studioEngine.js');
const BUNDLE_TEMP = path.join(CORE_DIR, 'engine.bundle.js');
const OUTPUT_DAT = path.join(CORE_DIR, 'engine.dat');
const PUBLIC_DAT = path.join(ROOT_DIR, 'public', 'downloads', 'engine.dat');
const VERSION_JSON_PATH = path.join(ROOT_DIR, 'public', 'downloads', 'version.json');
const AGENT_SERVICE_TS_PATH = path.join(ROOT_DIR, 'src', 'services', 'agentService.ts');
const ISS_PATH = path.join(AGENT_DIR, 'eBroAgent.iss');
const LOCAL_INSTALLED_DAT = 'C:\\eBroAgent\\core\\engine.dat';

const isIfChangedMode = process.argv.includes('--if-changed');

// 고정 AES-256 암호화 키 (32바이트 SHA-256 파생)
const SECRET_KEY = crypto.createHash('sha256').update('EBR0-ERP-C0R3-S3CR3T-K3Y-2026-GIYEUN').digest();

function parseVersionNums(verStr) {
  const cleaned = String(verStr || '').trim().replace(/^v/i, '');
  const parts = cleaned.split('.Build.');
  const semver = (parts[0] || '2.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const build = parts[1] ? (parseInt(parts[1], 10) || 0) : 0;
  return [semver[0] || 2, semver[1] || 0, semver[2] || 0, build];
}

function isVerNewer(a, b) {
  const pa = parseVersionNums(a);
  const pb = parseVersionNums(b);
  for (let i = 0; i < 4; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

// 1. 코어 소스코드(eBroAgent.js + studioEngine.js + trayIcon.ps1 + ebro-agent-core/*.py + ebro-web-agent/*.js)의 결정론적 SHA-256 해시 산출
function computeCoreSourceHash() {
  const normalize = (src) =>
    String(src || '')
      .replace(/\r\n/g, '\n')
      .replace(/const VERSION = ['"][^'"]+['"];/g, 'const VERSION = "__VER__";')
      .replace(/const CORE_HASH = ['"][^'"]+['"];/g, 'const CORE_HASH = "__HASH__";');

  const trayFile = path.join(AGENT_DIR, 'trayIcon.ps1');
  const agentSrc = fs.existsSync(ENTRY_FILE) ? normalize(fs.readFileSync(ENTRY_FILE, 'utf8')) : '';
  const studioSrc = fs.existsSync(STUDIO_FILE) ? normalize(fs.readFileSync(STUDIO_FILE, 'utf8')) : '';
  const traySrc = fs.existsSync(trayFile) ? normalize(fs.readFileSync(trayFile, 'utf8')) : '';

  let pyAndExtSrc = '';
  const pyDir = path.join(ROOT_DIR, 'ebro-agent-core');
  if (fs.existsSync(pyDir)) {
    const pyFiles = fs.readdirSync(pyDir).filter(f => f.endsWith('.py')).sort();
    for (const f of pyFiles) {
      pyAndExtSrc += `\n===PY:${f}===\n` + normalize(fs.readFileSync(path.join(pyDir, f), 'utf8'));
    }
  }
  const extDir = path.join(ROOT_DIR, 'ebro-web-agent');
  if (fs.existsSync(extDir)) {
    const extFiles = fs.readdirSync(extDir).filter(f => f.endsWith('.js') || f.endsWith('.html')).sort();
    for (const f of extFiles) {
      pyAndExtSrc += `\n===EXT:${f}===\n` + normalize(fs.readFileSync(path.join(extDir, f), 'utf8'));
    }
  }

  return crypto.createHash('sha256').update(agentSrc + '\n===STUDIO===\n' + studioSrc + '\n===TRAY===\n' + traySrc + pyAndExtSrc, 'utf8').digest('hex').slice(0, 12);
}

const computedHash = computeCoreSourceHash();

let versionMeta = {};
try {
  versionMeta = JSON.parse(fs.readFileSync(VERSION_JSON_PATH, 'utf8'));
} catch (e) {
  versionMeta = {
    version: 'v2.0.0.Build.14',
    coreUrl: 'https://ebro.run/downloads/engine.dat',
    downloadUrl: 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/downloads/eBroAgent_Setup.exe',
    installerUrl: 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/downloads/eBroAgent_Setup.exe',
    certUrl: 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/downloads/eBroAgent_Root.cer',
    minCompatibleVersion: 'v2.0.0.Build.1',
    fileSize: '2.2MB (core) / 24MB (installer)'
  };
}

// --if-changed 모드 또는 CI/Vercel 환경: 코어 소스 해시가 동일하거나 CI 환경이면 재빌드 생략
if (isIfChangedMode || process.env.VERCEL || process.env.CI) {
  if (process.env.VERCEL || process.env.CI) {
    console.log(`[Agent Core Check] CI/Vercel 환경 감지 -> 사전 빌드된 engine.dat 사용 (재번들링 생략)`);
    process.exit(0);
  }
  const coreExists = fs.existsSync(OUTPUT_DAT);
  const pubExists = fs.existsSync(PUBLIC_DAT);
  const sameSize = coreExists && pubExists && fs.statSync(OUTPUT_DAT).size === fs.statSync(PUBLIC_DAT).size;
  if (versionMeta.coreHash === computedHash && sameSize) {
    console.log(`[Agent Core Check] 코어 소스 변경 없음 (${versionMeta.version}, Hash: ${computedHash}) -> 재빌드 생략`);
    process.exit(0);
  }
}

// 2. 버전 결정: 코어 해시가 이전 version.json과 달라졌는데 버전 번호가 아직 안 올라갔다면 Build 번호 +1 자동 증가
const agentSrcRaw = fs.readFileSync(ENTRY_FILE, 'utf8');
const codeVerMatch = agentSrcRaw.match(/const VERSION = ['"]([^'"]+)['"];/);
const codeVer = codeVerMatch ? codeVerMatch[1] : versionMeta.version;
const jsonVer = versionMeta.version || 'v2.0.0.Build.14';

let targetVersion = isVerNewer(codeVer, jsonVer) ? codeVer : jsonVer;
if (versionMeta.coreHash !== computedHash && !isVerNewer(codeVer, jsonVer)) {
  const [maj, min, pat, bld] = parseVersionNums(targetVersion);
  targetVersion = `v${maj}.${min}.${pat}.Build.${bld + 1}`;
  console.log(`[Auto-Version Bump] 코어 소스 변경 감지 (${versionMeta.coreHash || 'none'} -> ${computedHash}) => 버전 자동 승격: ${targetVersion}`);
} else {
  console.log(`[Version Sync] 타겟 에이전트 버전: ${targetVersion} (CoreHash: ${computedHash})`);
}

// 3. 전 계층 파일에 VERSION 및 CORE_HASH 동기화 주입
function syncVersionAndHashAcrossFiles(ver, hash) {
  // 3-1. agent/eBroAgent.js
  let ebroCode = fs.readFileSync(ENTRY_FILE, 'utf8');
  ebroCode = ebroCode.replace(/const VERSION = ['"][^'"]+['"];/, `const VERSION = '${ver}';`);
  if (/const CORE_HASH = ['"][^'"]+['"];/.test(ebroCode)) {
    ebroCode = ebroCode.replace(/const CORE_HASH = ['"][^'"]+['"];/, `const CORE_HASH = '${hash}';`);
  } else {
    ebroCode = ebroCode.replace(`const VERSION = '${ver}';`, `const VERSION = '${ver}';\nconst CORE_HASH = '${hash}';`);
  }
  fs.writeFileSync(ENTRY_FILE, ebroCode, 'utf8');

  // 3-2. agent/agent.js & agent/BroAgent.js
  for (const legacyFile of ['agent.js', 'BroAgent.js']) {
    const p = path.join(AGENT_DIR, legacyFile);
    if (fs.existsSync(p)) {
      const c = fs.readFileSync(p, 'utf8').replace(/const VERSION = ['"][^'"]+['"];/, `const VERSION = '${ver}';`);
      fs.writeFileSync(p, c, 'utf8');
    }
  }

  // 3-3. agent/eBroAgent.iss
  if (fs.existsSync(ISS_PATH)) {
    const issContent = fs.readFileSync(ISS_PATH, 'utf8')
      .replace(/AppVersion=[^\r\n]+/, `AppVersion=${ver}`)
      .replace(/#define MyAppVersion "[^"]+"/, `#define MyAppVersion "${ver.replace(/^v/i, '')}"`);
    fs.writeFileSync(ISS_PATH, issContent, 'utf8');
  }

  // 3-4. src/services/agentService.ts
  if (fs.existsSync(AGENT_SERVICE_TS_PATH)) {
    let tsContent = fs.readFileSync(AGENT_SERVICE_TS_PATH, 'utf8');
    tsContent = tsContent.replace(/export const EXPECTED_AGENT_VERSION(?:\s*:\s*string)?\s*=\s*['"][^'"]+['"];/, `export const EXPECTED_AGENT_VERSION: string = '${ver}';`);
    if (/export const EXPECTED_CORE_HASH(?:\s*:\s*string)?\s*=\s*['"][^'"]*['"];/.test(tsContent)) {
      tsContent = tsContent.replace(/export const EXPECTED_CORE_HASH(?:\s*:\s*string)?\s*=\s*['"][^'"]*['"];/, `export const EXPECTED_CORE_HASH: string = '${hash}';`);
    } else {
      tsContent = tsContent.replace(
        `export const EXPECTED_AGENT_VERSION: string = '${ver}';`,
        `export const EXPECTED_AGENT_VERSION: string = '${ver}';\nexport const EXPECTED_CORE_HASH: string = '${hash}';`
      );
    }
    fs.writeFileSync(AGENT_SERVICE_TS_PATH, tsContent, 'utf8');
  }

  // 3-5. public/downloads/version.json
  versionMeta.version = ver;
  versionMeta.coreHash = hash;
  versionMeta.buildTime = new Date().toISOString();
  versionMeta.coreUrl = 'https://ebro.run/downloads/engine.dat';
  versionMeta.downloadUrl = 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/downloads/eBroAgent_Setup.exe';
  versionMeta.installerUrl = 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/downloads/eBroAgent_Setup.exe';
  versionMeta.changelog = `${ver}: Windows UIA 하이브리드 접근성 엔진 + 테넌트·개인별 BYOK AI 모델/API 키 암호화 금고 + Jev 사전 판단 선택형 엔진 + 스마트 핫패치 업데이트 통합`;
  fs.writeFileSync(VERSION_JSON_PATH, JSON.stringify(versionMeta, null, 2) + '\n', 'utf8');
}

syncVersionAndHashAcrossFiles(targetVersion, computedHash);

if (!fs.existsSync(CORE_DIR)) {
  fs.mkdirSync(CORE_DIR, { recursive: true });
}

console.log('[1/4] esbuild 번들링 중 (외부 npm 라이브러리 및 UI 인라인 통합)...');
execSync(`npx esbuild "${ENTRY_FILE}" --bundle --platform=node --target=node18 --loader:.ps1=text --minify --outfile="${BUNDLE_TEMP}"`, {
  cwd: ROOT_DIR,
  stdio: 'inherit'
});

if (!fs.existsSync(BUNDLE_TEMP)) {
  console.error('[ERROR] engine.bundle.js 생성 실패!');
  process.exit(1);
}

const rawBundle = fs.readFileSync(BUNDLE_TEMP);
console.log(`[INFO] 번들 파일 크기: ${(rawBundle.length / 1024 / 1024).toFixed(2)} MB (${rawBundle.length.toLocaleString()} 바이트)`);

console.log('[2/4] AES-256-GCM 암호화 및 위변조 방지 인증 태그 생성 중...');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);
const ciphertext = Buffer.concat([cipher.update(rawBundle), cipher.final()]);
const authTag = cipher.getAuthTag();

// 파일 구조: [12바이트 IV] + [16바이트 GCM AuthTag] + [암호화된 바이트스트림]
const datPayload = Buffer.concat([iv, authTag, ciphertext]);
try { if (fs.existsSync(OUTPUT_DAT)) fs.unlinkSync(OUTPUT_DAT); } catch (e) {}
fs.writeFileSync(OUTPUT_DAT, datPayload);

// 임시 평문 번들 파일 즉시 영구 삭제 (보안 강화)
try {
  fs.unlinkSync(BUNDLE_TEMP);
} catch (e) {}

console.log('[3/4] 원격 배포 경로(public/downloads/engine.dat) 및 로컬 데몬(C:\\eBroAgent\\core\\engine.dat) 자동 동기화 중...');
const publicDownloadsDir = path.dirname(PUBLIC_DAT);
if (!fs.existsSync(publicDownloadsDir)) {
  fs.mkdirSync(publicDownloadsDir, { recursive: true });
}
fs.copyFileSync(OUTPUT_DAT, PUBLIC_DAT);

if (fs.existsSync(path.dirname(LOCAL_INSTALLED_DAT))) {
  try {
    try { if (fs.existsSync(LOCAL_INSTALLED_DAT)) fs.unlinkSync(LOCAL_INSTALLED_DAT); } catch (e) {}
    fs.copyFileSync(OUTPUT_DAT, LOCAL_INSTALLED_DAT);
    const localHome = 'C:\\eBroAgent';
    const trayFileSrc = path.join(AGENT_DIR, 'trayIcon.ps1');
    const trayFileDst = path.join(localHome, 'trayIcon.ps1');
    if (fs.existsSync(trayFileSrc)) {
      const cleanTray = fs.readFileSync(trayFileSrc, 'utf8').replace(/^\uFEFF/, '');
      try { if (fs.existsSync(trayFileDst)) fs.unlinkSync(trayFileDst); } catch (e) {}
      fs.writeFileSync(trayFileDst, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(cleanTray, 'utf8')]));
    }
    const statusFileDst = path.join(localHome, 'agent_status.json');
    const statusTempDst = `${statusFileDst}.tmp.${process.pid}`;
    try { if (fs.existsSync(statusFileDst)) fs.unlinkSync(statusFileDst); } catch (e) {}
    fs.writeFileSync(statusTempDst, JSON.stringify({
      currentVersion: targetVersion,
      currentCoreHash: computedHash,
      targetVersion: targetVersion,
      targetCoreHash: computedHash,
      isMismatch: false,
      status: 'idle',
      message: '최신 버전을 사용 중입니다.',
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
    fs.renameSync(statusTempDst, statusFileDst);
    if (process.platform === 'win32') {
      try { exec(`attrib +h "${statusFileDst}"`, { windowsHide: true }, () => {}); } catch (e) {}
    }
    console.log(`[SYNC] 로컬 에이전트 코어 및 트레이 상태 갱신 완료: ${LOCAL_INSTALLED_DAT}`);
  } catch (localErr) {
    console.warn(`[WARN] 로컬 에이전트 코어 복사 건너뜀: ${localErr.message}`);
  }
}

console.log('[4/4] 코어 암호화 및 전 계층 버전/해시 동기화 완료!');
console.log(`[SUCCESS] Version: ${targetVersion} | CoreHash: ${computedHash} | Size: ${(datPayload.length / 1024).toFixed(1)} KB`);
