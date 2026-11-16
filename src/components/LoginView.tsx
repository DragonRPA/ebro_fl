import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
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
  const { tenantProfile, loginWithCredentials } = useAppShell();
  const initialSavedId = readSavedLoginId();
  const [loginId, setLoginId] = useState(initialSavedId);
  const [rememberId, setRememberId] = useState(Boolean(initialSavedId));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      </form>
    </div>
  );
};
