import React, { useMemo, useState } from 'react';
import { BookOpen, KeyRound, Menu, RefreshCw, Search, Sun, Moon, LogOut, UserCog } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { useManual } from '../manual/ManualContext';
import { EMPLOYMENT_STATUS_LABELS, formatKoStatus, type EmploymentStatus } from '../types/domain';
import { ModalDialog, StatusBadge, VerticalField, actionBtnStyle, controlInputStyle } from './UiPrimitives';

export const ShellLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    tenantProfile,
    datasets,
    activePage,
    theme,
    agentOnline,
    visibleMenuGroups,
    errorModalMessage,
    toasts,
    navigateTo,
    toggleTheme,
    logout,
    refreshAll,
    closeErrorModal,
    tierLabel,
    changeOwnPassword,
    updateOwnContactInfo,
  } = useAppShell();

  const { overlayOpen, toggleOverlay, setSearchModalOpen, activeEntry } = useManual();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [myModalOpen, setMyModalOpen] = useState(false);
  const [myTab, setMyTab] = useState<'INFO' | 'PASSWORD'>('INFO');
  const [myPhone, setMyPhone] = useState('');
  const [myEmail, setMyEmail] = useState('');
  const [myAddress, setMyAddress] = useState('');
  const [myEmergency, setMyEmergency] = useState('');
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [myError, setMyError] = useState<string | null>(null);
  const [myBusy, setMyBusy] = useState(false);

  const openMyModal = (initialTab: 'INFO' | 'PASSWORD' = 'INFO') => {
    if (!currentUser) return;
    setMyTab(initialTab);
    setMyPhone(currentUser.phone || '');
    setMyEmail(currentUser.email || '');
    setMyAddress(currentUser.address || '');
    setMyEmergency(currentUser.emergencyContact || '');
    setCurPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMyError(null);
    setMyModalOpen(true);
  };

  const handleSaveMyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyBusy(true);
    setMyError(null);
    try {
      await updateOwnContactInfo({
        phone: myPhone,
        email: myEmail,
        address: myAddress,
        emergencyContact: myEmergency,
      });
      setMyModalOpen(false);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : '개인 정보 저장에 실패했습니다.');
    } finally {
      setMyBusy(false);
    }
  };

  const handleSaveMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyError(null);
    if (!curPassword || !newPassword || !confirmPassword) {
      setMyError('현재 비밀번호와 새 비밀번호를 모두 입력하십시오.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMyError('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setMyBusy(true);
    try {
      await changeOwnPassword(curPassword, newPassword);
      setCurPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMyModalOpen(false);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setMyBusy(false);
    }
  };

  const pendingApprovals = useMemo(() => {
    if (!currentUser) return 0;
    return datasets.approvalRequests.filter(
      (r) => r.status === 'PENDING' && currentUser.tierLevel >= r.requiredTier
    ).length;
  }, [datasets.approvalRequests, currentUser]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-main)',
      }}
    >
      {sidebarOpen && (
        <aside
          style={{
            width: '226px',
            flexShrink: 0,
            backgroundColor: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            position: 'sticky',
            top: 0,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tenantProfile.corporateName}
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tenantProfile.displayName || '이브로 지게차'}
            </div>
          </div>

          <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
            {visibleMenuGroups.map((grp) => (
              <div key={grp.groupId} style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {grp.groupLabel}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {grp.items.map((item) => {
                    const isActive = item.pageId === activePage;
                    const badgeCount = item.pageId === 'approval_inbox' ? pendingApprovals : 0;
                    return (
                      <button
                        key={item.pageId}
                        type="button"
                        onClick={() => navigateTo(item.pageId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          borderLeft: isActive
                            ? '3px solid var(--primary)'
                            : '3px solid transparent',
                          backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                          color: isActive ? 'var(--primary)' : 'var(--text-main)',
                          fontWeight: isActive ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          boxShadow: 'none',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </span>
                        {badgeCount > 0 && (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '10px',
                              backgroundColor: 'var(--danger)',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: '52px',
            backgroundColor: 'var(--bg-header)',
            borderBottom: '1px solid var(--border-color)',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => setSidebarOpen((p) => !p)}
              aria-label="메뉴 전환"
              style={actionBtnStyle('secondary', true)}
            >
              <Menu size={14} />
            </button>
            <h2
              style={{
                margin: 0,
                fontSize: '15.5px',
                fontWeight: 800,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {activeEntry.pageTitle}
            </h2>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
              overflowX: 'auto',
            }}
          >
            <StatusBadge
              label={agentOnline ? '에이전트 연결' : '에이전트 미연결'}
              tone={agentOnline ? 'success' : 'neutral'}
            />

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              style={actionBtnStyle('secondary', true)}
            >
              <RefreshCw size={13} />
              새로고침
            </button>

            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              style={actionBtnStyle('secondary', true)}
            >
              <Search size={13} />
              매뉴얼 검색
            </button>

            <button
              type="button"
              onClick={toggleOverlay}
              title="매뉴얼 전환 단축키"
              style={actionBtnStyle(overlayOpen ? 'primary' : 'secondary', true)}
            >
              <BookOpen size={13} />
              매뉴얼 오버레이
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              style={actionBtnStyle('secondary', true)}
            >
              {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
              {theme === 'light' ? '다크' : '라이트'}
            </button>

            {currentUser && (
              <StatusBadge
                label={`${currentUser.name} · ${tierLabel(currentUser.tierLevel)}`}
                tone="primary"
              />
            )}

            {currentUser && (
              <button
                type="button"
                onClick={() => openMyModal('INFO')}
                style={{ ...actionBtnStyle('secondary', true), whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <UserCog size={13} />
                내 정보 · 비밀번호
              </button>
            )}

            <button type="button" onClick={logout} style={actionBtnStyle('secondary', true)}>
              <LogOut size={13} />
              로그아웃
            </button>
          </div>
        </header>

        <main
          style={{
            flex: 1,
            padding: '16px 20px 28px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {currentUser?.mustChangePassword && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '6px',
                border: '1px solid var(--warning)',
                backgroundColor: 'var(--warning-light)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <span>초기 또는 임시 비밀번호 상태입니다. 보안을 위해 새 비밀번호로 변경하십시오.</span>
              <button
                type="button"
                onClick={() => openMyModal('PASSWORD')}
                style={{ ...actionBtnStyle('primary', true), whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                비밀번호 변경
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      <ModalDialog
        open={Boolean(errorModalMessage)}
        title="처리 오류 알림"
        onClose={closeErrorModal}
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--danger)', fontWeight: 600 }}>
            {errorModalMessage}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeErrorModal} style={actionBtnStyle('primary')}>
              확인
            </button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={myModalOpen}
        title="내 정보 · 비밀번호 변경"
        width={620}
        onClose={() => setMyModalOpen(false)}
      >
        {currentUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '8px',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary)',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>사번 · 아이디</div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {currentUser.employeeNo || '-'} · {currentUser.loginId}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>소속 · 직책</div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {currentUser.departmentName || '미배정'} · {currentUser.position || '-'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>티어 · 상태</div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {tierLabel(currentUser.tierLevel)} ·{' '}
                  {EMPLOYMENT_STATUS_LABELS[(currentUser.status as EmploymentStatus) || 'ACTIVE'] ||
                    formatKoStatus(currentUser.status)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>연차 잔여 / 부여</div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {Math.max(0, Number(currentUser.annualLeaveGrant || 0) - Number(currentUser.annualLeaveUsed || 0)).toFixed(1)}일 /{' '}
                  {Number(currentUser.annualLeaveGrant || 0).toFixed(1)}일
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setMyTab('INFO');
                  setMyError(null);
                }}
                style={actionBtnStyle(myTab === 'INFO' ? 'primary' : 'secondary', true)}
              >
                <UserCog size={13} />
                개인 연락처
              </button>
              <button
                type="button"
                onClick={() => {
                  setMyTab('PASSWORD');
                  setMyError(null);
                }}
                style={actionBtnStyle(myTab === 'PASSWORD' ? 'primary' : 'secondary', true)}
              >
                <KeyRound size={13} />
                비밀번호 변경
              </button>
            </div>

            {myTab === 'INFO' ? (
              <form onSubmit={handleSaveMyContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <VerticalField label="연락처">
                    <input
                      type="text"
                      value={myPhone}
                      onChange={(e) => setMyPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="이메일">
                    <input
                      type="email"
                      value={myEmail}
                      onChange={(e) => setMyEmail(e.target.value)}
                      placeholder="이메일 입력"
                      style={controlInputStyle}
                    />
                  </VerticalField>
                </div>
                <VerticalField label="주소">
                  <input
                    type="text"
                    value={myAddress}
                    onChange={(e) => setMyAddress(e.target.value)}
                    placeholder="거주지 주소 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="비상연락처">
                  <input
                    type="text"
                    value={myEmergency}
                    onChange={(e) => setMyEmergency(e.target.value)}
                    placeholder="관계 및 연락처 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                {myError && (
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--danger)' }}>
                    {myError}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button type="button" onClick={() => setMyModalOpen(false)} style={actionBtnStyle('secondary')}>
                    취소
                  </button>
                  <button type="submit" disabled={myBusy} style={actionBtnStyle('primary')}>
                    {myBusy ? '저장 중' : '연락처 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveMyPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <VerticalField label="현재 비밀번호" required>
                  <input
                    type="password"
                    value={curPassword}
                    onChange={(e) => setCurPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="현재 비밀번호 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="새 비밀번호" required>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="4자 이상 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="새 비밀번호 확인" required>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="새 비밀번호 재입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                {myError && (
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--danger)' }}>
                    {myError}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button type="button" onClick={() => setMyModalOpen(false)} style={actionBtnStyle('secondary')}>
                    취소
                  </button>
                  <button type="submit" disabled={myBusy} style={actionBtnStyle('primary')}>
                    {myBusy ? '변경 중' : '비밀번호 변경'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </ModalDialog>

      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: 9500,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '380px',
          }}
        >
          {toasts.map((t) => {
            const borderColor =
              t.kind === 'error'
                ? 'var(--danger)'
                : t.kind === 'success'
                  ? 'var(--success)'
                  : 'var(--primary)';
            const bgColor =
              t.kind === 'error'
                ? 'var(--danger-light)'
                : t.kind === 'success'
                  ? 'var(--success-light)'
                  : 'var(--bg-card)';
            return (
              <div
                key={t.id}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: bgColor,
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  fontWeight: 600,
                  boxShadow: 'none',
                }}
              >
                {t.message}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
