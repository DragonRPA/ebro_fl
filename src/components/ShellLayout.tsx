import React, { useMemo, useState } from 'react';
import { BookOpen, Menu, RefreshCw, Search, Sun, Moon, LogOut } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { useManual } from '../manual/ManualContext';
import { ModalDialog, StatusBadge, actionBtnStyle } from './UiPrimitives';

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
  } = useAppShell();

  const { overlayOpen, toggleOverlay, setSearchModalOpen, activeEntry } = useManual();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
              title="단축키 Ctrl+M"
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
