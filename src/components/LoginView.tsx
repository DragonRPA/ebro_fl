import React, { useState } from 'react';
import { Download, Eye, EyeOff, Monitor, RefreshCw } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import {
  EXPECTED_AGENT_VERSION,
  triggerAgentSelfUpdate,
  triggerTenantAgentDownload,
} from '../services/agentService';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { VerticalField, actionBtnStyle, controlInputStyle } from './UiPrimitives';

const SAVED_LOGIN_ID_KEY = 'ebro_fl_saved_login_id';

function readSavedLoginId(): string {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(SAVED_LOGIN_ID_KEY) || '' : '';
  } catch {
    return '';
  }
}

export const LoginView: React.FC = () => {
  const { tenantProfile, agentOnline, agentInfo, loginWithCredentials, notifyToast } = useAppShell();
  const initialSavedId = readSavedLoginId();
  const [loginId, setLoginId] = useState(initialSavedId);
  const [rememberId, setRememberId] = useState(Boolean(initialSavedId));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updatingAgent, setUpdatingAgent] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const latestAgentVer = EXPECTED_AGENT_VERSION;
  const localAgentVer = agentInfo?.version || '';
  const isVerMatch = agentOnline && Boolean(localAgentVer) && localAgentVer === latestAgentVer;
  const isVerMismatch = agentOnline && Boolean(localAgentVer) && localAgentVer !== latestAgentVer;

  const handleAgentDownload = () => {
    triggerTenantAgentDownload({
      tenantCode: tenantProfile.tenantCode,
      displayName: tenantProfile.displayName,
      corporateName: tenantProfile.corporateName,
      subdomain: tenantProfile.subdomain,
    });
    notifyToast(`통합 에이전트 설치 프로그램(${latestAgentVer}) 다운로드를 시작합니다.`, 'info');
  };

  const handleAgentQuickUpdate = async () => {
    setUpdatingAgent(true);
    try {
      const res = await triggerAgentSelfUpdate(true);
      notifyToast(res.message || '에이전트 업데이트 요청을 전송했습니다.', res.success ? 'success' : 'error');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '에이전트 업데이트 요청에 실패했습니다.', 'error');
    } finally {
      setUpdatingAgent(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setErrorMsg('아이디 또는 사번과 비밀번호를 입력하십시오.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await loginWithCredentials(loginId.trim(), password);
      try {
        if (rememberId) {
          window.localStorage.setItem(SAVED_LOGIN_ID_KEY, loginId.trim());
        } else {
          window.localStorage.removeItem(SAVED_LOGIN_ID_KEY);
        }
      } catch {
        // 무시
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(24px - 2pt)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(400px, 100%)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: 'calc(28px - 2pt) calc(24px - 2pt)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-conservation-gap)',
          boxShadow: 'none',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid var(--table-row-border)',
            paddingBottom: 'calc(12px - 2pt)',
          }}
        >
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-label-gap)',
            }}
          >
            {tenantProfile.corporateName}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--text-main)',
              letterSpacing: '-0.02em',
            }}
          >
            {tenantProfile.displayName || '이브로 지게차 전사 시스템'}
          </h1>
        </div>

        <VerticalField label="아이디 또는 사번" required>
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            placeholder="사번 또는 아이디 입력"
            style={controlInputStyle}
          />
        </VerticalField>

        <VerticalField label="비밀번호" required>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              style={{ ...controlInputStyle, paddingRight: '72px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? '비밀번호 숨김' : '비밀번호 표시'}
              style={{
                position: 'absolute',
                right: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              {showPassword ? '숨김' : '표시'}
            </button>
          </div>
        </VerticalField>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
          />
          아이디 저장
        </label>

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: 'calc(9px - 2pt) var(--space-subbox-pad-x)',
              borderRadius: '6px',
              border: '1px solid var(--danger)',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger)',
              fontSize: '12.5px',
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...actionBtnStyle('primary'),
            width: '100%',
            height: 'calc(38px - 2pt)',
            marginTop: '2px',
          }}
        >
          {busy ? '인증 처리중' : '로그인'}
        </button>

        {/* 에이전트 버전 정보 및 설치 프로그램 다운로드 */}
        <div
          data-testid="login-agent-card"
          style={{
            marginTop: '2px',
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-app)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Monitor size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-main)' }}>
                에이전트 설치 프로그램
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--primary)',
                backgroundColor: 'var(--primary-light)',
                padding: '2px 8px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                whiteSpace: 'nowrap',
              }}
            >
              {tenantProfile.displayName || '이브로지게차'}
            </span>
          </div>

          <div
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: isVerMismatch
                ? 'var(--warning-light)'
                : isVerMatch
                  ? 'var(--success-light)'
                  : 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '11.5px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>최신 배포 버전</span>
              <span data-testid="login-agent-latest-ver" style={{ color: 'var(--primary)', fontWeight: 800 }}>
                {latestAgentVer}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>내 단말 실행 버전</span>
              <span
                data-testid="login-agent-local-ver"
                style={{
                  fontWeight: 800,
                  color: isVerMismatch ? 'var(--warning)' : isVerMatch ? 'var(--success)' : 'var(--text-muted)',
                }}
              >
                {agentOnline ? localAgentVer || '확인 중' : '미실행'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '4px',
                marginTop: '2px',
                borderTop: '1px dashed var(--border-color)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>버전 대조 상태</span>
              <span
                style={{
                  fontWeight: 800,
                  color: isVerMismatch ? 'var(--danger)' : isVerMatch ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                {isVerMismatch ? '버전 불일치 · 업데이트 필요' : isVerMatch ? '최신 버전 일치' : '에이전트 미실행'}
              </span>
            </div>
            {isVerMismatch && (
              <button
                type="button"
                disabled={updatingAgent}
                onClick={handleAgentQuickUpdate}
                style={{
                  ...actionBtnStyle('secondary', true),
                  width: '100%',
                  marginTop: '4px',
                  backgroundColor: 'var(--warning)',
                  color: '#ffffff',
                  borderColor: 'var(--warning)',
                }}
              >
                <RefreshCw size={13} />
                <span>{updatingAgent ? '업데이트 진행 중' : `최신 버전(${latestAgentVer}) 즉시 업데이트`}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="login-agent-download-btn"
            onClick={handleAgentDownload}
            style={{
              ...actionBtnStyle('primary'),
              width: '100%',
              height: 'calc(34px - 2pt)',
            }}
            title="단말 백그라운드 에이전트 설치 패키지 다운로드"
          >
            <Download size={14} />
            <span>이브로 통합 에이전트 설치 ({latestAgentVer})</span>
          </button>
        </div>

        {/* 개인정보처리방침 법정 고지 및 저작권 안내 */}
        <div
          style={{
            marginTop: '2px',
            paddingTop: '10px',
            borderTop: '1px dashed var(--border-color)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div>
            <button
              type="button"
              data-testid="login-privacy-policy-btn"
              onClick={() => setShowPrivacyPolicy(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '11.5px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 8px',
                fontWeight: 600,
              }}
            >
              개인정보처리방침
            </button>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.45, wordBreak: 'keep-all' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
              © 2026 드래곤알피에이
            </div>
            <div>
              본 소프트웨어 및 데이터베이스 스키마는 저작권법과 부정경쟁방지법에 의해 보호되는 영업비밀이며, 무단 복제·배포·역공학을 엄격히 금지합니다.
            </div>
          </div>
        </div>
      </form>

      {showPrivacyPolicy && (
        <PrivacyPolicyModal onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );
};
