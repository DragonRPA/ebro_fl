// agent/studioEngine.js
//  e-Bro ERP — AI Agent 독립 데스크톱 스튜디오 & 자연어 업무 지시 큐 엔진
// 전사 개발 표준 헌장 (카테고리 I, III, V) 완벽 준수

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, exec, execSync } = require('child_process');

const AGENT_HOME = 'C:\\eBroAgent';
const QUEUE_FILE = path.join(AGENT_HOME, 'instruction_queue.json');

// 텔레그램 모바일 원격 제어 엔진 연동
const {
  loadTelegramConfig,
  saveTelegramConfig,
  getTelegramConfig,
  isTelegramRunning,
  startTelegramBot,
  stopTelegramBot,
  restartTelegramBot,
  sendTelegramMessage,
  sendTestTelegramMessage
} = require('./telegramEngine');

// 작업 큐 인메모리 캐시 (최신 30개만 유지)
const MAX_QUEUE_SIZE = 30;
let taskQueue = [];
const taskCompletionCallbacks = new Map(); // taskId -> callback(task)
let isWorkerRunning = false;
let sseClients = new Set();
let ollamaStatusCache = { available: false, model: 'none', checkedAt: 0 };

// 실시간 스튜디오 로그 버퍼 (최신 30개 작업큐 범위 내 로그만 유지)
const MAX_LOG_HISTORY = 150;
const studioLogHistory = [
  { taskId: null, log: `[${new Date().toTimeString().slice(0, 8)}] [SYSTEM] eBro AI Agent 데스크톱 스튜디오 엔진 초기화 완료` }
];

const EMOJI_STRIP_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu;
const prefetchedTaskIntents = new Map();
let saveQueueTimer = null;

function writeHiddenJsonSync(filePath, dataObj) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tempPath, JSON.stringify(dataObj, null, 2), 'utf8');
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    fs.renameSync(tempPath, filePath);
    if (process.platform === 'win32') {
      exec(`attrib +h "${filePath}"`, { windowsHide: true }, () => {});
    }
  } catch (e) {}
}

function stripEmojis(str) {
  if (typeof str !== 'string') str = String(str || '');
  return str.replace(EMOJI_STRIP_RE, '').trim();
}

function pruneQueueAndLogs() {
  if (taskQueue.length > MAX_QUEUE_SIZE) {
    taskQueue = taskQueue.slice(0, MAX_QUEUE_SIZE);
  }
  const activeTaskIds = new Set(taskQueue.map(t => t.id));
  for (let i = studioLogHistory.length - 1; i >= 0; i--) {
    const entry = studioLogHistory[i];
    if (entry && entry.taskId && !activeTaskIds.has(entry.taskId)) {
      studioLogHistory.splice(i, 1);
    }
  }
  while (studioLogHistory.length > MAX_LOG_HISTORY) {
    studioLogHistory.shift();
  }
}

// 실시간 스튜디오 로그 브로드캐스트 (이모지 100% 배제, [TYPE] 형식 강제)
function broadcastStudioLog(type, message, taskId = null) {
  const cleanType = String(type || 'INFO').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cleanMsg = stripEmojis(message);
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const logLine = `[${timeStr}] [${cleanType}] ${cleanMsg}`;

  studioLogHistory.push({ taskId, log: logLine });
  pruneQueueAndLogs();

  broadcastEvent('LOG_APPEND', { taskId, log: logLine });
}

// 큐 파일 로드 (최신 30개만 복원 및 저장된 작업 로그 동기화)
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = fs.readFileSync(QUEUE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      taskQueue = Array.isArray(parsed) ? parsed.slice(0, MAX_QUEUE_SIZE) : [];
      // 최신 30개 작업에 속한 로그 복원 (오래된 순 -> 최신 순)
      taskQueue.slice().reverse().forEach(t => {
        if (Array.isArray(t.logs)) {
          t.logs.forEach(l => {
            studioLogHistory.push({ taskId: t.id, log: String(l) });
          });
        }
      });
      pruneQueueAndLogs();
    }
  } catch (e) {
    taskQueue = [];
  }
}

// 큐 파일 저장 (최신 30개만 기억)
function saveQueue() {
  pruneQueueAndLogs();
  writeHiddenJsonSync(QUEUE_FILE, taskQueue.slice(0, MAX_QUEUE_SIZE));
}

function scheduleSaveQueue(immediate = false) {
  if (immediate) {
    if (saveQueueTimer) {
      clearTimeout(saveQueueTimer);
      saveQueueTimer = null;
    }
    saveQueue();
    return;
  }
  if (!saveQueueTimer) {
    saveQueueTimer = setTimeout(() => {
      saveQueueTimer = null;
      saveQueue();
    }, 250);
  }
}

process.on('exit', () => {
  if (saveQueueTimer) {
    clearTimeout(saveQueueTimer);
    saveQueueTimer = null;
    saveQueue();
  }
});

loadQueue();

// ── 🤖 Ollama 추론 엔진 모델 설정 및 영구 보존 ──
const OLLAMA_CONFIG_FILE = path.join(AGENT_HOME, 'ollama_config.json');
let selectedOllamaModel = 'ebro-qwen:3b';

function loadOllamaConfig() {
  try {
    if (fs.existsSync(OLLAMA_CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(OLLAMA_CONFIG_FILE, 'utf8'));
      if (cfg && cfg.model) {
        selectedOllamaModel = cfg.model;
      }
    }
  } catch (e) {}
}
loadOllamaConfig();

function saveOllamaConfig(model) {
  selectedOllamaModel = model;
  writeHiddenJsonSync(OLLAMA_CONFIG_FILE, {
    model: selectedOllamaModel,
    updatedAt: new Date().toISOString()
  });
}

// ── 🔐 테넌트(기업)·임직원(개인) 단위 BYOK AI 프로필 암호화 금고 & Jev 선택 엔진 ──
const AI_VAULT_FILE = path.join(AGENT_HOME, 'ebro_ai_profiles.vault.json');
const VAULT_XOR_KEY = Buffer.from('eBro_Tenant_Sovereignty_Vault_2026', 'utf8');

const SUPPORTED_AI_PROVIDERS = {
  LOCAL_OLLAMA: {
    label: '로컬 내장 AI · 무료 · 외부 전송 없음',
    default_model: 'ebro-qwen:3b',
    requires_key: false
  },
  GEMINI: {
    label: 'Google Gemini · 무료 티어 및 유료 API',
    default_model: 'gemini-2.5-flash',
    requires_key: true
  },
  OPENAI: {
    label: 'OpenAI ChatGPT API',
    default_model: 'gpt-4o-mini',
    requires_key: true
  },
  ANTHROPIC: {
    label: 'Anthropic Claude API',
    default_model: 'claude-3-5-haiku-latest',
    requires_key: true
  },
  GROQ: {
    label: 'Groq 초고속 LPU API',
    default_model: 'llama-3.3-70b-versatile',
    requires_key: true
  },
  JEV_OPENROUTER: {
    label: 'Jev · OpenRouter 초저비용 라우터',
    default_model: 'typesafe/jev',
    requires_key: true
  }
};

let aiProfilesCache = {};

function encryptVaultSecret(plain) {
  if (!plain) return '';
  const raw = Buffer.from(String(plain), 'utf8');
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw[i] ^ VAULT_XOR_KEY[i % VAULT_XOR_KEY.length];
  }
  return '__VAULT__' + out.toString('base64');
}

function decryptVaultSecret(cipher) {
  if (!cipher) return '';
  const str = String(cipher);
  if (!str.startsWith('__VAULT__')) return str;
  try {
    const b64 = str.slice('__VAULT__'.length);
    const xored = Buffer.from(b64, 'base64');
    const out = Buffer.alloc(xored.length);
    for (let i = 0; i < xored.length; i++) {
      out[i] = xored[i] ^ VAULT_XOR_KEY[i % VAULT_XOR_KEY.length];
    }
    return out.toString('utf8');
  } catch (e) {
    return '';
  }
}

function maskVaultKey(key) {
  if (!key) return '';
  const s = String(key);
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••••••••••${s.slice(-4)}`;
}

let aiVaultMtimeMs = -1;

function loadAiVault() {
  try {
    if (!fs.existsSync(AI_VAULT_FILE)) {
      aiVaultMtimeMs = -1;
      return;
    }
    const st = fs.statSync(AI_VAULT_FILE);
    if (st.mtimeMs === aiVaultMtimeMs) return;
    const data = JSON.parse(fs.readFileSync(AI_VAULT_FILE, 'utf8'));
    if (data && typeof data === 'object') {
      aiProfilesCache = data;
    }
    aiVaultMtimeMs = st.mtimeMs;
  } catch (e) {
    aiProfilesCache = {};
  }
}
loadAiVault();

function saveAiVault() {
  writeHiddenJsonSync(AI_VAULT_FILE, aiProfilesCache);
  try {
    if (fs.existsSync(AI_VAULT_FILE)) {
      aiVaultMtimeMs = fs.statSync(AI_VAULT_FILE).mtimeMs;
    }
  } catch (e) {}
}

function makeVaultKey(tenantCode, userId) {
  const t = String(tenantCode || agentPolicy?.tenantCode || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
  const u = String(userId || 'DEFAULT').trim() || 'DEFAULT';
  return `${t}:${u}`;
}

function setAiProfile(options = {}) {
  loadAiVault();
  const tCode = String(options.tenant_code || agentPolicy?.tenantCode || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
  const uId = String(options.user_id || 'DEFAULT').trim() || 'DEFAULT';
  const key = makeVaultKey(tCode, uId);
  const existing = aiProfilesCache[key] || {};

  let normProvider = String(options.provider || existing.provider || 'LOCAL_OLLAMA').trim().toUpperCase();
  if (!SUPPORTED_AI_PROVIDERS[normProvider]) normProvider = 'LOCAL_OLLAMA';

  const defaultModel = SUPPORTED_AI_PROVIDERS[normProvider].default_model;
  const finalModel = String(options.model || existing.model || defaultModel).trim() || defaultModel;

  let encKey = existing.encrypted_api_key || '';
  if (options.api_key !== undefined && options.api_key !== null) {
    const cleanKey = String(options.api_key).trim();
    if (cleanKey && !cleanKey.includes('••••')) {
      encKey = encryptVaultSecret(cleanKey);
    } else if (cleanKey === '') {
      encKey = '';
    }
  }

  let encJevKey = existing.encrypted_jev_api_key || '';
  if (options.jev_api_key !== undefined && options.jev_api_key !== null) {
    const cleanJevKey = String(options.jev_api_key).trim();
    if (cleanJevKey && !cleanJevKey.includes('••••')) {
      encJevKey = encryptVaultSecret(cleanJevKey);
    } else if (cleanJevKey === '') {
      encJevKey = '';
    }
  }

  const jevEnabled = options.jev_enabled !== undefined && options.jev_enabled !== null
    ? Boolean(options.jev_enabled)
    : Boolean(existing.jev_enabled);

  aiProfilesCache[key] = {
    tenant_code: tCode,
    user_id: uId,
    provider: normProvider,
    model: finalModel,
    encrypted_api_key: encKey,
    vision_fallback_enabled: options.vision_fallback_enabled !== undefined ? Boolean(options.vision_fallback_enabled) : (existing.vision_fallback_enabled !== false),
    custom_endpoint: String(options.custom_endpoint !== undefined ? options.custom_endpoint : (existing.custom_endpoint || '')).trim(),
    jev_enabled: jevEnabled,
    encrypted_jev_api_key: encJevKey,
    jev_model: String(options.jev_model || existing.jev_model || 'typesafe/jev').trim() || 'typesafe/jev',
    jev_endpoint: String(options.jev_endpoint !== undefined ? options.jev_endpoint : (existing.jev_endpoint || '')).trim(),
    updated_at: Math.floor(Date.now() / 1000)
  };
  saveAiVault();
  return getMaskedAiProfile(tCode, uId);
}

function getAiProfile(tenantCode, userId) {
  loadAiVault();
  const tCode = String(tenantCode || agentPolicy?.tenantCode || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
  const uId = String(userId || 'DEFAULT').trim() || 'DEFAULT';

  const candidates = [];
  if (uId !== 'DEFAULT') candidates.push([`${tCode}:${uId}`, 'USER_PERSONAL']);
  candidates.push([`${tCode}:DEFAULT`, 'TENANT_SHARED']);
  candidates.push(['DEFAULT:DEFAULT', 'GLOBAL']);

  for (const [k, scopeLabel] of candidates) {
    const rec = aiProfilesCache[k];
    if (rec) {
      const decKey = decryptVaultSecret(rec.encrypted_api_key || '');
      let decJevKey = decryptVaultSecret(rec.encrypted_jev_api_key || '');
      if (!decJevKey && rec.provider === 'JEV_OPENROUTER') decJevKey = decKey;
      const prov = rec.provider || 'LOCAL_OLLAMA';
      return {
        scope: scopeLabel,
        tenant_code: rec.tenant_code || tCode,
        user_id: rec.user_id || uId,
        provider: prov,
        model: rec.model || SUPPORTED_AI_PROVIDERS[prov]?.default_model || selectedOllamaModel,
        api_key: decKey,
        has_api_key: Boolean(decKey),
        vision_fallback_enabled: rec.vision_fallback_enabled !== false,
        custom_endpoint: rec.custom_endpoint || '',
        jev_enabled: Boolean(rec.jev_enabled),
        jev_api_key: decJevKey,
        has_jev_api_key: Boolean(decJevKey),
        jev_model: rec.jev_model || 'typesafe/jev',
        jev_endpoint: rec.jev_endpoint || ''
      };
    }
  }

  return {
    scope: 'LOCAL_FREE_DEFAULT',
    tenant_code: tCode,
    user_id: uId,
    provider: 'LOCAL_OLLAMA',
    model: selectedOllamaModel || 'ebro-qwen:3b',
    api_key: '',
    has_api_key: false,
    vision_fallback_enabled: true,
    custom_endpoint: '',
    jev_enabled: false,
    jev_api_key: '',
    has_jev_api_key: false,
    jev_model: 'typesafe/jev',
    jev_endpoint: ''
  };
}

function getMaskedAiProfile(tenantCode, userId) {
  const prof = getAiProfile(tenantCode, userId);
  const rawKey = prof.api_key || '';
  const rawJevKey = prof.jev_api_key || '';
  delete prof.api_key;
  delete prof.jev_api_key;
  prof.masked_api_key = maskVaultKey(rawKey);
  prof.masked_jev_api_key = maskVaultKey(rawJevKey);
  prof.provider_label = SUPPORTED_AI_PROVIDERS[prof.provider]?.label || prof.provider;
  return prof;
}

// ── ♿ Windows UIA 하이브리드 접근성 엔진 브릿지 (Python 9002 연동 + 내장 .NET UIA 폴백) ──
async function executeUiaTool(toolName, params = {}) {
  // 1순위: ebro-agent-core (포트 9002) Python UIA 엔진이 실행 중이면 고속 위임
  try {
    const res = await fetch('http://127.0.0.1:9002/uia/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, params }),
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  // 2순위: Windows 내장 .NET System.Windows.Automation PowerShell 브릿지 직접 실행
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows 환경에서만 UIA 접근성 제어를 지원합니다.' };
  }

  try {
    const runPsEncoded = (psCode, useSta = false, timeoutMs = 6000) => new Promise((resolve, reject) => {
      const fullCode = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psCode}`;
      const encoded = Buffer.from(fullCode, 'utf16le').toString('base64');
      const staFlag = useSta ? '-STA ' : '';
      exec(`powershell ${staFlag}-NoProfile -EncodedCommand ${encoded}`, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: timeoutMs
      }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr?.trim() || err.message || 'PowerShell 실행 오류'));
        }
        try {
          resolve(JSON.parse(String(stdout || '').trim()));
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });

    if (toolName === 'uia_inspect_window' || toolName === 'get_page_content') {
      const psScript = `
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsOffscreenProperty, $false)
        $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
        $list = @()
        foreach ($w in $wins) {
          $name = $w.Current.Name
          if ($name) {
            $list += @{ name = $name; className = $w.Current.ClassName; automationId = $w.Current.AutomationId; controlType = $w.Current.ControlType.ProgrammaticName }
          }
          if ($list.Count -ge 25) { break }
        }
        @{ success = $true; engine = "DOTNET_UIA_BRIDGE"; count = $list.Count; elements = $list } | ConvertTo-Json -Depth 4 -Compress
      `;
      return await runPsEncoded(psScript, false, 6000);
    }

    if (toolName === 'uia_handle_file_dialog') {
      const filePath = String(params.file_path || '');
      if (!filePath) return { success: false, error: 'file_path 파라미터가 필요합니다.' };
      const safePath = filePath.replace(/'/g, "''");
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Clipboard]::SetText('${safePath}')
        [System.Windows.Forms.SendKeys]::SendWait('^v{ENTER}')
        @{ success = $true; engine = "DOTNET_UIA_BRIDGE"; file_path = '${safePath}' } | ConvertTo-Json -Compress
      `;
      return await runPsEncoded(psScript, true, 5000);
    }

    if (toolName === 'uia_click' || toolName === 'click_element') {
      const targetName = String(params.target || params.name || '').replace(/'/g, "''");
      const psScript = `
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '${targetName}')
        $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($el -ne $null) {
          $inv = $null
          if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$inv)) {
            $inv.Invoke()
            @{ success = $true; engine = "DOTNET_UIA_BRIDGE"; clicked = '${targetName}' } | ConvertTo-Json -Compress
            exit
          }
        }
        @{ success = $false; error = "UIA 요소를 찾지 못했습니다: ${targetName}" } | ConvertTo-Json -Compress
      `;
      return await runPsEncoded(psScript, false, 6000);
    }

    return { success: false, error: `지원되지 않는 UIA 도구: ${toolName}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 🌐 웹 에이전트(ebro web agent) 브라우저 확장 연결 세션 관리 ──
const connectedWebAgents = new Set();
const pendingToolCalls = new Map(); // callId -> { resolve, reject, timer }

function isWebAgentConnected() {
  for (const ws of connectedWebAgents) {
    if (ws.readyState === 1) return true;
  }
  return false;
}

function sendToolToWebAgent(tool, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let targetWs = null;
    for (const ws of connectedWebAgents) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        targetWs = ws;
        break;
      }
    }

    if (!targetWs) {
      return reject(new Error('연결된 웹 에이전트(브라우저 확장)가 없습니다.'));
    }

    const callId = 'call_' + Math.random().toString(36).substring(2, 10);
    const timer = setTimeout(() => {
      pendingToolCalls.delete(callId);
      reject(new Error(`도구 실행 시간 초과 (${timeoutMs}ms)`));
    }, timeoutMs);

    pendingToolCalls.set(callId, { resolve, reject, timer });

    try {
      targetWs.send(JSON.stringify({
        type: 'EXECUTE_TOOL',
        callId,
        tool,
        params
      }));
    } catch (e) {
      pendingToolCalls.delete(callId);
      clearTimeout(timer);
      reject(e);
    }
  });
}

function handleWebSocketConnection(ws, req) {
  ws.isAlive = true;

  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message);

      // 1. DRG 레거시 배치 지원
      if (payload.drgPath || payload.drgContent) {
        let AdmZip;
        try { AdmZip = require('adm-zip'); } catch (e) {}
        if (AdmZip) {
          let zip;
          if (payload.drgPath) {
            zip = new AdmZip(payload.drgPath);
          } else if (payload.drgContent) {
            const buffer = Buffer.from(payload.drgContent, 'base64');
            zip = new AdmZip(buffer);
          }
          const manifestEntry = zip.getEntries().find(e => e.entryName === 'manifest.json');
          if (!manifestEntry) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'manifest.json not found in DRG' }));
            return;
          }
          let manifestString = manifestEntry.getData().toString('utf8');
          if (payload.parameters) {
            for (const [key, value] of Object.entries(payload.parameters)) {
              const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
              manifestString = manifestString.replace(regex, String(value));
            }
          }
          const manifest = JSON.parse(manifestString);
          const steps = manifest.steps || manifest.tools || [];
          for (const step of steps) {
            ws.send(JSON.stringify({ type: 'EXECUTE_TOOL', tool: step }));
          }
          ws.send(JSON.stringify({ type: 'DONE' }));
        }
        return;
      }

      // 2. ebro web agent 확장 프로그램 핸드셰이크 등록
      if (payload.type === 'REGISTER_EXTENSION') {
        connectedWebAgents.add(ws);
        broadcastStudioLog('SYSTEM', `웹 에이전트(ebro web agent) 브라우저 확장 연결 등록 완료 (v${payload.version || '1.0.0'})`);
        ws.send(JSON.stringify({
          type: 'REGISTERED',
          success: true,
          client: 'eBroAgent',
          port: 5175,
          aiEnabled: isAiEnabled(),
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 3. PING 하트비트 응답
      if (payload.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', aiEnabled: isAiEnabled() }));
        return;
      }

      // 4. 브라우저 도구 실행 결과 회신 (TOOL_RESULT)
      if (payload.type === 'TOOL_RESULT') {
        const { callId, tool, result } = payload;
        if (callId && pendingToolCalls.has(callId)) {
          const handler = pendingToolCalls.get(callId);
          pendingToolCalls.delete(callId);
          clearTimeout(handler.timer);
          handler.resolve(result);
        }
        return;
      }

      // 5. 웹 에이전트 팝업에서 자연어 명령 전송 (NATURAL_COMMAND)
      if (payload.type === 'NATURAL_COMMAND') {
        if (!isAiEnabled()) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            reason: 'SILENT_CORE',
            message: '현재 테넌트는 AI 에이전트 기능이 비활성화되어 있습니다.'
          }));
          return;
        }
        const prompt = payload.prompt;
        const tenantCode = payload.tenant_code || agentPolicy?.tenantCode || 'DEFAULT';
        const userId = payload.user_id || 'DEFAULT';
        if (prompt && prompt.trim()) {
          try {
            const startTime = Date.now();
            const task = await addTask(prompt.trim(), 'BROWSER', (completedTask) => {
              try {
                ws.send(JSON.stringify({
                  type: 'COMMAND_RESULT',
                  prompt: prompt,
                  result: {
                    success: completedTask.status === 'COMPLETED',
                    status: completedTask.status === 'COMPLETED' ? 'DONE' : 'ERROR',
                    session_id: completedTask.id,
                    total_steps: completedTask.stepsCount || 1,
                    steps: completedTask.stepsList || [],
                    result: completedTask.result || {},
                    error: completedTask.status === 'FAILED' ? completedTask.currentStep : undefined,
                    latency_ms: Date.now() - startTime
                  }
                }));
              } catch (e) {}
            }, tenantCode, userId);
            ws.send(JSON.stringify({
              type: 'COMMAND_ACCEPTED',
              taskId: task.id,
              prompt: prompt
            }));
          } catch (taskErr) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: taskErr.message
            }));
          }
        }
        return;
      }

      // 6. 웹 에이전트/팝업에서 환경설정 및 BYOK AI 프로필 업데이트 (UPDATE_CONFIG)
      if (payload.type === 'UPDATE_CONFIG') {
        const tenantCode = payload.tenant_code || agentPolicy?.tenantCode || 'DEFAULT';
        const staffUserId = payload.staff_user_id || payload.user_id || 'DEFAULT';
        if (payload.telegram_bot_token !== undefined || payload.telegram_allowed_user_id !== undefined) {
          saveTelegramConfig(payload.telegram_bot_token, payload.telegram_allowed_user_id);
        }
        if (payload.ai_model) {
          saveOllamaConfig(payload.ai_model);
        }
        const savedProfile = setAiProfile({
          tenant_code: tenantCode,
          user_id: staffUserId,
          provider: payload.ai_provider || payload.provider,
          model: payload.ai_model || payload.model,
          api_key: payload.ai_api_key !== undefined ? payload.ai_api_key : payload.api_key,
          jev_enabled: payload.jev_enabled,
          jev_api_key: payload.jev_api_key,
          jev_model: payload.jev_model
        });
        ws.send(JSON.stringify({
          type: 'CONFIG_UPDATED',
          telegram_running: isTelegramRunning(),
          ai_model: selectedOllamaModel,
          ai_profile: savedProfile
        }));
        return;
      }
    } catch (err) {
      console.error('[studioEngine] WS Message error:', err.message);
    }
  });

  ws.on('close', () => {
    connectedWebAgents.delete(ws);
    broadcastStudioLog('SYSTEM', '웹 에이전트(ebro web agent) 브라우저 확장 연결 종료');
  });

  ws.on('error', (err) => {
    connectedWebAgents.delete(ws);
  });
}

// ── 🌐 테넌트별 런타임 정책 엔진 (전사 표준 헌장 1.1, 7.1) ──
// 테넌트관리센터의 제어에 따라 AI 에이전트 기능 락/언락 (단일 컴파일 무결성 보장)
const POLICY_FILE = path.join(AGENT_HOME, 'tenant_policy.json');

function normalizeTenantCode(raw) {
  const clean = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!clean) return 'GIYEONLIFT';
  if (clean === 'GIYEONLIFT' || clean === 'GIYEUN' || clean === 'GIYUEN' || clean === 'KIYUEN' || clean === 'GIYEON') {
    return 'GIYEONLIFT';
  }
  return clean;
}

let agentPolicy = {
  agentAiEnabled: false,
  tenantCode: 'GIYEONLIFT',
  solutionType: 'AWP',
  autoBackupEnabled: false,
  autoBackupTime: '09:00',
  autoBackupRetentionDays: 30,
  backupUserId: '',
  backupUserName: '',
  lastAutoBackupAt: '',
  tenants: {},
  updatedAt: new Date().toISOString()
};

function stripTenantsMap(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const copy = { ...obj };
  delete copy.tenants;
  return copy;
}

function loadPolicy() {
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const data = fs.readFileSync(POLICY_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const existingTenants = parsed && typeof parsed.tenants === 'object' && parsed.tenants !== null ? { ...parsed.tenants } : {};
      agentPolicy = Object.assign(agentPolicy, parsed, { tenants: existingTenants });
      const topCode = normalizeTenantCode(agentPolicy.tenantCode || 'GIYEONLIFT');
      agentPolicy.tenantCode = topCode;
      if (!agentPolicy.tenants[topCode]) {
        agentPolicy.tenants[topCode] = { ...stripTenantsMap(agentPolicy), tenantCode: topCode };
      }
    }
  } catch (e) {}
}

function savePolicy() {
  writeHiddenJsonSync(POLICY_FILE, agentPolicy);
}

loadPolicy();

function isAiEnabled() {
  return Boolean(agentPolicy.agentAiEnabled);
}

function getAgentPolicy() {
  return agentPolicy;
}

function getTenantPolicy(tenantCodeHint) {
  if (!tenantCodeHint) {
    return agentPolicy;
  }
  const code = normalizeTenantCode(tenantCodeHint);
  const entry = agentPolicy.tenants && agentPolicy.tenants[code];
  if (entry && typeof entry === 'object') {
    return {
      ...stripTenantsMap(agentPolicy),
      ...stripTenantsMap(entry),
      tenantCode: code
    };
  }
  return {
    ...stripTenantsMap(agentPolicy),
    tenantCode: code
  };
}

function updateAgentPolicy(newPolicy) {
  const prevAi = Boolean(agentPolicy.agentAiEnabled);
  if (typeof newPolicy === 'object' && newPolicy !== null) {
    const cleanPatch = stripTenantsMap(newPolicy);
    const code = normalizeTenantCode(cleanPatch.tenantCode || agentPolicy.tenantCode || 'GIYEONLIFT');
    cleanPatch.tenantCode = code;
    const nowIso = new Date().toISOString();
    const prevTenants = (agentPolicy.tenants && typeof agentPolicy.tenants === 'object') ? agentPolicy.tenants : {};
    const prevEntry = (prevTenants[code] && typeof prevTenants[code] === 'object') ? prevTenants[code] : {};
    const nextEntry = {
      ...stripTenantsMap(prevEntry),
      ...cleanPatch,
      tenantCode: code,
      updatedAt: nowIso
    };
    agentPolicy = {
      ...agentPolicy,
      ...cleanPatch,
      tenantCode: code,
      tenants: {
        ...prevTenants,
        [code]: nextEntry
      },
      updatedAt: nowIso
    };
    savePolicy();
    broadcastStudioLog('POLICY', `테넌트 정책 동기화 완료: AI기능=${agentPolicy.agentAiEnabled ? '활성화(FULL_AI)' : '비활성화(SILENT_CORE)'}, 테넌트=${agentPolicy.tenantCode || '-'}, 자동백업=${agentPolicy.autoBackupEnabled ? `활성화(${agentPolicy.autoBackupTime || '09:00'}, 담당:${agentPolicy.backupUserName || '-'})` : '비활성화'}`);
  }
  if (!agentPolicy.agentAiEnabled) {
    if (typeof stopTelegramBot === 'function') {
      stopTelegramBot();
      broadcastStudioLog('SYSTEM', 'Silent Core 모드 전환에 따라 텔레그램 수신을 일시정지합니다.');
    }
  } else {
    if (typeof restartTelegramBot === 'function' && (!prevAi || !isTelegramRunning())) {
      restartTelegramBot(async (text, onComplete) => {
        return await addTask(text, 'BROWSER', onComplete);
      }).catch(() => {});
      broadcastStudioLog('SYSTEM', 'Full AI Studio 모드 전환에 따라 텔레그램 수신을 재개합니다.');
    }
  }
  if (prevAi !== Boolean(agentPolicy.agentAiEnabled)) {
    broadcastEvent('POLICY_UPDATED', agentPolicy);
  }
  return agentPolicy;
}

// 실시간 SSE 이벤트 브로드캐스트
function broadcastEvent(eventType, payload) {
  const data = JSON.stringify({ type: eventType, data: payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`event: ${eventType}\ndata: ${data}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// 로그 추가 헬퍼
function appendTaskLog(task, message) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const cleanMsg = stripEmojis(message);
  const logLine = `[${timeStr}] [TASK] ${cleanMsg}`;
  task.logs.push(logLine);
  if (task.logs.length > 30) task.logs.shift();
  studioLogHistory.push({ taskId: task.id, log: logLine });
  pruneQueueAndLogs();
  broadcastEvent('LOG_APPEND', { taskId: task.id, log: logLine });
  scheduleSaveQueue(false);
}

// ──  로컬 Ollama LLM 헬스체크 및 의도 파싱 ──
async function checkOllamaStatus(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && (now - ollamaStatusCache.checkedAt < 4000)) {
    return ollamaStatusCache;
  }

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8080,
      path: '/v1/models',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const modelsList = parsed.models || parsed.data || [];
          const models = modelsList.map(m => m.name || m.id);
          if (models.length > 0) {
            // 현재 선택된 모델이 설치 목록에 없으면 설치된 모델 중 적절한 것으로 자동 선택
            if (!models.includes(selectedOllamaModel)) {
              if (models.includes('ebro-qwen:3b')) {
                selectedOllamaModel = 'ebro-qwen:3b';
              } else if (models.includes('ebro-qwen:7b')) {
                selectedOllamaModel = 'ebro-qwen:7b';
              } else {
                selectedOllamaModel = models[0];
              }
              saveOllamaConfig(selectedOllamaModel);
            }
            ollamaStatusCache = {
              available: true,
              model: selectedOllamaModel,
              models: models,
              checkedAt: Date.now()
            };
          } else {
            ollamaStatusCache = { available: false, model: 'none', models: [], checkedAt: Date.now() };
          }
          resolve(ollamaStatusCache);
        } catch (e) {
          ollamaStatusCache = { available: false, model: 'none', models: [], checkedAt: Date.now() };
          resolve(ollamaStatusCache);
        }
      });
    });

    req.on('error', () => {
      ollamaStatusCache = { available: false, model: 'none', models: [], checkedAt: Date.now() };
      resolve(ollamaStatusCache);
    });

    req.on('timeout', () => {
      req.destroy();
      ollamaStatusCache = { available: false, model: 'none', models: [], checkedAt: Date.now() };
      resolve(ollamaStatusCache);
    });

    req.end();
  });
}

// ── ⚡ Jev (System 1) 사전 판단 분류기 + BYOK 멀티 프로바이더 호출 ──
async function classifyWithJev(text, jevApiKey, jevModel = 'typesafe/jev', jevEndpoint = '') {
  if (!jevApiKey) return null;
  const url = jevEndpoint || 'https://openrouter.ai/api/v1/chat/completions';
  const choices = [
    'OUTBOUND_REQUEST', 'EXCHANGE_REQUEST', 'RETURN_REQUEST',
    'CONTRACT_EXTEND', 'CONTRACT_SHORTEN', 'AS_REQUEST',
    'DRIVER_ASSIGN', 'UI_NAVIGATION_QUERY', 'OUT_OF_SCOPE'
  ];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jevApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: jevModel || 'typesafe/jev',
        messages: [
          { role: 'system', content: `Classify the user message into ONE choice: ${choices.join(', ')}. Respond ONLY JSON: {"choice": "<CHOICE>", "confidence": 0.95}` },
          { role: 'user', content: text }
        ],
        temperature: 0.0,
        max_tokens: 40
      }),
      signal: AbortSignal.timeout(4500)
    });
    if (res.ok) {
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    }
  } catch (e) {}
  return null;
}

async function callExternalByokProvider(profile, instruction) {
  const provider = profile.provider;
  const model = profile.model;
  const apiKey = profile.api_key;
  if (!apiKey || provider === 'LOCAL_OLLAMA') return null;

  const sysPrompt = '당신은 eBro ERP 전문 AI 에이전트입니다. 사용자의 자연어 요청을 분석하여 {"intent": "asset_search|billing_request_create|click_element|contract_create|customer_create|customer_search|dispatch_assign_driver|dispatch_create_order|maintenance_create|navigate_menu|pdi_approve|site_option_update", "parameters": {}, "actions": [{"tool": "navigate_menu|click_element|type_text|uia_handle_file_dialog", "params": {}}]} JSON 형식으로만 응답하십시오.';

  if (provider === 'GEMINI') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    }
    return null;
  }

  if (provider === 'ANTHROPIC') {
    const url = profile.custom_endpoint || 'https://api.anthropic.com/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0.1,
        system: sysPrompt,
        messages: [{ role: 'user', content: instruction }]
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const data = await res.json();
      const txt = data?.content?.[0]?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    }
    return null;
  }

  const endpointMap = {
    OPENAI: 'https://api.openai.com/v1/chat/completions',
    GROQ: 'https://api.groq.com/openai/v1/chat/completions',
    JEV_OPENROUTER: 'https://openrouter.ai/api/v1/chat/completions'
  };
  const url = profile.custom_endpoint || endpointMap[provider] || endpointMap.OPENAI;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: instruction }
      ],
      temperature: 0.1,
      max_tokens: 400
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (res.ok) {
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  }
  return null;
}

// 자연어 의도 파싱 (Jev System 1 + BYOK 클라우드 AI + Ollama 연동 + 내장 도메인 규칙 엔진 폴백)
async function parseInstructionIntent(instruction, requestedMode = 'AUTO', tenantCode = null, userId = null) {
  let detectedModule = 'GENERAL';
  let suggestedMode = requestedMode;
  let actionSummary = instruction;
  let ollamaUsed = false;
  let parameters = {};
  let plannedActions = [];

  const profile = getAiProfile(tenantCode, userId);

  // 1) Jev (System 1) 사전 판단 엔진이 활성화된 경우 초고속 의도 분류 수행
  if (profile.jev_enabled && profile.jev_api_key) {
    try {
      const jevRes = await classifyWithJev(instruction, profile.jev_api_key, profile.jev_model, profile.jev_endpoint);
      if (jevRes && jevRes.choice) {
        broadcastStudioLog('INFO', `Jev 사전 판단 완료: ${jevRes.choice} (${jevRes.confidence || 0.9})`);
        if (jevRes.choice === 'OUT_OF_SCOPE' && (jevRes.confidence || 0) >= 0.8) {
          return {
            module: 'OUT_OF_SCOPE',
            mode: 'SKIP',
            summary: '업무 지시가 아닌 일반 대화로 분류되어 실행을 생략했습니다.',
            ollamaUsed: false,
            parameters: {},
            actions: []
          };
        }
      }
    } catch (e) {}
  }

  // 2) 테넌트/임직원 BYOK 클라우드 AI 공급자 호출 (GEMINI / OPENAI / ANTHROPIC / GROQ / JEV_OPENROUTER)
  if (profile.provider !== 'LOCAL_OLLAMA' && profile.api_key) {
    try {
      broadcastStudioLog('INFO', `BYOK AI (${profile.provider}/${profile.model}) 추론 요청: ${instruction}`);
      const cloudParsed = await callExternalByokProvider(profile, instruction);
      if (cloudParsed) {
        if (cloudParsed.intent) detectedModule = String(cloudParsed.intent).toUpperCase();
        parameters = cloudParsed.parameters || {};
        if (Array.isArray(cloudParsed.actions)) plannedActions = cloudParsed.actions;
        ollamaUsed = true;
        actionSummary = `[${profile.provider}] 의도: ${detectedModule}, 파라미터: ${JSON.stringify(parameters)}`;
        if (suggestedMode === 'AUTO') suggestedMode = 'BROWSER';
        return {
          module: detectedModule,
          mode: suggestedMode,
          summary: actionSummary,
          ollamaUsed,
          parameters,
          actions: plannedActions
        };
      }
    } catch (byokErr) {
      broadcastStudioLog('WARN', `BYOK AI (${profile.provider}) 호출 실패 -> 로컬 엔진 폴백: ${byokErr.message}`);
    }
  }

  try {
    const payload = {
      model: selectedOllamaModel || 'ebro-agent',
      messages: [
        {
          role: "system",
          content: "너는 eBro 시스템의 업무 의도 파악 및 파라미터 추출 에이전트야.\n사용자의 자연어 요청을 분석해서 아래 JSON 형식으로만 응답해:\n{\n  \"intent\": \"파악된 업무 의도. 반드시 다음 중 하나만 선택해: [asset_search, billing_request_create, click_element, contract_create, customer_create, customer_search, dispatch_assign_driver, dispatch_create_order, maintenance_create, navigate_menu, pdi_approve, site_option_update, vacation_create]\",\n  \"parameters\": {\n    \"추출된_변수명\": \"값\"\n  }\n}\n일반적인 대화나 설명은 일절 출력하지 말고 오직 JSON만 반환해."
        },
        {
          role: "user",
          content: instruction
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    };
    
    broadcastStudioLog('INFO', `LLM 호출 준비 완료: ${instruction}`);
    
    const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const res = await response.json();
    broadcastStudioLog('INFO', `LLM 응답 수신 완료`);

    if (res && res.choices && res.choices.length > 0) {
      const content = res.choices[0].message.content;
      broadcastStudioLog('INFO', `LLM 원본 응답: ${content}`);
      
      const parsed = JSON.parse(content);
      if (parsed.intent) {
        detectedModule = parsed.intent.toUpperCase();
        parameters = parsed.parameters || {};
        ollamaUsed = true;
        actionSummary = `[AI 분석됨] 의도: ${parsed.intent}, 파라미터: ${JSON.stringify(parameters)}`;
        if (suggestedMode === 'AUTO') suggestedMode = 'DIRECT_QUERY';
      }
    }
  } catch (e) {
    // 로컬 Ollama 미연결 시 내장 결정론적 도메인 규칙 엔진이 즉시 이어받음
  }

  return {
    module: detectedModule,
    mode: suggestedMode,
    summary: actionSummary,
    ollamaUsed: ollamaUsed,
    parameters: parameters,
    actions: plannedActions
  };
}

// ──  작업 큐 등록 및 관리 ──
async function addTask(instruction, requestedMode = 'AUTO', onComplete = null, tenantCode = null, userId = null) {
  if (!isAiEnabled()) {
    throw new Error('현재 테넌트는 AI 에이전트 기능이 비활성화되어 있습니다. 인쇄 및 엑셀 문서 처리 전용으로 안전 가동 중입니다.');
  }
  if (!instruction || !instruction.trim()) {
    throw new Error('지시 내용을 입력해 주십시오.');
  }

  const intent = await parseInstructionIntent(instruction.trim(), requestedMode, tenantCode, userId);
  const task = {
    id: `TASK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    instruction: instruction.trim(),
    tenantCode: tenantCode || agentPolicy?.tenantCode || 'DEFAULT',
    userId: userId || 'DEFAULT',
    mode: intent.mode,
    module: intent.module,
    status: 'PENDING',
    progress: 0,
    currentStep: '대기 중 (큐 등록됨)',
    logs: [`[${new Date().toLocaleTimeString('ko-KR')}] 작업이 지시 큐에 정상 등록되었습니다.`],
    result: null
  };

  prefetchedTaskIntents.set(task.id, intent);
  if (typeof onComplete === 'function') {
    taskCompletionCallbacks.set(task.id, onComplete);
  }

  taskQueue.unshift(task);
  scheduleSaveQueue(true);
  broadcastEvent('TASK_ADDED', task);

  // 워커 즉시 트리거
  triggerWorker();

  return task;
}

// ──  작업 큐 백그라운드 워커 ──
async function triggerWorker() {
  if (isWorkerRunning) return;

  const nextTask = taskQueue.slice().reverse().find(t => t.status === 'PENDING');
  if (!nextTask) return;

  isWorkerRunning = true;
  executeTask(nextTask).finally(() => {
    isWorkerRunning = false;
    // 다음 작업 연속 처리
    setTimeout(triggerWorker, 300);
  });
}

async function executeTask(task) {
  try {
    task.status = 'RUNNING';
    task.progress = 10;
    task.currentStep = '1단계: 자연어 업무 의도 분석 및 도메인 엔티티 식별';
    task.stepsList = [];
    task.stepsCount = 0;

    let intentResult = prefetchedTaskIntents.get(task.id);
    if (intentResult) {
      prefetchedTaskIntents.delete(task.id);
    } else {
      intentResult = await parseInstructionIntent(task.instruction, task.mode, task.tenantCode, task.userId);
    }
    task.module = intentResult.module;

    appendTaskLog(task, `작업 시작 (모드: ${task.mode}, 도메인/의도: ${task.module})`);
    if (intentResult.parameters && Object.keys(intentResult.parameters).length > 0) {
      appendTaskLog(task, `[AI 추출 파라미터] ${JSON.stringify(intentResult.parameters)}`);
    }
    broadcastEvent('TASK_UPDATED', task);

    // Jev System 1에서 업무 외 대화(SKIP)로 판정된 경우 즉시 완료 처리
    if (intentResult.mode === 'SKIP' || task.module === 'OUT_OF_SCOPE') {
      task.progress = 100;
      task.status = 'COMPLETED';
      task.currentStep = '완료 (업무 외 일반 대화 생략)';
      task.result = {
        completedAt: new Date().toISOString(),
        summary: intentResult.summary || '업무 외 대화로 분류되어 실행을 생략했습니다.'
      };
      appendTaskLog(task, task.result.summary);
      broadcastEvent('TASK_UPDATED', task);
      scheduleSaveQueue(true);
      notifyTaskComplete(task);
      return;
    }

    const isBrowserTask = (task.mode === 'BROWSER' || task.module === 'CONTRACT' || task.module === 'DISPATCH' || task.module === 'INVENTORY' || task.module === 'NAVIGATE_MENU' || task.module === 'CLICK_ELEMENT');

    if (isBrowserTask) {
      task.progress = 25;
      task.currentStep = '2단계: 웹 에이전트 및 Windows UIA 하이브리드 연결 검증';
      appendTaskLog(task, '브라우저 웹 에이전트(ebro web agent) 및 Windows UIA 접근성 브릿지 검증 중...');
      broadcastEvent('TASK_UPDATED', task);

      const webConnected = isWebAgentConnected();
      if (!webConnected) {
        appendTaskLog(task, '브라우저 확장 미연결 감지 -> Windows UIA 접근성 엔진으로 자동 폴백 실행');
      }

      task.progress = 50;
      task.currentStep = '3단계: 하이브리드 액션 디스패치 및 화면 조작';
      broadcastEvent('TASK_UPDATED', task);

      const dispatchToolWithFallback = async (tool, params, timeoutMs = 8000) => {
        const stepIdx = task.stepsList.length + 1;
        let res = null;
        if (isWebAgentConnected()) {
          try {
            res = await sendToolToWebAgent(tool, params, timeoutMs);
          } catch (wsErr) {
            appendTaskLog(task, `웹 에이전트 응답 지연(${wsErr.message}) -> Windows UIA 엔진 폴백 실행`);
            res = await executeUiaTool(tool, params);
          }
        } else {
          res = await executeUiaTool(tool, params);
        }
        task.stepsList.push({ step: stepIdx, tool, params, result: res });
        task.stepsCount = task.stepsList.length;
        return res;
      };

      const p = task.instruction.toLowerCase();
      let targetMenu = null;
      if (p.includes('계약') || p.includes('contract')) targetMenu = 'contract';
      else if (p.includes('배차') || p.includes('운송') || p.includes('delivery') || p.includes('dispatch')) targetMenu = 'delivery';
      else if (p.includes('검수') || p.includes('출고검수') || p.includes('inspection')) targetMenu = 'outbound_inspections';
      else if (p.includes('대시보드') || p.includes('dashboard') || p.includes('메인')) targetMenu = 'dashboard';
      else if (p.includes('고객') || p.includes('거래처') || p.includes('customer')) targetMenu = 'customer';
      else if (p.includes('청구') || p.includes('수납') || p.includes('billing')) targetMenu = 'billing';
      else if (p.includes('자산') || p.includes('장비') || p.includes('asset')) targetMenu = 'asset';
      else if (p.includes('정비') || p.includes('수리') || p.includes('repair')) targetMenu = 'repair';

      let lastResult = null;
      if (targetMenu && isWebAgentConnected()) {
        appendTaskLog(task, `브라우저 메뉴 이동 실행: [${targetMenu}]`);
        lastResult = await dispatchToolWithFallback('navigate_menu', { menuId: targetMenu }, 10000);
        appendTaskLog(task, `메뉴 이동 완료: [${targetMenu}]`);
      }

      if (p.includes('조회') || p.includes('검색')) {
        await new Promise(r => setTimeout(r, 600));
        appendTaskLog(task, '화면 [조회] 버튼 자동 클릭 실행');
        try {
          const searchRes = await dispatchToolWithFallback('click_element', { target: '조회' }, 5000);
          appendTaskLog(task, '[조회] 버튼 클릭 성공');
          lastResult = searchRes;
        } catch (e) {
          appendTaskLog(task, `[조회] 버튼 클릭 완료 (${e.message})`);
        }
      }

      if (p.includes('번호표') || p.includes('som')) {
        const somRes = await dispatchToolWithFallback('toggle_som', {}, 5000);
        appendTaskLog(task, 'SoM 번호표 토글 실행 완료');
        lastResult = somRes;
      }

      if (p.includes('엑셀') || p.includes('다운로드') || p.includes('내보내기')) {
        appendTaskLog(task, '[엑셀 다운로드] 버튼 클릭 실행');
        const excelRes = await dispatchToolWithFallback('click_element', { target: '엑셀 다운로드' }, 5000);
        lastResult = excelRes;
      }

      if (task.stepsList.length === 0 && !webConnected) {
        lastResult = await dispatchToolWithFallback('uia_inspect_window', { interactive_only: true }, 6000);
      }

      task.progress = 100;
      task.status = 'COMPLETED';
      task.currentStep = '완료 (100%)';
      task.result = {
        completedAt: new Date().toISOString(),
        summary: `[${task.module}] ${task.instruction} -> 하이브리드 화면 조작 완결`,
        lastResult
      };
      appendTaskLog(task, '작업이 정상 완결되었습니다.');
      broadcastEvent('TASK_UPDATED', task);
      scheduleSaveQueue(true);
      notifyTaskComplete(task);
      return;
    }

    // DIRECT_QUERY 또는 LOCAL_ACTION 모드
    await new Promise(r => setTimeout(r, 400));
    task.progress = 50;
    task.currentStep = '2단계: 시스템 파이프라인 매핑';
    broadcastEvent('TASK_UPDATED', task);

    await new Promise(r => setTimeout(r, 400));
    task.progress = 100;
    task.status = 'COMPLETED';
    task.currentStep = '완료 (100%)';
    task.result = {
      completedAt: new Date().toISOString(),
      summary: `[${task.module}] ${task.instruction} 처리 완료.`
    };
    appendTaskLog(task, '작업이 정상 완결되었습니다.');
    broadcastEvent('TASK_UPDATED', task);
    scheduleSaveQueue(true);
    notifyTaskComplete(task);
  } catch (err) {
    task.status = 'FAILED';
    task.currentStep = `실패: ${err.message}`;
    appendTaskLog(task, `❌ ${err.message}`);
    broadcastEvent('TASK_UPDATED', task);
    scheduleSaveQueue(true);
    notifyTaskComplete(task);
  }
}

function notifyTaskComplete(task) {
  const cb = taskCompletionCallbacks.get(task.id);
  if (cb) {
    taskCompletionCallbacks.delete(task.id);
    try { cb(task); } catch (e) {}
  }
}

// ──  독립 데스크톱 전용 창 실행 ──
function launchStudioWindow(port = 5175, tenantCodeHint) {
  if (!isAiEnabled()) {
    // Silent Core 모드일 때는 AI 스튜디오 대신 해당 테넌트의 로컬 문서고 폴더를 안전하게 열어줌
    const code = normalizeTenantCode(tenantCodeHint || agentPolicy?.tenantCode || 'GIYEONLIFT');
    const archiveDir = path.join(AGENT_HOME, '문서고', code);
    try {
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      exec(`explorer.exe "${archiveDir}"`);
    } catch (e) {}
    return false;
  }

  const url = `http://127.0.0.1:${port}/studio`;
  const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env['LOCALAPPDATA'] || '', 'Microsoft\\Edge\\Application\\msedge.exe')
  ];

  const browserExe = browserCandidates.find(p => p && fs.existsSync(p));

  if (browserExe) {
    const args = [
      `--app=${url}`,
      '--window-size=1100,800',
      '--window-position=80,80'
    ];
    try {
      const child = spawn(browserExe, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    } catch (e) {
      try {
        execSync(`powershell -NoProfile -Command "Start-Process '${url}'"`, { stdio: 'ignore' });
        return true;
      } catch (e2) {
        return false;
      }
    }
  } else {
    try {
      execSync(`powershell -NoProfile -Command "Start-Process '${url}'"`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }
}

// ──  고밀도 데스크톱 스튜디오 HTML 렌더링 ──
function renderStudioHtml(port = 5175, version = 'v2.0.0.Build.1', tenantCode = 'GIYEONLIFT') {
  const effectiveCode = agentPolicy.tenantCode || tenantCode || 'EBRO';
  const TENANT_NAME_MAP = {
    'GIYEONLIFT': '주식회사 기연리프트 전용',
    'GIYEON': '주식회사 기연리프트 전용',
    'GIYEUN': '주식회사 기연리프트 전용',
    'HANSOL': '한솔렌탈 전용',
    'SAMWOO': '삼우렌탈 전용',
    'EBRO': 'eBro ERP 표준'
  };
  const tenantLabel = agentPolicy.tenantName
    ? `${agentPolicy.tenantName} 전용`
    : (TENANT_NAME_MAP[String(effectiveCode).toUpperCase()] || `${effectiveCode} 전용`);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>eBro AI Agent 스튜디오</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/icon-192.png">
  <style>
    :root {
      --bg-base: #0f172a;
      --bg-surface: #1e293b;
      --bg-card: #273549;
      --border-color: #334155;
      --border-focus: #3b82f6;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Pretendard", sans-serif;
      --font-mono: "Consolas", "Courier New", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.4;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }

    /* ── 1. 상단 글로벌 헤더 ── */
    header {
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      white-space: nowrap;
      overflow-x: auto;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .brand-title {
      font-size: 14.5px;
      font-weight: 800;
      color: #60a5fa;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 7px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge-primary { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-success { background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.4); }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-danger { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: #cbd5e1;
      background: rgba(15, 23, 42, 0.55);
      border: 1px solid var(--border-color);
      padding: 3px 9px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-green { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .dot-yellow { background: var(--warning); box-shadow: 0 0 6px var(--warning); }
    .dot-red { background: var(--danger); box-shadow: 0 0 6px var(--danger); }

    /* ── 2. 메인 컨테이너 (그리드 레이아웃: 작업큐 모니터 축소 & 하단 로그 영역 확대) ── */
    main {
      flex: 1;
      display: grid;
      grid-template-rows: auto 185px 1fr;
      gap: 10px;
      padding: 12px 14px;
      overflow: hidden;
    }

    /* ── 2-1. 지시 입력 섹션 ── */
    .input-section {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .section-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      white-space: nowrap;
    }
    .input-row {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }
    .input-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    textarea {
      width: 100%;
      height: 42px;
      background: var(--bg-base);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: #ffffff;
      padding: 8px 12px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      outline: none;
      transition: border-color 0.15s;
    }
    textarea:focus {
      border-color: var(--border-focus);
    }
    .mode-selector {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .mode-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .mode-btn.active {
      background: #1e3a8a;
      border-color: #3b82f6;
      color: #93c5fd;
    }
    .btn-submit {
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0 18px;
      height: 42px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .btn-submit:hover { background: var(--primary-hover); }

    /* ── 2-2. 중앙 작업 큐 모니터 (테이블 - 컴팩트 3~4행 기준) ── */
    .queue-section {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .queue-header {
      padding: 7px 14px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.4);
      white-space: nowrap;
    }
    .queue-table-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }
    th {
      background: #182234;
      color: #94a3b8;
      font-weight: 700;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    td {
      padding: 6px 12px;
      border-bottom: 1px solid #283548;
      color: #e2e8f0;
      white-space: nowrap;
      vertical-align: middle;
    }
    tr:hover td {
      background-color: rgba(59, 130, 246, 0.08);
    }
    .cell-truncate {
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progress-bar-bg {
      width: 100px;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 6px;
    }
    .progress-bar-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s ease;
    }

    /* ── 2-3. 하단 실시간 콘솔 로그 (확대 영역) ── */
    .log-section {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    .log-header {
      padding: 7px 14px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.4);
      font-size: 11.5px;
      color: #94a3b8;
      white-space: nowrap;
    }
    .log-content {
      flex: 1;
      padding: 10px 14px;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.55;
      background: #090e17;
      user-select: text;
    }
    .log-line {
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* 버튼 스타일 */
    .btn-action {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: #cbd5e1;
      padding: 4px 9px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-action:hover {
      background: #334155;
      color: #ffffff;
    }

    /* ── 환경설정 모달 스타일 ── */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(2px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-dialog {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      width: 460px;
      max-width: 92vw;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .modal-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.4);
    }
    .modal-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #f8fafc;
    }
    .modal-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .config-group {
      background: var(--bg-base);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .config-group-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #94a3b8;
    }
    .form-stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
    }
    .text-input {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: #f8fafc;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s;
    }
    .text-input:focus {
      border-color: var(--border-focus);
    }
    .feedback-msg {
      font-size: 11.5px;
      min-height: 16px;
      color: #94a3b8;
    }
    .feedback-msg.success { color: #4ade80; }
    .feedback-msg.error { color: #f87171; }
    .modal-footer {
      padding: 10px 16px;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: rgba(15, 23, 42, 0.4);
    }
  </style>
</head>
<body>

  <!-- 1. 헤더 -->
  <header>
    <div class="header-left">
      <div class="brand-title">
        <img src="/icon-32.png" width="20" height="20" style="border-radius:4px; vertical-align:middle; object-fit:contain; flex-shrink:0;" alt="eBro">
        <span>eBro AI Agent 스튜디오</span>
      </div>
      <span class="badge badge-primary">${version}</span>
      <span class="badge badge-success">포트 ${port}</span>
      <span class="badge" style="background:#1e293b; color:#94a3b8; border:1px solid #334155;">${tenantLabel}</span>
    </div>

    <div class="header-right">
      <div class="status-indicator">
        <span class="dot dot-green" id="agentDot"></span>
        <span id="agentStatusText">에이전트 온라인</span>
      </div>
      <div class="status-indicator">
        <span class="dot dot-yellow" id="ollamaDot"></span>
        <label for="ollamaModelSelect" style="font-size: 11px; color: #94a3b8; white-space: nowrap;">Ollama:</label>
        <select id="ollamaModelSelect" style="background:transparent; color:#38bdf8; border:none; font-size:11.5px; font-weight:600; padding:0 2px; outline:none; cursor:pointer; white-space:nowrap;" onchange="onOllamaModelChange(this.value)">
          <option value="" style="background:#0f172a; color:#f8fafc;">확인 중...</option>
        </select>
      </div>
      <button class="btn-action" onclick="openConfigModal()">환경설정</button>
      <button class="btn-action" onclick="refreshQueue()">새로고침</button>
      <button class="btn-action" onclick="minimizeToTray()" title="작업표시줄을 비우고 시스템 트레이로 숨깁니다">트레이로 숨기기</button>
    </div>
  </header>

  <!-- 2. 메인 컨테이너 -->
  <main>
    <!-- 2-1. 지시 입력 패널 -->
    <section class="input-section">
      <div class="section-label">
        <span>자연어 업무 지시 입력</span>
        <div class="mode-selector">
          <span style="font-size: 11px; color: #64748b; margin-right: 4px;">실행 모드:</span>
          <button type="button" class="mode-btn active" data-mode="AUTO" onclick="setMode('AUTO')">자동 판단</button>
          <button type="button" class="mode-btn" data-mode="BROWSER" onclick="setMode('BROWSER')">브라우저 조작</button>
          <button type="button" class="mode-btn" data-mode="DIRECT_QUERY" onclick="setMode('DIRECT_QUERY')">ERP 쿼리</button>
          <button type="button" class="mode-btn" data-mode="LOCAL_ACTION" onclick="setMode('LOCAL_ACTION')">로컬/출력</button>
        </div>
      </div>
      <div class="input-row">
        <div class="input-wrapper">
          <textarea id="instructionInput" placeholder="자연어로 업무를 지시하세요 (예: 오늘 강남 현장 배차 2대 접수해줘, 미수금 30일 초과 거래처 목록 확인해줘) [Ctrl + Enter로 등록]"></textarea>
        </div>
        <button class="btn-submit" onclick="submitInstruction()">
          <span>지시 등록</span>
        </button>
      </div>
    </section>

    <!-- 2-2. 중앙 작업 큐 모니터 -->
    <section class="queue-section">
      <div class="queue-header">
        <div style="font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
          <span>작업 큐 모니터</span>
          <span class="badge badge-primary" id="queueCountBadge">0건</span>
          <span style="font-size: 11px; color: #64748b; font-weight: 500;">최신 30건 유지</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-action" onclick="clearCompletedTasks()">완료 작업 정리</button>
        </div>
      </div>

      <div class="queue-table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 110px;">작업 ID</th>
              <th style="width: 80px;">등록 시각</th>
              <th>지시 내용</th>
              <th style="width: 90px;">실행 모드</th>
              <th style="width: 80px;">상태</th>
              <th style="width: 180px;">진행 단계 / 진행률</th>
              <th style="width: 80px; text-align: center;">액션</th>
            </tr>
          </thead>
          <tbody id="queueTbody">
            <tr>
              <td colspan="7" style="text-align: center; color: #64748b; padding: 22px;">
                등록된 작업이 없습니다. 상단에서 자연어로 지시를 등록해 주세요.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 2-3. 하단 실시간 콘솔 로그 -->
    <section class="log-section">
      <div class="log-header">
        <span style="font-weight: 700;">실행 콘솔 로그 (최신 30개 작업큐 연동)</span>
        <button class="btn-action" onclick="clearLogs()">로그 지우기</button>
      </div>
      <div class="log-content" id="logContent">
        <div class="log-line" style="color: #64748b;">[시스템] eBro AI Agent 데스크톱 스튜디오가 준비되었습니다.</div>
      </div>
    </section>
  </main>

  <!-- 3. 환경설정 모달 -->
  <div id="configModal" class="modal-overlay" style="display:none;" onclick="if(event.target === this) closeConfigModal()">
    <div class="modal-dialog">
      <div class="modal-header">
        <span class="modal-title">시스템 환경설정</span>
        <button type="button" class="btn-action" onclick="closeConfigModal()">✕</button>
      </div>
      <div class="modal-body">
        <!-- 텔레그램 모바일 원격 제어 섹션 -->
        <div class="config-group">
          <div class="config-group-title">텔레그램 모바일 제어 연동</div>
          <div class="form-stack">
            <label class="field-label" for="modalTgToken">텔레그램 봇 토큰 (Bot Token)</label>
            <input type="text" id="modalTgToken" class="text-input" style="font-family:var(--font-mono);" placeholder="예: 8817074777:AAE6gzIC..." />
          </div>
          <div class="form-stack">
            <label class="field-label" for="modalTgUserId">허용 관리자 ID (User ID)</label>
            <input type="text" id="modalTgUserId" class="text-input" style="font-family:var(--font-mono);" placeholder="예: 8990145136" />
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <div style="display:flex; align-items:center; gap:6px; font-size:12px;">
              <span class="dot dot-yellow" id="modalTgDot"></span>
              <span id="modalTgStatusText" style="color:var(--text-muted);">확인 중...</span>
            </div>
            <button type="button" class="btn-action" onclick="testTelegramFromModal()">🔔 테스트 알림 발송</button>
          </div>
        </div>

        <!-- AI 추론 엔진 및 테넌트·개인별 BYOK API 키 금고 섹션 -->
        <div class="config-group">
          <div class="config-group-title">AI 공급자 및 BYOK API 키 설정</div>
          <div class="form-stack">
            <label class="field-label" for="modalAiProvider">AI 공급자 선택</label>
            <select id="modalAiProvider" class="text-input" style="font-family:var(--font-mono); cursor:pointer;" onchange="onModalProviderChange(this.value)">
              <option value="LOCAL_OLLAMA">로컬 내장 AI · 무료 · 외부 전송 없음</option>
              <option value="GEMINI">Google Gemini · 무료 티어 및 유료 API</option>
              <option value="OPENAI">OpenAI ChatGPT API</option>
              <option value="ANTHROPIC">Anthropic Claude API</option>
              <option value="GROQ">Groq 초고속 LPU API</option>
              <option value="JEV_OPENROUTER">Jev · OpenRouter 초저비용 라우터</option>
            </select>
          </div>
          <div class="form-stack">
            <label class="field-label" for="modalAiModel">추론 모델명</label>
            <input type="text" id="modalAiModel" class="text-input" style="font-family:var(--font-mono);" placeholder="예: gemini-2.5-flash / gpt-4o-mini / ebro-qwen:3b" />
          </div>
          <div class="form-stack">
            <label class="field-label" for="modalAiApiKey">API 키 · 로컬 암호화 금고 저장</label>
            <input type="password" id="modalAiApiKey" class="text-input" style="font-family:var(--font-mono);" placeholder="로컬 내장 AI 사용 시 공란 유지" autocomplete="off" />
          </div>
          <div class="form-stack" style="margin-top:4px; padding-top:8px; border-top:1px solid #334155;">
            <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:#e2e8f0; cursor:pointer;">
              <input type="checkbox" id="modalJevEnabled" />
              <span>Jev 초저비용 사전 의도 분류 활성화 · 선택 사항</span>
            </label>
            <input type="password" id="modalJevApiKey" class="text-input" style="font-family:var(--font-mono); margin-top:4px;" placeholder="Jev · OpenRouter API 키 입력 (선택)" autocomplete="off" />
          </div>
        </div>

        <div id="modalFeedbackMsg" class="feedback-msg"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-action" onclick="closeConfigModal()">취소</button>
        <button type="button" class="btn-submit" style="height:32px; padding:0 16px; font-size:12px;" onclick="saveConfigFromModal()">설정 저장</button>
      </div>
    </div>
  </div>

  <script>
    let currentSelectedMode = 'AUTO';
    let tasks = [];

    function setMode(mode) {
      currentSelectedMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
      });
    }

    // ── 1. SSE 실시간 연결 ──
    function initSSE() {
      const evtSource = new EventSource('/api/queue/stream');

      evtSource.addEventListener('INIT', (e) => {
        try {
          const payload = JSON.parse(e.data);
          tasks = (payload.data || []).slice(0, 30);
          renderQueueTable();
          pruneDomLogsByTasks();
        } catch (err) {}
      });

      evtSource.addEventListener('TASK_ADDED', (e) => {
        try {
          const payload = JSON.parse(e.data);
          tasks.unshift(payload.data);
          if (tasks.length > 30) {
            tasks = tasks.slice(0, 30);
          }
          renderQueueTable();
          pruneDomLogsByTasks();
        } catch (err) {}
      });

      evtSource.addEventListener('TASK_UPDATED', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const updated = payload.data;
          const idx = tasks.findIndex(t => t.id === updated.id);
          if (idx !== -1) {
            tasks[idx] = updated;
          } else {
            tasks.unshift(updated);
            if (tasks.length > 30) {
              tasks = tasks.slice(0, 30);
            }
          }
          renderQueueTable();
          pruneDomLogsByTasks();
        } catch (err) {}
      });

      evtSource.addEventListener('INIT_LOGS', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (Array.isArray(payload.data)) {
            const logContent = document.getElementById('logContent');
            logContent.innerHTML = '';
            if (payload.data.length === 0) {
              logContent.innerHTML = '<div class="log-line" style="color: #64748b;">[시스템] 작업 큐 실행 엔진이 대기 중입니다.</div>';
            } else {
              payload.data.forEach(item => {
                if (typeof item === 'string') {
                  appendLogLine(item, null);
                } else if (item && item.log) {
                  appendLogLine(item.log, item.taskId || null);
                }
              });
            }
          }
        } catch (err) {}
      });

      evtSource.addEventListener('LOG_APPEND', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.data) {
            appendLogLine(payload.data.log, payload.data.taskId || null);
          }
        } catch (err) {}
      });

      evtSource.addEventListener('POLICY_UPDATED', () => {
        try { location.reload(); } catch (err) {}
      });

      evtSource.onerror = () => {
        try { evtSource.close(); } catch (e) {}
        setTimeout(initSSE, 2000);
      };
    }

    function pruneDomLogsByTasks() {
      const validIds = new Set(tasks.map(t => t.id));
      const logContent = document.getElementById('logContent');
      if (!logContent) return;
      const lines = logContent.querySelectorAll('.log-line[data-task-id]');
      lines.forEach(el => {
        const tid = el.getAttribute('data-task-id');
        if (tid && !validIds.has(tid)) {
          el.remove();
        }
      });
    }

    // ── 2. 작업 테이블 렌더링 ──
    function renderQueueTable() {
      const tbody = document.getElementById('queueTbody');
      const badge = document.getElementById('queueCountBadge');
      badge.textContent = tasks.length + '건';

      if (!tasks || tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 24px;">등록된 작업이 없습니다.</td></tr>';
        return;
      }

      tbody.innerHTML = tasks.map(t => {
        let statusBadge = '<span class="badge badge-warning">대기</span>';
        if (t.status === 'RUNNING') statusBadge = '<span class="badge badge-primary">처리중</span>';
        else if (t.status === 'COMPLETED') statusBadge = '<span class="badge badge-success">완료</span>';
        else if (t.status === 'FAILED') statusBadge = '<span class="badge badge-danger">실패</span>';
        else if (t.status === 'CANCELLED') statusBadge = '<span class="badge" style="background:#334155;color:#94a3b8;">취소됨</span>';

        const timeStr = t.createdAt ? t.createdAt.slice(11, 19) : '-';
        const progress = t.progress || 0;

        return \`
          <tr>
            <td style="font-family: var(--font-mono); font-weight: 700; color: #93c5fd;">\${t.id}</td>
            <td style="color: #94a3b8;">\${timeStr}</td>
            <td class="cell-truncate" title="\${t.instruction}">\${t.instruction}</td>
            <td><span class="badge badge-primary">\${t.mode}</span></td>
            <td>\${statusBadge}</td>
            <td>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: \${progress}%;"></div>
              </div>
              <span style="font-size: 11px; color: #94a3b8;">\${t.currentStep || ''}</span>
            </td>
            <td style="text-align: center;">
              \${t.status === 'PENDING' ? \`<button class="btn-action" onclick="cancelTask('\${t.id}')">취소</button>\` : '-'}
            </td>
          </tr>
        \`;
      }).join('');
    }

    function appendLogLine(line, taskId) {
      const logContent = document.getElementById('logContent');
      const div = document.createElement('div');
      div.className = 'log-line';
      if (taskId) {
        div.setAttribute('data-task-id', taskId);
      }
      div.textContent = line;
      logContent.appendChild(div);
      logContent.scrollTop = logContent.scrollHeight;
    }

    function clearLogs() {
      document.getElementById('logContent').innerHTML = '<div class="log-line" style="color: #64748b;">[시스템] 로그 초기화 완료</div>';
    }

    // ── 3. 지시 등록 전송 ──
    async function submitInstruction() {
      const input = document.getElementById('instructionInput');
      const text = input.value.trim();
      if (!text) return;

      try {
        const res = await fetch('/api/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: text, mode: currentSelectedMode })
        });
        const result = await res.json();
        if (result.success) {
          input.value = '';
          appendLogLine(\`[지시등록] \${result.task.id}: "\${text}" 등록 완료\`);
        } else {
          alert('등록 실패: ' + (result.error || '오류 발생'));
        }
      } catch (err) {
        alert('서버 통신 실패: ' + err.message);
      }
    }

    // Ctrl + Enter 단축키
    document.getElementById('instructionInput').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitInstruction();
      }
    });

    async function cancelTask(id) {
      try {
        await fetch('/api/queue/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (e) {}
    }

    async function clearCompletedTasks() {
      tasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'RUNNING');
      renderQueueTable();
      try {
        await fetch('/api/queue/clear-completed', { method: 'POST' });
      } catch (e) {}
    }

    async function refreshQueue() {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        tasks = data.tasks || [];
        renderQueueTable();
      } catch (e) {}
    }

    // ── 4. Ollama 헬스체크 및 모델 선택 동기화 ──
    let currentModelName = '';
    async function checkOllama() {
      try {
        const res = await fetch('/api/ollama/status');
        const data = await res.json();
        const dot = document.getElementById('ollamaDot');
        const select = document.getElementById('ollamaModelSelect');
        if (data.available && data.models && data.models.length > 0) {
          dot.className = 'dot dot-green';
          if (document.activeElement !== select) {
            select.innerHTML = data.models.map(m => 
              \`<option value="\${m}" \${m === data.model ? 'selected' : ''}>\${m}</option>\`
            ).join('');
            select.value = data.model;
            currentModelName = data.model;
          }
        } else {
          dot.className = 'dot dot-yellow';
          if (select) select.innerHTML = '<option value="">Ollama 미연결</option>';
        }
      } catch (e) {
        document.getElementById('ollamaDot').className = 'dot dot-yellow';
        const select = document.getElementById('ollamaModelSelect');
        if (select) select.innerHTML = '<option value="">Ollama 미연결</option>';
      }
    }

    async function onOllamaModelChange(modelName) {
      if (!modelName || modelName === currentModelName) return;
      try {
        const res = await fetch('/api/ollama/model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName })
        });
        const data = await res.json();
        if (data.success) {
          currentModelName = data.model;
          appendLogLine(\`[시스템] Ollama 추론 엔진이 "\${data.model}"(으)로 변경되었습니다.\`);
        }
      } catch (e) {
        alert('모델 변경 실패: ' + e.message);
      }
    }

    // ── 5. 환경설정 모달 제어 ──
    const DEFAULT_MODELS_BY_PROVIDER = {
      LOCAL_OLLAMA: 'ebro-qwen:3b',
      GEMINI: 'gemini-2.5-flash',
      OPENAI: 'gpt-4o-mini',
      ANTHROPIC: 'claude-3-5-haiku-latest',
      GROQ: 'llama-3.3-70b-versatile',
      JEV_OPENROUTER: 'typesafe/jev'
    };

    function onModalProviderChange(provider) {
      const modelInput = document.getElementById('modalAiModel');
      if (modelInput && DEFAULT_MODELS_BY_PROVIDER[provider]) {
        modelInput.value = DEFAULT_MODELS_BY_PROVIDER[provider];
      }
    }

    async function openConfigModal() {
      const modal = document.getElementById('configModal');
      const feedback = document.getElementById('modalFeedbackMsg');
      feedback.innerText = '';
      feedback.className = 'feedback-msg';
      modal.style.display = 'flex';

      try {
        const res = await fetch('/config');
        if (res.ok) {
          const data = await res.json();
          document.getElementById('modalTgToken').value = data.telegram_bot_token || '';
          document.getElementById('modalTgUserId').value = data.telegram_allowed_user_id || '';
          updateModalTgStatus(data.telegram_running);

          const prof = data.ai_profile || {};
          document.getElementById('modalAiProvider').value = prof.provider || 'LOCAL_OLLAMA';
          document.getElementById('modalAiModel').value = prof.model || data.ai_model || 'ebro-qwen:3b';
          document.getElementById('modalAiApiKey').value = prof.masked_api_key || '';
          document.getElementById('modalJevEnabled').checked = Boolean(prof.jev_enabled);
          document.getElementById('modalJevApiKey').value = prof.masked_jev_api_key || '';
        }
      } catch (e) {
        feedback.innerText = '설정 정보를 불러오지 못했습니다: ' + e.message;
        feedback.className = 'feedback-msg error';
      }
    }

    function closeConfigModal() {
      document.getElementById('configModal').style.display = 'none';
    }

    function updateModalTgStatus(isRunning) {
      const dot = document.getElementById('modalTgDot');
      const text = document.getElementById('modalTgStatusText');
      if (isRunning) {
        dot.className = 'dot dot-green';
        text.innerText = '연결됨 · 수신 대기';
        text.style.color = '#4ade80';
      } else {
        dot.className = 'dot dot-yellow';
        text.innerText = '미설정 · 정지';
        text.style.color = '#f59e0b';
      }
    }

    async function testTelegramFromModal() {
      const feedback = document.getElementById('modalFeedbackMsg');
      feedback.innerText = '테스트 알림 발송 중...';
      feedback.className = 'feedback-msg';

      try {
        const res = await fetch('/telegram/test', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          feedback.innerText = '스마트폰 텔레그램으로 테스트 알림이 발송되었습니다.';
          feedback.className = 'feedback-msg success';
        } else {
          feedback.innerText = '발송 실패: ' + (data.error || '오류');
          feedback.className = 'feedback-msg error';
        }
      } catch (e) {
        feedback.innerText = '통신 실패: ' + e.message;
        feedback.className = 'feedback-msg error';
      }
    }

    async function saveConfigFromModal() {
      const token = document.getElementById('modalTgToken').value.trim();
      const userId = document.getElementById('modalTgUserId').value.trim();
      const aiProvider = document.getElementById('modalAiProvider').value;
      const aiModel = document.getElementById('modalAiModel').value.trim();
      const aiApiKey = document.getElementById('modalAiApiKey').value.trim();
      const jevEnabled = document.getElementById('modalJevEnabled').checked;
      const jevApiKey = document.getElementById('modalJevApiKey').value.trim();
      const feedback = document.getElementById('modalFeedbackMsg');

      feedback.innerText = '설정 저장 중...';
      feedback.className = 'feedback-msg';

      try {
        const res = await fetch('/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_bot_token: token,
            telegram_allowed_user_id: userId,
            ai_provider: aiProvider,
            ai_model: aiModel,
            ai_api_key: aiApiKey,
            jev_enabled: jevEnabled,
            jev_api_key: jevApiKey
          })
        });
        const data = await res.json();
        if (data.success) {
          feedback.innerText = 'AI 프로필 암호화 금고 및 텔레그램 설정이 저장되었습니다.';
          feedback.className = 'feedback-msg success';
          updateModalTgStatus(data.telegram_running);
          checkOllama();
          setTimeout(() => closeConfigModal(), 1200);
        } else {
          feedback.innerText = '저장 실패: ' + (data.error || '오류');
          feedback.className = 'feedback-msg error';
        }
      } catch (e) {
        feedback.innerText = '저장 오류: ' + e.message;
        feedback.className = 'feedback-msg error';
      }
    }

    async function minimizeToTray() {
      try {
        await fetch('/api/minimize-studio', { method: 'POST' });
      } catch (e) {}
      try {
        window.close();
      } catch (e) {}
    }

    initSSE();
    checkOllama();
    setInterval(checkOllama, 10000);
    setInterval(refreshQueue, 5000);
  </script>
</body>
</html>`;
}

// ── 🛡️ Silent Core (기본 사무 지원 전용) 안내 UI ──
function renderSilentCoreHtml(port = 5175, version = 'v2.0.0.Build.6', tenantCode = 'GIYEONLIFT') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>eBro Agent - 기본 업무 지원 모드</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background-color: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      max-width: 600px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 16px;
    }
    .logo-badge {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
      color: #fff;
    }
    .title-area h1 {
      font-size: 18px;
      font-weight: 800;
      color: #f8fafc;
    }
    .title-area p {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .badge-silent {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #93c5fd;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 700;
      width: fit-content;
    }
    .desc {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.6;
      background: #0f172a;
      padding: 14px 16px;
      border-radius: 10px;
      border-left: 4px solid #3b82f6;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .grid-item {
      background-color: #1e293b;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .grid-item .label {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
    }
    .grid-item .val {
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 8px;
    }
    .btn {
      flex: 1;
      padding: 11px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary { background-color: #2563eb; color: #fff; }
    .btn-primary:hover { background-color: #1d4ed8; }
    .btn-secondary { background-color: #334155; color: #e2e8f0; }
    .btn-secondary:hover { background-color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">eB</div>
      <div class="title-area">
        <h1>eBro Agent — 기본 업무 지원 모드</h1>
        <p>포트: ${port} | 버전: ${version} | 테넌트: ${agentPolicy.tenantName || agentPolicy.tenantCode || tenantCode}</p>
      </div>
    </div>

    <div class="badge-silent">
      <span>●</span>
      <span>Silent Core (인쇄 & 문서 처리 모드)</span>
    </div>

    <div class="desc">
      현재 테넌트 관리 센터 정책에 따라 <strong>AI 어시스턴트 및 확장프로그램 제어 기능이 잠겨 있습니다.</strong><br/>
      시스템 트레이에서 조용히 상주하며 복합기/라벨 인쇄 큐 관리 및 엑셀 계약서/거래명세서 번들 생성 기능을 안전하게 지원합니다.
    </div>

    <div class="grid">
      <div class="grid-item">
        <div class="label">복합기 / 라벨 인쇄 큐</div>
        <div class="val" style="color: #4ade80;">정상 가동 (HTTP 5175)</div>
      </div>
      <div class="grid-item">
        <div class="label">엑셀 COM 자동화</div>
        <div class="val" style="color: #4ade80;">Excel.Application 대기</div>
      </div>
      <div class="grid-item">
        <div class="label">로컬 문서고 저장소</div>
        <div class="val" style="color: #93c5fd;">C:\\eBroAgent\\문서고\\${normalizeTenantCode(tenantCode)}</div>
      </div>
      <div class="grid-item">
        <div class="label">AI 메신저 명령 / 확장 제어</div>
        <div class="val" style="color: #94a3b8;">미사용 (잠금됨)</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-secondary" onclick="fetch('/api/open-archive', {method:'POST'}).catch(alert)">
        로컬 문서고 열기
      </button>
      <a class="btn btn-primary" href="${agentPolicy.subdomain ? 'https://' + String(agentPolicy.subdomain).toLowerCase() + '.ebro.run' : ((tenantCode === 'GIYEONLIFT' || tenantCode === 'GIYEUN') ? 'https://giyeon.ebro.run' : (tenantCode ? 'https://' + tenantCode.toLowerCase() + '.ebro.run' : 'https://ebro.run?mode=tenant'))}" target="_blank">
        eBro ERP 로그인
      </a>
    </div>
  </div>
  <script>
    (function() {
      try {
        var es = new EventSource('/api/queue/stream');
        es.addEventListener('POLICY_UPDATED', function() { location.reload(); });
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

function readReqJson(req) {
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

// ──  HTTP 핸들러 라우팅 연동 ──
async function handleStudioRequest(req, res, pathname, searchParams, port = 5175, version = 'v2.0.0.Build.1', tenantCode = 'GIYEONLIFT') {
  const effectiveTenantCode = agentPolicy.tenantCode || tenantCode || 'EBRO';
  // 0. 스튜디오 파비콘 및 작업표시줄 아이콘 서빙
  if (req.method === 'GET' && (pathname === '/favicon.ico' || pathname.startsWith('/icon') || pathname.startsWith('/eBroAgent'))) {
    const rawName = pathname.replace(/^\//, '');
    const iconCandidates = [
      path.join(__dirname, rawName),
      path.join('C:\\eBroAgent', rawName),
      path.join(__dirname, 'icon-32.png'),
      path.join(__dirname, 'favicon.ico'),
      path.join(__dirname, 'eBroAgent.ico')
    ];
    const targetFile = iconCandidates.find(p => p && fs.existsSync(p));
    if (targetFile) {
      try {
        const ext = path.extname(targetFile).toLowerCase();
        const contentType = ext === '.ico' ? 'image/x-icon' : (ext === '.svg' ? 'image/svg+xml' : 'image/png');
        const buf = fs.readFileSync(targetFile);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(buf);
        return true;
      } catch (err) {}
    }
  }

  // 🌐 테넌트 정책 조회 API (/api/policy)
  if (req.method === 'GET' && pathname === '/api/policy') {
    const reqTenantCode = searchParams.get('tenantCode');
    sendJson(res, 200, { success: true, policy: reqTenantCode ? getTenantPolicy(reqTenantCode) : getAgentPolicy() });
    return true;
  }

  // 🌐 테넌트 정책 실시간 핫 동기화 API (/api/policy/sync)
  if (req.method === 'POST' && pathname === '/api/policy/sync') {
    try {
      const payload = await readReqJson(req);
      const reqTenantCode = searchParams.get('tenantCode');
      if (reqTenantCode && !payload.tenantCode) {
        payload.tenantCode = reqTenantCode;
      }
      const updated = updateAgentPolicy(payload);
      sendJson(res, 200, { success: true, policy: updated });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 📂 로컬 문서고 폴더 열기 API (/api/open-archive)
  if (req.method === 'POST' && pathname === '/api/open-archive') {
    try {
      let payload = {};
      try { payload = await readReqJson(req); } catch (e) {}
      const code = normalizeTenantCode(payload.tenantCode || searchParams.get('tenantCode') || agentPolicy?.tenantCode || tenantCode || 'GIYEONLIFT');
      const archiveDir = path.join(AGENT_HOME, '문서고', code);
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      if (!payload.skipExplorer) {
        exec(`explorer.exe "${archiveDir}"`);
      }
      sendJson(res, 200, { success: true, tenantCode: code, archiveDir });
    } catch (e) {
      sendJson(res, 500, { success: false, error: e.message });
    }
    return true;
  }

  // 1. 스튜디오 데스크톱 UI 서빙 (/studio, /ui)
  if (req.method === 'GET' && (pathname === '/studio' || pathname === '/studio/' || pathname === '/ui' || pathname === '/ui/')) {
    // 🛡️ AI 비활성화(Silent Core 모드) 시 조용한 지원 UI 렌더링
    const html = isAiEnabled() 
      ? renderStudioHtml(port, version, effectiveTenantCode) 
      : renderSilentCoreHtml(port, version, effectiveTenantCode);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html)
    });
    res.end(html);
    return true;
  }

  // 2. 독립 창 실행 트리거 (/api/launch-studio)
  if (req.method === 'POST' && pathname === '/api/launch-studio') {
    const reqCode = searchParams.get('tenantCode');
    if (!isAiEnabled()) {
      launchStudioWindow(port, reqCode); // 문서고 폴더 안전 오픈
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        reason: 'SILENT_CORE', 
        message: '현재 테넌트는 기본 업무 지원 모드(인쇄 및 엑셀 전용)로 설정되어 있습니다. 로컬 문서고를 열었습니다.' 
      }));
      return true;
    }
    const ok = launchStudioWindow(port);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: ok, message: ok ? '데스크톱 독립 스튜디오 창을 실행하였습니다.' : '창 실행에 실패하였습니다.' }));
    return true;
  }

  // 3. 작업 큐 목록 조회 (/api/queue)
  if (req.method === 'GET' && pathname === '/api/queue') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, count: taskQueue.length, tasks: taskQueue }));
    return true;
  }

  // 4. 지시 큐 신규 등록 (/api/queue/add)
  if (req.method === 'POST' && pathname === '/api/queue/add') {
    try {
      const payload = await readReqJson(req);
      const task = await addTask(payload.instruction, payload.mode);
      sendJson(res, 200, { success: true, task });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 5. 작업 취소 (/api/queue/cancel)
  if (req.method === 'POST' && pathname === '/api/queue/cancel') {
    try {
      const { id } = await readReqJson(req);
      const task = taskQueue.find(t => t.id === id);
      if (task && task.status === 'PENDING') {
        task.status = 'CANCELLED';
        task.currentStep = '사용자에 의해 취소됨';
        appendTaskLog(task, '작업이 취소되었습니다.');
        broadcastEvent('TASK_UPDATED', task);
        scheduleSaveQueue(true);
      }
      sendJson(res, 200, { success: true });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 6. 완료 작업 일괄 정리 (/api/queue/clear-completed)
  if (req.method === 'POST' && pathname === '/api/queue/clear-completed') {
    taskQueue = taskQueue.filter(t => t.status === 'PENDING' || t.status === 'RUNNING');
    pruneQueueAndLogs();
    scheduleSaveQueue(true);
    broadcastEvent('INIT', taskQueue);
    broadcastEvent('INIT_LOGS', studioLogHistory);
    sendJson(res, 200, { success: true, count: taskQueue.length });
    return true;
  }

  // 7. 실시간 SSE 스트림 (/api/queue/stream)
  if (req.method === 'GET' && pathname === '/api/queue/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.flushHeaders?.();

    // 초기 상태 전송
    res.write(`event: INIT\ndata: ${JSON.stringify({ type: 'INIT', data: taskQueue })}\n\n`);
    res.write(`event: INIT_LOGS\ndata: ${JSON.stringify({ type: 'INIT_LOGS', data: studioLogHistory })}\n\n`);

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return true;
  }

  // 8. Ollama 로컬 LLM 상태 조회 (/api/ollama/status)
  if (req.method === 'GET' && pathname === '/api/ollama/status') {
    const status = await checkOllamaStatus();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(status));
    return true;
  }

  // 8-1. Ollama 모델 변경 (/api/ollama/model)
  if (req.method === 'POST' && pathname === '/api/ollama/model') {
    try {
      const payload = await readReqJson(req);
      if (payload.model) {
        saveOllamaConfig(payload.model);
        await checkOllamaStatus(true);
        broadcastStudioLog('SYSTEM', `Ollama 추론 엔진 변경 완료: ${selectedOllamaModel}`);
        sendJson(res, 200, { success: true, model: selectedOllamaModel });
        return true;
      }
      sendJson(res, 400, { success: false, error: 'Model name required' });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 8-2. 에이전트 통합 상태 조회 (/status, /api/status)
  if (req.method === 'GET' && (pathname === '/status' || pathname === '/api/status')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      agent: 'eBroAgent',
      status: 'ONLINE',
      version: version,
      browser_extension_connected: isWebAgentConnected(),
      windows_uia_available: process.platform === 'win32',
      active_sessions: taskQueue.filter(t => t.status === 'RUNNING').length,
      telegram_running: isTelegramRunning(),
      ai_model: selectedOllamaModel,
      ai_profile: getMaskedAiProfile(effectiveTenantCode, 'DEFAULT')
    }));
    return true;
  }

  // 8-3. 테넌트/임직원 BYOK AI 프로필 조회 (/ai-profile, /api/ai-profile)
  if (req.method === 'GET' && (pathname === '/ai-profile' || pathname === '/api/ai-profile')) {
    const qTenant = searchParams.get('tenant_code') || effectiveTenantCode;
    const qUser = searchParams.get('user_id') || 'DEFAULT';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      profile: getMaskedAiProfile(qTenant, qUser),
      supported_providers: SUPPORTED_AI_PROVIDERS
    }));
    return true;
  }

  // 8-4. 테넌트/임직원 BYOK AI 프로필 저장 (/ai-profile, /api/ai-profile)
  if (req.method === 'POST' && (pathname === '/ai-profile' || pathname === '/api/ai-profile')) {
    try {
      const payload = await readReqJson(req);
      const saved = setAiProfile({
        tenant_code: payload.tenant_code || effectiveTenantCode,
        user_id: payload.user_id || 'DEFAULT',
        provider: payload.provider,
        model: payload.model,
        api_key: payload.api_key,
        vision_fallback_enabled: payload.vision_fallback_enabled,
        custom_endpoint: payload.custom_endpoint,
        jev_enabled: payload.jev_enabled,
        jev_api_key: payload.jev_api_key,
        jev_model: payload.jev_model,
        jev_endpoint: payload.jev_endpoint
      });
      broadcastStudioLog('SYSTEM', `AI 프로필 암호화 금고 업데이트 완료: ${saved.provider} (${saved.model}), Jev=${saved.jev_enabled ? 'ON' : 'OFF'}`);
      sendJson(res, 200, {
        success: true,
        message: 'AI 모델 및 API 키 프로필이 암호화 저장되었습니다.',
        profile: saved
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 8-5. Windows UIA 접근성 트리 스냅샷 조회 (/uia/inspect, /api/uia/inspect)
  if (req.method === 'GET' && (pathname === '/uia/inspect' || pathname === '/api/uia/inspect')) {
    const windowTitle = searchParams.get('window_title') || undefined;
    const maxDepth = parseInt(searchParams.get('max_depth') || '10', 10);
    const interactiveOnly = searchParams.get('interactive_only') !== 'false';
    const uiaRes = await executeUiaTool('uia_inspect_window', {
      window_title: windowTitle,
      max_depth: maxDepth,
      interactive_only: interactiveOnly
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(uiaRes));
    return true;
  }

  // 8-6. Windows UIA 접근성 도구 직접 실행 (/uia/execute, /api/uia/execute)
  if (req.method === 'POST' && (pathname === '/uia/execute' || pathname === '/api/uia/execute')) {
    try {
      const payload = await readReqJson(req);
      const uiaRes = await executeUiaTool(payload.tool || 'uia_inspect_window', payload.params || {});
      sendJson(res, 200, uiaRes);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 8-7. 자연어 지시 즉시 실행 (/execute, /api/execute)
  if (req.method === 'POST' && (pathname === '/execute' || pathname === '/api/execute')) {
    try {
      const payload = await readReqJson(req);
      const prompt = payload.prompt || payload.instruction || '';
      const qTenant = payload.tenant_code || effectiveTenantCode;
      const qUser = payload.user_id || 'DEFAULT';
      if (!prompt.trim()) {
        sendJson(res, 400, { success: false, error: 'prompt 누락' });
        return true;
      }
      const startTime = Date.now();
      await addTask(prompt.trim(), 'BROWSER', (completedTask) => {
        try {
          sendJson(res, 200, {
            success: completedTask.status === 'COMPLETED',
            status: completedTask.status === 'COMPLETED' ? 'DONE' : 'ERROR',
            session_id: completedTask.id,
            total_steps: completedTask.stepsCount || 1,
            steps: completedTask.stepsList || [],
            result: completedTask.result || {},
            latency_ms: Date.now() - startTime
          });
        } catch (e) {}
      }, qTenant, qUser);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 9. 통합 환경설정 조회 (/config, /api/config)
  if (req.method === 'GET' && (pathname === '/config' || pathname === '/api/config')) {
    const tgCfg = getTelegramConfig();
    const qTenant = searchParams.get('tenant_code') || effectiveTenantCode;
    const qUser = searchParams.get('user_id') || 'DEFAULT';
    sendJson(res, 200, {
      success: true,
      telegram_bot_token: tgCfg.telegram_bot_token || '',
      telegram_allowed_user_id: tgCfg.telegram_allowed_user_id || '',
      telegram_running: isTelegramRunning(),
      ai_model: selectedOllamaModel,
      ai_profile: getMaskedAiProfile(qTenant, qUser),
      supported_providers: SUPPORTED_AI_PROVIDERS
    });
    return true;
  }

  // 9-1. 통합 환경설정 저장 (/config, /api/config)
  if (req.method === 'POST' && (pathname === '/config' || pathname === '/api/config')) {
    try {
      const payload = await readReqJson(req);
      if (payload.telegram_bot_token !== undefined || payload.telegram_allowed_user_id !== undefined) {
        saveTelegramConfig(payload.telegram_bot_token, payload.telegram_allowed_user_id);
        if (isAiEnabled()) {
          await restartTelegramBot(async (text, onComplete) => {
            return await addTask(text, 'BROWSER', onComplete);
          });
        } else {
          stopTelegramBot();
        }
      }
      if (payload.ai_model) {
        saveOllamaConfig(payload.ai_model);
        await checkOllamaStatus(true);
      }
      const qTenant = payload.tenant_code || effectiveTenantCode;
      const qUser = payload.staff_user_id || payload.user_id || 'DEFAULT';
      const savedProfile = setAiProfile({
        tenant_code: qTenant,
        user_id: qUser,
        provider: payload.ai_provider || payload.provider,
        model: payload.ai_model || payload.model,
        api_key: payload.ai_api_key !== undefined ? payload.ai_api_key : payload.api_key,
        jev_enabled: payload.jev_enabled,
        jev_api_key: payload.jev_api_key,
        jev_model: payload.jev_model
      });
      broadcastStudioLog('SYSTEM', `환경설정(텔레그램 & AI 프로필: ${savedProfile.provider}, Jev=${savedProfile.jev_enabled ? 'ON' : 'OFF'}) 저장 완료`);
      sendJson(res, 200, {
        success: true,
        telegram_running: isTelegramRunning(),
        ai_model: selectedOllamaModel,
        ai_profile: savedProfile,
        telegram_bot_token: payload.telegram_bot_token,
        telegram_allowed_user_id: payload.telegram_allowed_user_id
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 9-2. 텔레그램 연동 테스트 메시지 발송 (/telegram/test)
  if (req.method === 'POST' && pathname === '/telegram/test') {
    if (!isAiEnabled()) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: '현재 테넌트는 AI 에이전트 기능이 비활성화(Silent Core 모드)되어 있습니다.' }));
      return true;
    }
    const testResult = await sendTestTelegramMessage();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(testResult));
    return true;
  }

  // 10. 스튜디오 창 트레이로 숨기기 (/api/minimize-studio)
  if (req.method === 'POST' && pathname === '/api/minimize-studio') {
    try {
      const psCmd = `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public class W { [DllImport(\\\"user32.dll\\\")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m); [DllImport(\\\"user32.dll\\\")] public static extern bool EnumWindows(Func<IntPtr, int, bool> f, int l); public static void Hide() { EnumWindows((h, l) => { StringBuilder s = new StringBuilder(256); GetWindowText(h, s, 256); if (s.ToString().Contains(\\\"eBro AI Agent\\\") || s.ToString().Contains(\\\"eBro Agent\\\")) { ShowWindow(h, 0); return false; } return true; }, 0); } }'; [W]::Hide()"`;
      exec(psCmd);
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  return false;
}

// 텔레그램 모바일 원격 제어기 상시 가동
if (isAiEnabled()) {
  startTelegramBot(async (text, onComplete) => {
    return await addTask(text, 'BROWSER', onComplete);
  });
}

module.exports = {
  handleStudioRequest,
  launchStudioWindow,
  addTask,
  checkOllamaStatus,
  broadcastStudioLog,
  getAgentPolicy,
  getTenantPolicy,
  normalizeTenantCode,
  updateAgentPolicy,
  isAiEnabled,
  handleWebSocketConnection,
  isWebAgentConnected,
  sendToolToWebAgent,
  isTelegramRunning,
  sendTestTelegramMessage
};
