import type { TenantFeatures, TenantR2Config } from '../types/domain';
import {
  EXPECTED_AGENT_VERSION,
  EXPECTED_CORE_HASH,
  appendTenantQueryParam,
  fetchWithAgentFallback,
  getActiveAgentTenantCode,
  getLastKnownAgentInfo,
  isExpectedNewer,
  isLastKnownAgentOnline,
  launchLocalAgentFromBrowser,
  normalizeAgentTenantCode,
  setActiveAgentTenantCode,
  setGlobalAgentStatus,
  type AgentHealthInfo,
} from './agentTransportCore';

export * from './agentTransportCore';

/**
 *  eBro AI Agent 독립 데스크톱 스튜디오 창 호출
 */
export async function openAgentStudio(): Promise<boolean> {
  try {
    const res = await fetchWithAgentFallback('/api/launch-studio', {
      method: 'POST'
    });
    if (res.ok) return true;
  } catch {}

  // 브라우저 팝업/프로토콜 폴백
  try {
    window.open('http://127.0.0.1:5175/studio', '_blank', 'width=1020,height=740');
    return true;
  } catch {
    launchLocalAgentFromBrowser();
    return false;
  }
}

/**
 *  테넌트 관리 센터의 기능 정책을 로컬 에이전트에 실시간 핫 동기화
 */
export async function syncTenantPolicyToAgent(
  tenant?: {
    id?: string;
    tenantCode?: string;
    subdomain?: string;
    solutionType?: string;
    displayName?: string;
    tradeName?: string;
    corporateName?: string;
    businessNumber?: string;
    representativeName?: string;
    tel?: string;
    fax?: string;
    salesPhone?: string;
    businessAddress?: string;
    businessCategory?: string;
    businessItem?: string;
    bankAccounts?: Array<{ bankName: string; accountNumber: string; accountHolder: string }>;
    stampImageUrl?: string;
    r2Config?: TenantR2Config;
    features?: TenantFeatures;
  } | null,
  backupPolicy?: {
    autoBackupEnabled?: boolean;
    autoBackupTime?: string;
    autoBackupRetentionDays?: number;
    backupUserId?: string;
    backupUserName?: string;
  } | null,
  options?: { setAsActiveTabTenant?: boolean }
): Promise<boolean> {
  if (!tenant && !backupPolicy) return false;
  try {
    const payload: Record<string, any> = {};
    const resolvedCode = normalizeAgentTenantCode(tenant?.tenantCode || getActiveAgentTenantCode());
    if (tenant) {
      if (tenant.tenantCode && options?.setAsActiveTabTenant !== false) {
        setActiveAgentTenantCode(resolvedCode);
      }
      const isAiEnabled = Boolean(tenant.features?.agentAiEnabled);
      const sub = tenant.subdomain || (resolvedCode === 'EBRO_FL' ? 'fl-demo' : resolvedCode.toLowerCase());
      const tenantName = tenant.displayName || tenant.tradeName || tenant.corporateName || resolvedCode;
      const corporateName = tenant.corporateName || tenant.tradeName || tenantName;
      const tenantR2 = tenant.r2Config || tenant.features?.r2Config || undefined;
      Object.assign(payload, {
        tenantId: tenant.id || '',
        solutionType: tenant.solutionType || 'FL',
        tenantSupabaseUrl: tenant.features?.tenantSupabaseUrl || '',
        r2Config: tenantR2,
        agentAiEnabled: isAiEnabled,
        tenantCode: resolvedCode,
        subdomain: sub,
        tenantName,
        corporateName,
        businessNumber: tenant.businessNumber || '',
        representativeName: tenant.representativeName || '',
        tel: tenant.tel || '',
        fax: tenant.fax || '',
        salesPhone: tenant.salesPhone || tenant.tel || '',
        businessAddress: tenant.businessAddress || '',
        businessCategory: tenant.businessCategory || '',
        businessItem: tenant.businessItem || '',
        bankAccounts: tenant.bankAccounts || [],
        stampImageUrl: tenant.stampImageUrl || ''
      });
    } else {
      payload.tenantCode = resolvedCode;
    }
    if (backupPolicy) {
      if (backupPolicy.autoBackupEnabled !== undefined) payload.autoBackupEnabled = Boolean(backupPolicy.autoBackupEnabled);
      if (backupPolicy.autoBackupTime !== undefined) payload.autoBackupTime = backupPolicy.autoBackupTime || '09:00';
      if (backupPolicy.autoBackupRetentionDays !== undefined) payload.autoBackupRetentionDays = Number(backupPolicy.autoBackupRetentionDays) || 30;
      if (backupPolicy.backupUserId !== undefined) payload.backupUserId = backupPolicy.backupUserId || '';
      if (backupPolicy.backupUserName !== undefined) payload.backupUserName = backupPolicy.backupUserName || '';
    }
    const res = await fetchWithAgentFallback(appendTenantQueryParam('/api/policy/sync', resolvedCode), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ──  단일 전역 에이전트 헬스체크 매니저 ──
let globalHealthCheckTimer: any = null;
let activeMonitorCallsign: string = 'admin';
let consecutiveFailures = 0;
let isCheckingHealth = false;
let lastAutoUpdateTriggerAt = 0;
let lastAutoR2SyncTriggerAt = 0;

/**
 *  로컬 에이전트에 Cloudflare R2 변경 파일 즉시 동기화 명령 전송
 */
export async function triggerAgentCloudflareSync(): Promise<boolean> {
  try {
    const res = await fetchWithAgentFallback('/api/trigger-sync', {
      method: 'POST',
      skipPrecheck: true
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 2-Strike 확인 기반 가짜 오프라인 방지 헬스체크
 */
export async function pingLocalAgentHealth(callsign: string = 'admin'): Promise<AgentHealthInfo> {
  if (isCheckingHealth) {
    return getLastKnownAgentInfo() || { status: isLastKnownAgentOnline() ? 'ONLINE' : 'OFFLINE' };
  }
  isCheckingHealth = true;

  try {
    const res = await fetchWithAgentFallback(`/health?callsign=${encodeURIComponent(callsign)}`, {
      method: 'GET',
      cache: 'no-store',
      // 헬스체크 전용 독립 타임아웃 (3초)
      timeout: 3000
    } as any);

    if (res.ok) {
      const data = await res.json();
      consecutiveFailures = 0;
      const info: AgentHealthInfo = {
        status: 'ONLINE',
        version: data.version || 'v2.0.0',
        coreHash: data.coreHash,
        callsign: data.callsign || callsign,
        machineName: data.machineName,
        archiveRoot: data.archiveRoot,
        driveMirrorDir: data.driveMirrorDir,
        uptimeSeconds: data.uptimeSeconds,
        updateState: data.updateState,
        policy: data.policy,
        isAiEnabled: data.isAiEnabled,
        timestamp: data.timestamp
      };
      setGlobalAgentStatus(true, info);

      //  로컬 에이전트 버전이 배포 버전보다 낮거나(동일 버전 내 해시 변경 시) 원격 업데이트 트리거 (구버전 브라우저 탭이 신버전 에이전트를 역공격하지 않도록 방어)
      const isVersionOutdated = Boolean(data.version && isExpectedNewer(EXPECTED_AGENT_VERSION, data.version));
      const isAgentAlreadyNewer = Boolean(data.version && isExpectedNewer(data.version, EXPECTED_AGENT_VERSION));
      const isHashOutdated = !isAgentAlreadyNewer && Boolean(EXPECTED_CORE_HASH && EXPECTED_CORE_HASH !== 'auto' && data.coreHash !== EXPECTED_CORE_HASH);
      if (isVersionOutdated || isHashOutdated) {
        if (
          data.updateState?.status !== 'downloading' &&
          data.updateState?.status !== 'installing' &&
          Date.now() - lastAutoUpdateTriggerAt > 5 * 60 * 1000
        ) {
          lastAutoUpdateTriggerAt = Date.now();
          lastAutoR2SyncTriggerAt = 0; // 코어 업데이트 완료 직후 R2 동기화가 즉시 실행되도록 초기화
          triggerAgentSelfUpdate(false).catch(() => {});
        }
      } else if (Date.now() - lastAutoR2SyncTriggerAt > 5 * 60 * 1000) {
        //  최신 에이전트 코어 온라인 확인 즉시 (및 5분 주기) Cloudflare R2 변경 파일 자동 동기화 트리거
        lastAutoR2SyncTriggerAt = Date.now();
        triggerAgentCloudflareSync().catch(() => {});
      }

      return info;
    }
  } catch {
    //  1회 실패 시 즉각 OFFLINE으로 단정하지 않고 400ms 후 즉시 1회 재시도
    consecutiveFailures++;
    if (consecutiveFailures === 1) {
      try {
        await new Promise(r => setTimeout(r, 400));
        const retryRes = await fetchWithAgentFallback('/health', { method: 'GET', cache: 'no-store', timeout: 2000 } as any);
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          consecutiveFailures = 0;
          const retryInfo: AgentHealthInfo = {
            status: 'ONLINE',
            version: retryData.version || 'v2.0.0',
            callsign: retryData.callsign || callsign,
            machineName: retryData.machineName,
            archiveRoot: retryData.archiveRoot,
            driveMirrorDir: retryData.driveMirrorDir,
            uptimeSeconds: retryData.uptimeSeconds,
            updateState: retryData.updateState,
            policy: retryData.policy,
            isAiEnabled: retryData.isAiEnabled,
            timestamp: retryData.timestamp
          };
          setGlobalAgentStatus(true, retryInfo);
          return retryInfo;
        }
      } catch {
        consecutiveFailures = 2;
      }
    }
  } finally {
    isCheckingHealth = false;
  }

  // 2회 연속 실패 시에만 정식으로 OFFLINE 확정
  if (consecutiveFailures >= 2) {
    setGlobalAgentStatus(false, null);
  }
  return { status: 'OFFLINE' };
}

/**
 * 단일 전역 에이전트 헬스체크 모니터 가동
 * - 3.5초 주기 단일 폴링으로 소켓 경합 원천 제거
 * - 탭 포커스 복귀 및 화면 복원 시 0.1초 즉시 헬스체크 트리거
 */
export function startGlobalAgentHealthMonitor(callsign: string = 'admin'): void {
  if (typeof window === 'undefined') return;
  if (callsign && callsign.trim()) {
    activeMonitorCallsign = callsign.trim();
  }
  if (globalHealthCheckTimer) {
    pingLocalAgentHealth(activeMonitorCallsign);
    return;
  }

  // 1. 즉시 1회 검사
  pingLocalAgentHealth(activeMonitorCallsign);

  // 2. 단일 주기적 폴링 (3.5초)
  globalHealthCheckTimer = setInterval(() => {
    pingLocalAgentHealth(activeMonitorCallsign);
  }, 3500);

  // 3. 브라우저 창/탭 복원 시 즉시 재검사 (트레이에서 올라왔을 때 0.1초 즉시 초록불 복귀)
  window.addEventListener('focus', () => { pingLocalAgentHealth(activeMonitorCallsign); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pingLocalAgentHealth(activeMonitorCallsign);
    }
  });
}

/**
 * 로컬 에이전트 헬스체크 및 콜사인 동기화 (하위 호환)
 */
export async function checkLocalAgentHealth(callsign: string = 'admin'): Promise<AgentHealthInfo> {
  return pingLocalAgentHealth(callsign);
}

/**
 *  eBro Web Agent & PC 에이전트 코어 (포트 9002) 헬스체크
 */
export async function checkWebAgentHealth(): Promise<{ online: boolean; extensionConnected: boolean; version?: string }> {
  try {
    const res = await fetch('http://127.0.0.1:9002/status', {
      method: 'GET',
      signal: AbortSignal.timeout(1000)
    });
    if (res.ok) {
      const data = await res.json();
      return {
        online: data.status === 'ONLINE',
        extensionConnected: Boolean(data.browser_extension_connected),
        version: data.version
      };
    }
  } catch {}
  return { online: false, extensionConnected: false };
}

/**
 *  eBro PC 에이전트에 자연어 명령 전달
 */
export async function executeWebAgentCommand(prompt: string): Promise<any> {
  const res = await fetch('http://127.0.0.1:9002/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, source: 'ERP_WEB_APP' })
  });
  return await res.json();
}

/**
 *  로컬 에이전트 재시작 트리거
 */
export async function restartLocalAgent(): Promise<boolean> {
  try {
    const res = await fetchWithAgentFallback('/restart', {
      method: 'POST'
    });
    return res.ok;
  } catch {
    launchLocalAgentFromBrowser();
    return true;
  }
}

/**
 *  로컬 에이전트 자가 자동 업데이트(Inno Setup 백그라운드 무음 교체) 즉시 트리거
 */
export async function triggerAgentSelfUpdate(force: boolean = false): Promise<{ success: boolean; message?: string; updateState?: any }> {
  try {
    const res = await fetchWithAgentFallback(`/api/check-update?force=${force ? 'true' : 'false'}`, {
      method: 'POST'
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: '자동 업데이트가 시작되었습니다.', updateState: data.updateState };
    }
    return { success: false, message: `업데이트 요청 실패 (HTTP ${res.status})` };
  } catch (e: any) {
    return { success: false, message: e.message || '에이전트 통신 실패' };
  }
}

export interface LocalBackupStatus {
  success: boolean;
  autoBackupEnabled?: boolean;
  autoBackupTime?: string;
  autoBackupRetentionDays?: number;
  backupUserId?: string;
  backupUserName?: string;
  lastAutoBackupAt?: string | null;
  hasTodayBackup?: boolean;
  isRunning?: boolean;
  lastError?: string | null;
  backupDir?: string;
  backupCount?: number;
  recentBackups?: Array<{
    fileName: string;
    filePath: string;
    sizeBytes: number;
    modifiedAt: string;
  }>;
  error?: string;
}

/**
 *  로컬 에이전트의 DB 백업 현황 및 정책 상태 조회
 */
export async function getAgentLocalBackupStatus(): Promise<LocalBackupStatus> {
  try {
    const res = await fetchWithAgentFallback('/api/backup/status', {
      method: 'GET',
      timeout: 3000
    });
    if (res.ok) {
      return await res.json();
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (e: any) {
    return { success: false, error: e?.message || '에이전트 연결 실패' };
  }
}

/**
 *  로컬 에이전트에 즉시 전체 DB 백업 실행 명령 전송
 */
export async function triggerAgentLocalBackupNow(backupPolicy?: {
  autoBackupEnabled?: boolean;
  autoBackupTime?: string;
  autoBackupRetentionDays?: number;
  backupUserId?: string;
  backupUserName?: string;
}): Promise<{
  success: boolean;
  fileName?: string;
  filePath?: string;
  tableCount?: number;
  totalRowsCount?: number;
  fileSizeMb?: number;
  completedAt?: string;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetchWithAgentFallback('/api/backup/run-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupPolicy || {}),
      timeout: 120000
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || '에이전트 통신 실패' };
  }
}

/**
 *  로컬 PC 백업 폴더(C:\eBroAgent\문서고\DB백업) 탐색기 열기
 */
export async function openAgentLocalBackupFolder(): Promise<boolean> {
  try {
    const res = await fetchWithAgentFallback('/api/backup/open-folder', {
      method: 'POST',
      timeout: 3000
    });
    return res.ok;
  } catch {
    return false;
  }
}
