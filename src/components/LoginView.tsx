import React, { useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { VerticalField, actionBtnStyle, controlInputStyle } from './UiPrimitives';

export const LoginView: React.FC = () => {
  const { tenantProfile, loginWithCredentials } = useAppShell();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setErrorMsg('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await loginWithCredentials(loginId.trim(), password);
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
        padding: '24px',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(400px, 100%)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: 'none',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid var(--table-row-border)',
            paddingBottom: '12px',
          }}
        >
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginBottom: '4px',
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

        <VerticalField label="아이디" required>
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="비밀번호 입력"
            style={controlInputStyle}
          />
        </VerticalField>

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: '9px 12px',
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
            height: '38px',
            marginTop: '4px',
          }}
        >
          {busy ? '인증 처리중' : '로그인'}
        </button>
      </form>
    </div>
  );
};
