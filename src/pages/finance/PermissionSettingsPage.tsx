import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { createEmployeeUser, updateEmployeeHrRecord } from '../../services/domainHrAdminEngine';
import {
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  RENTAL_ONLY_ACTION_CODES,
  TIER_LABELS,
  defaultTierPagePermission,
  formatKoActionCode,
  getMenuGroupsForTenant,
  type FlApprovalPolicy,
  type FlPageId,
  type FlUser,
  type FlUserPermission,
  type TierLevel,
} from '../../types/domain';

export const PermissionSettingsPage: React.FC = () => {
  const {
    currentUser,
    isRentalEnabled,
    datasets,
    refreshAll,
    notifyToast,
    canEditPage,
    navigateTo,
  } = useAppShell();
  const canEdit = canEditPage('permission_settings');

  const visiblePolicies = useMemo(
    () =>
      isRentalEnabled
        ? datasets.approvalPolicies
        : datasets.approvalPolicies.filter(
            (p) => !RENTAL_ONLY_ACTION_CODES.includes(p.actionCode)
          ),
    [datasets.approvalPolicies, isRentalEnabled]
  );
  const tenantMenuRows = useMemo(
    () =>
      getMenuGroupsForTenant(isRentalEnabled).flatMap((g) =>
        g.items.map((it) => ({ ...it, groupLabel: g.groupLabel }))
      ),
    [isRentalEnabled]
  );

  const [tab, setTab] = useState<'USERS' | 'POLICIES' | 'PERMS' | 'USER_PERMS'>('USERS');
  const [busy, setBusy] = useState(false);

  // 신규 사용자 등록
  const [newLoginId, setNewLoginId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newTier, setNewTier] = useState<TierLevel>(1);
  const [newMaskPrice, setNewMaskPrice] = useState(false);

  // 티어 권한 매트릭스 편집
  const [permTier, setPermTier] = useState<TierLevel>(2);

  const userById = useMemo(
    () => new Map(datasets.users.map((u) => [u.id, u])),
    [datasets.users]
  );

  const { tierPermMap, userPermMap } = useMemo(() => {
    const tMap = new Map<string, FlUserPermission>();
    const uMap = new Map<string, FlUserPermission>();
    for (const p of datasets.userPermissions) {
      if (p.userId) {
        const key = `${p.userId}:${p.pageId}`;
        if (!uMap.has(key)) uMap.set(key, p);
      } else {
        const key = `${p.tierLevel}:${p.pageId}`;
        if (!tMap.has(key)) tMap.set(key, p);
      }
    }
    return { tierPermMap: tMap, userPermMap: uMap };
  }, [datasets.userPermissions]);

  // 임직원 개인별 권한 편집
  const [permUserId, setPermUserId] = useState<string>(() => datasets.users[0]?.id || '');
  const selectedPermUser =
    (permUserId ? userById.get(permUserId) : undefined) || datasets.users[0] || null;

  const handleUpdateUserTier = async (u: FlUser, tierLevel: TierLevel, maskSalesPrice: boolean) => {
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: u,
        patch: { tierLevel, maskSalesPrice },
        reason: '권한 설정 변경',
        actor: {
          id: currentUser?.id || 'u-1',
          name: currentUser?.name || '관리자',
        },
      });
      await refreshAll();
      notifyToast(`${u.name} 직급 티어 저장 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사용자 변경 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newLoginId.trim() || !newName.trim() || !newPass) {
      notifyToast('아이디, 이름, 비밀번호를 모두 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      await createEmployeeUser({
        loginId: newLoginId,
        initialPassword: newPass,
        name: newName,
        tierLevel: newTier,
        maskSalesPrice: newMaskPrice,
        actor: {
          id: currentUser?.id || 'u-1',
          name: currentUser?.name || '관리자',
        },
      });
      setNewLoginId('');
      setNewName('');
      setNewPass('');
      await refreshAll();
      notifyToast('신규 사용자 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사용자 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePerm = async (
    pageId: FlPageId,
    field: 'canView' | 'canEdit' | 'canApprove',
    val: boolean
  ) => {
    setBusy(true);
    try {
      const existing = tierPermMap.get(`${permTier}:${pageId}`);
      if (existing) {
        await execDbMutation('티어 권한 수정', () =>
          flSupabase
            .from('user_permissions')
            .update(camelToSnakeRow({ [field]: val }))
            .eq('id', existing.id)
        );
      } else {
        const fallback = defaultTierPagePermission(pageId, permTier);
        await execDbMutation('티어 권한 생성', () =>
          flSupabase.from('user_permissions').insert(
            camelToSnakeRow({
              id: newId('PERM'),
              tenantId: DEFAULT_TENANT_ID,
              tierLevel: permTier,
              pageId,
              canView: field === 'canView' ? val : fallback.canView,
              canEdit: field === 'canEdit' ? val : fallback.canEdit,
              canApprove: field === 'canApprove' ? val : fallback.canApprove,
            })
          )
        );
      }
      await refreshAll();
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '권한 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserPerm = async (
    pageId: FlPageId,
    field: 'canView' | 'canEdit' | 'canApprove',
    val: boolean
  ) => {
    if (!selectedPermUser) return;
    setBusy(true);
    try {
      const existing = userPermMap.get(`${selectedPermUser.id}:${pageId}`);
      if (existing) {
        await execDbMutation('개인별 화면 권한 수정', () =>
          flSupabase
            .from('user_permissions')
            .update(camelToSnakeRow({ [field]: val }))
            .eq('id', existing.id)
        );
      } else {
        const tierRule = tierPermMap.get(`${selectedPermUser.tierLevel}:${pageId}`);
        const fallback = tierRule || defaultTierPagePermission(pageId, selectedPermUser.tierLevel);
        await execDbMutation('개인별 화면 권한 등록', () =>
          flSupabase.from('user_permissions').insert(
            camelToSnakeRow({
              id: newId('PERM'),
              tenantId: DEFAULT_TENANT_ID,
              userId: selectedPermUser.id,
              tierLevel: selectedPermUser.tierLevel,
              pageId,
              canView: field === 'canView' ? val : fallback.canView,
              canEdit: field === 'canEdit' ? val : fallback.canEdit,
              canApprove: field === 'canApprove' ? val : fallback.canApprove,
            })
          )
        );
      }
      await refreshAll();
      notifyToast(`${selectedPermUser.name} 개인별 화면 권한 저장 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '개인별 권한 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResetUserPerms = async () => {
    if (!selectedPermUser) return;
    setBusy(true);
    try {
      await execDbMutation('개인별 화면 권한 초기화', () =>
        flSupabase.from('user_permissions').delete().eq('user_id', selectedPermUser.id)
      );
      await refreshAll();
      notifyToast(`${selectedPermUser.name} 개인별 권한이 티어 기본값으로 초기화되었습니다.`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '개인별 권한 초기화 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const renderTierPermCheckbox = (
    pageId: FlPageId,
    field: 'canView' | 'canEdit' | 'canApprove'
  ) => {
    const p = tierPermMap.get(`${permTier}:${pageId}`);
    const checked = p ? p[field] : defaultTierPagePermission(pageId, permTier)[field];
    return (
      <input
        type="checkbox"
        disabled={!canEdit || busy}
        checked={checked}
        onChange={(e) => handleTogglePerm(pageId, field, e.target.checked)}
      />
    );
  };

  const renderUserPermCheckbox = (
    user: FlUser,
    pageId: FlPageId,
    field: 'canView' | 'canEdit' | 'canApprove'
  ) => {
    const userRule = userPermMap.get(`${user.id}:${pageId}`);
    const tierRule = tierPermMap.get(`${user.tierLevel}:${pageId}`);
    const checked =
      user.tierLevel >= 7
        ? true
        : userRule
          ? userRule[field]
          : tierRule
            ? tierRule[field]
            : defaultTierPagePermission(pageId, user.tierLevel)[field];
    return (
      <input
        type="checkbox"
        disabled={!canEdit || busy || user.tierLevel >= 7}
        checked={checked}
        onChange={(e) => handleToggleUserPerm(pageId, field, e.target.checked)}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="권한 설정 · 7단계 티어 · 결재선 · 화면 권한"
        manualId="perm-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'USERS', label: '사용자 7단계 티어' },
              { id: 'POLICIES', label: '결재 기준 정책' },
              { id: 'PERMS', label: '티어별 화면 권한' },
              { id: 'USER_PERMS', label: '임직원 개인별 권한' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        }
      >
        <div data-manual-id="perm-body">
          {tab === 'USERS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              {canEdit && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
                  <VerticalField label="아이디" required>
                    <input
                      type="text"
                      value={newLoginId}
                      onChange={(e) => setNewLoginId(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="성명" required>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="초기 비밀번호" required>
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="직급 티어" required>
                    <select
                      value={newTier}
                      onChange={(e) => setNewTier(Number(e.target.value) as TierLevel)}
                      style={controlInputStyle}
                    >
                      {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                        <option key={t} value={t}>
                          {TIER_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </VerticalField>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', height: 'var(--space-control-h)', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newMaskPrice}
                      onChange={(e) => setNewMaskPrice(e.target.checked)}
                    />
                    판매단가 비공개
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCreateUser}
                    style={actionBtnStyle('primary')}
                  >
                    사용자 추가
                  </button>
                </div>
              )}

              <DataGrid
                columns={[
                  {
                    key: 'hrLink',
                    header: '인사카드',
                    width: 90,
                    align: 'center',
                    stickyLeft: true,
                    render: () => (
                      <button
                        type="button"
                        onClick={() => navigateTo('organization_hr')}
                        style={actionBtnStyle('secondary', true)}
                      >
                        인사 관리
                      </button>
                    ),
                  },
                  { key: 'employeeNo', header: '사번', width: 96, render: (u) => u.employeeNo || '-' },
                  { key: 'loginId', header: '아이디', width: 110, render: (u) => u.loginId },
                  { key: 'name', header: '성명', width: 100, render: (u) => <span style={{ fontWeight: 700 }}>{u.name}</span> },
                  { key: 'dept', header: '소속 부서', width: 110, render: (u) => u.departmentName || '미배정' },
                  { key: 'pos', header: '직책', width: 100, render: (u) => u.position || '-' },
                  {
                    key: 'tier',
                    header: '7단계 티어 지정',
                    width: 190,
                    render: (u) => (
                      <select
                        disabled={!canEdit || busy}
                        value={u.tierLevel}
                        onChange={(e) =>
                          handleUpdateUserTier(
                            u,
                            Number(e.target.value) as TierLevel,
                            u.maskSalesPrice
                          )
                        }
                        style={{ ...controlInputStyle, height: '28px', fontSize: '12px' }}
                      >
                        {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                  {
                    key: 'mask',
                    header: '판매단가 비공개',
                    width: 125,
                    align: 'center',
                    render: (u) => (
                      <input
                        type="checkbox"
                        disabled={!canEdit || busy}
                        checked={u.maskSalesPrice}
                        onChange={(e) =>
                          handleUpdateUserTier(u, u.tierLevel, e.target.checked)
                        }
                      />
                    ),
                  },
                  {
                    key: 'active',
                    header: '상태',
                    width: 80,
                    align: 'center',
                    render: (u) => <StatusBadge label={u.isActive ? '재직' : '중지'} tone={u.isActive ? 'success' : 'neutral'} />,
                  },
                ]}
                rows={datasets.users}
                rowKey={(u) => u.id}
                maxHeight="clamp(300px, calc(100vh - 300px), 760px)"
              />
            </div>
          )}

          {tab === 'POLICIES' && (
            <PolicyEditorGrid
              policies={visiblePolicies}
              isRentalEnabled={isRentalEnabled}
              canEdit={canEdit}
              onRefresh={refreshAll}
              onToast={notifyToast}
            />
          )}

          {tab === 'PERMS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              <VerticalField label="편집할 기준 직급 티어 선택" width={240}>
                <select
                  value={permTier}
                  onChange={(e) => setPermTier(Number(e.target.value) as TierLevel)}
                  style={controlInputStyle}
                >
                  {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <DataGrid
                columns={[
                  { key: 'grp', header: '메뉴 그룹', width: 150, render: (r) => r.groupLabel },
                  { key: 'label', header: '화면명', render: (r) => r.label },
                  {
                    key: 'view',
                    header: '조회',
                    width: 80,
                    align: 'center',
                    render: (r) => renderTierPermCheckbox(r.pageId, 'canView'),
                  },
                  {
                    key: 'edit',
                    header: '편집',
                    width: 80,
                    align: 'center',
                    render: (r) => renderTierPermCheckbox(r.pageId, 'canEdit'),
                  },
                  {
                    key: 'approve',
                    header: '승인',
                    width: 80,
                    align: 'center',
                    render: (r) => renderTierPermCheckbox(r.pageId, 'canApprove'),
                  },
                ]}
                rows={tenantMenuRows}
                rowKey={(r) => r.pageId}
                maxHeight="clamp(300px, calc(100vh - 300px), 760px)"
              />
            </div>
          )}

          {tab === 'USER_PERMS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <VerticalField label="권한을 설정할 임직원 선택" width={300}>
                  <select
                    value={selectedPermUser?.id || ''}
                    onChange={(e) => setPermUserId(e.target.value)}
                    style={controlInputStyle}
                  >
                    {datasets.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.loginId} ({TIER_LABELS[u.tierLevel]})
                      </option>
                    ))}
                  </select>
                </VerticalField>
                {canEdit && selectedPermUser && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResetUserPerms}
                    style={actionBtnStyle('secondary', true)}
                  >
                    개인별 권한 전체 초기화
                  </button>
                )}
              </div>

              {selectedPermUser && (
                <DataGrid
                  columns={[
                    { key: 'grp', header: '메뉴 그룹', width: 150, render: (r) => r.groupLabel },
                    { key: 'label', header: '화면명', render: (r) => r.label },
                    {
                      key: 'source',
                      header: '적용 기준',
                      width: 100,
                      align: 'center',
                      render: (r) => {
                        const userRule = userPermMap.get(`${selectedPermUser.id}:${r.pageId}`);
                        return (
                          <StatusBadge
                            label={userRule ? '개별설정' : '티어기준'}
                            tone={userRule ? 'primary' : 'neutral'}
                          />
                        );
                      },
                    },
                    {
                      key: 'view',
                      header: '조회',
                      width: 80,
                      align: 'center',
                      render: (r) => renderUserPermCheckbox(selectedPermUser, r.pageId, 'canView'),
                    },
                    {
                      key: 'edit',
                      header: '편집',
                      width: 80,
                      align: 'center',
                      render: (r) => renderUserPermCheckbox(selectedPermUser, r.pageId, 'canEdit'),
                    },
                    {
                      key: 'approve',
                      header: '승인',
                      width: 80,
                      align: 'center',
                      render: (r) => renderUserPermCheckbox(selectedPermUser, r.pageId, 'canApprove'),
                    },
                  ]}
                  rows={tenantMenuRows}
                  rowKey={(r) => r.pageId}
                  maxHeight="clamp(300px, calc(100vh - 320px), 760px)"
                />
              )}
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
};

const PolicyEditorGrid: React.FC<{
  policies: FlApprovalPolicy[];
  isRentalEnabled: boolean;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: 'info' | 'success' | 'error') => void;
}> = ({ policies, isRentalEnabled, canEdit, onRefresh, onToast }) => {
  const [drafts, setDrafts] = useState<Record<string, { requiredTier: TierLevel; requiresApproval: boolean }>>({});

  return (
    <DataGrid
      columns={[
        {
          key: 'code',
          header: '업무구분',
          width: 155,
          render: (p) => formatKoActionCode(p.actionCode, isRentalEnabled),
        },
        {
          key: 'name',
          header: '업무행위',
          width: 170,
          render: (p) => (
            <span style={{ fontWeight: 700 }}>
              {!isRentalEnabled && p.actionCode === 'FULFILLMENT_COMPLETE'
                ? '출고 실행완료'
                : p.actionName}
            </span>
          ),
        },
        {
          key: 'desc',
          header: '적용 설명',
          render: (p) => {
            if (!isRentalEnabled) {
              if (p.actionCode === 'FULFILLMENT_COMPLETE') return '희망완료일 기준 유통 출고 확정 처리';
              if (p.actionCode === 'AP_SETTLEMENT_PAY') return '매입채무·운송비 지급 확정';
            }
            return p.description || '-';
          },
        },
        {
          key: 'req',
          header: '결재사용',
          width: 80,
          align: 'center',
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return (
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={d.requiresApproval}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [p.id]: { ...d, requiresApproval: e.target.checked },
                  }))
                }
              />
            );
          },
        },
        {
          key: 'tier',
          header: '필요 티어',
          width: 175,
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return (
              <select
                disabled={!canEdit}
                value={d.requiredTier}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [p.id]: { ...d, requiredTier: Number(e.target.value) as TierLevel },
                  }))
                }
                style={{ ...controlInputStyle, height: '28px', fontSize: '12px' }}
              >
                {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            );
          },
        },
        {
          key: 'save',
          header: '저장',
          width: 90,
          align: 'center',
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return canEdit ? (
              <CommitActionButton
                actionCode="POLICY_CONFIG_SAVE"
                targetTable="fl_approval_policies"
                targetId={p.id}
                title={`결재 기준 변경 · ${p.actionName}`}
                buildPayload={() => ({
                  policyId: p.id,
                  requiredTier: d.requiredTier,
                  requiresApproval: d.requiresApproval,
                })}
                onExecuteDirect={async () => {
                  await execDbMutation('결재 기준 저장', () =>
                    flSupabase
                      .from('approval_policies')
                      .update(
                        camelToSnakeRow({
                          requiredTier: d.requiredTier,
                          requiresApproval: d.requiresApproval,
                          updatedAt: new Date().toISOString(),
                        })
                      )
                      .eq('id', p.id)
                  );
                  await onRefresh();
                  onToast(`${p.actionName} 결재 기준 저장 완료`, 'success');
                }}
                label="저장"
              />
            ) : (
              '-'
            );
          },
        },
      ]}
      rows={policies}
      rowKey={(p) => p.id}
      maxHeight="clamp(300px, calc(100vh - 300px), 760px)"
    />
  );
};
