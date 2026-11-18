import React, { useMemo } from 'react';
import { Building2, Download, Plus, Search, UserPlus, Users } from 'lucide-react';
import { type EmploymentStatus, type FlDepartment, type FlUser } from '../../types/domain';
import {
  ConservationBar,
  DataGrid,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import { type DeptNode } from './hrHelpers';

function deptTreeItemStyle(
  active: boolean,
  leftPadding?: string,
  inactiveColor = 'var(--text-main)'
): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: leftPadding
      ? `var(--space-table-td-pad-y) var(--space-inline-gap) var(--space-table-td-pad-y) ${leftPadding}`
      : 'var(--space-table-td-pad-y) var(--space-inline-gap)',
    borderRadius: '5px',
    border: '1px solid transparent',
    backgroundColor: active ? 'var(--primary-light)' : 'transparent',
    color: active ? 'var(--primary)' : inactiveColor,
    fontSize: '12.5px',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
}

export interface HrDepartmentTreePanelProps {
  departments: FlDepartment[];
  deptTree: DeptNode[];
  users: FlUser[];
  deptHeadcountMap: Map<string, number>;
  selectedDeptId: string;
  statusFilter: 'ALL' | EmploymentStatus;
  keyword: string;
  filteredCount: number;
  busy: boolean;
  canEdit: boolean;
  onSelectDept: (deptId: string) => void;
  onChangeStatusFilter: (status: 'ALL' | EmploymentStatus) => void;
  onChangeKeyword: (keyword: string) => void;
  onExportExcel: () => void;
  onOpenDeptModal: () => void;
  onOpenNewUserModal: () => void;
  children: React.ReactNode;
}

/**
 * 임직원 인사원장 탭의 부서/상태 필터 바, 좌측 부서 계층 트리 사이드바, 정원 대차 검증 바를 렌더링한다.
 */
export const HrDepartmentTreePanel: React.FC<HrDepartmentTreePanelProps> = ({
  departments,
  deptTree,
  users,
  deptHeadcountMap,
  selectedDeptId,
  statusFilter,
  keyword,
  filteredCount,
  busy,
  canEdit,
  onSelectDept,
  onChangeStatusFilter,
  onChangeKeyword,
  onExportExcel,
  onOpenDeptModal,
  onOpenNewUserModal,
  children,
}) => {
  const headcountSummary = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'ACTIVE').length;
    const leave = users.filter((u) => u.status === 'LEAVE_OF_ABSENCE').length;
    const retired = users.filter((u) => u.status === 'RETIRED').length;
    const balanced = total === active + leave + retired;
    return { total, active, leave, retired, balanced };
  }, [users]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div
        data-manual-id="hr-filter"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-stack-gap)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
          <VerticalField label="소속 부서 필터" width={170}>
            <select
              value={selectedDeptId}
              onChange={(e) => onSelectDept(e.target.value)}
              style={controlInputStyle}
            >
              <option value="ALL">전체 부서</option>
              {deptTree.map(({ dept, depth }) => (
                <option key={dept.id} value={dept.id}>
                  {'  '.repeat(depth)}
                  {dept.name}
                </option>
              ))}
              <option value="UNASSIGNED">미배정</option>
            </select>
          </VerticalField>

          <VerticalField label="재직 상태" width={130}>
            <select
              value={statusFilter}
              onChange={(e) => onChangeStatusFilter(e.target.value as 'ALL' | EmploymentStatus)}
              style={controlInputStyle}
            >
              <option value="ALL">전체 상태</option>
              <option value="ACTIVE">재직</option>
              <option value="LEAVE_OF_ABSENCE">휴직</option>
              <option value="RETIRED">퇴사</option>
            </select>
          </VerticalField>

          <VerticalField label="임직원 검색" width={230}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: '9px', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={keyword}
                onChange={(e) => onChangeKeyword(e.target.value)}
                placeholder="사번, 아이디, 성명, 직책 검색"
                style={{ ...controlInputStyle, paddingLeft: '28px' }}
              />
            </div>
          </VerticalField>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={onExportExcel}
            style={actionBtnStyle('secondary')}
          >
            <Download size={14} />
            인사대장 엑셀
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onOpenDeptModal}
                style={actionBtnStyle('secondary')}
              >
                <Building2 size={14} />
                부서 추가
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onOpenNewUserModal}
                style={actionBtnStyle('primary')}
              >
                <UserPlus size={14} />
                신규 입사 등록
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 'var(--space-stack-gap)', alignItems: 'start' }}>
        <div
          data-manual-id="hr-dept-tree"
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-secondary)',
            padding: 'var(--space-compact-pad-x)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-label-gap)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 'var(--space-tight-gap)',
              marginBottom: 'var(--space-label-gap)',
              borderBottom: '1px solid var(--table-row-border)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'max(2px, calc(5px - 2pt))', whiteSpace: 'nowrap' }}>
              <Users size={13} />
              조직 계층도
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{departments.length}개 부서</span>
          </div>

          <button
            type="button"
            onClick={() => onSelectDept('ALL')}
            style={deptTreeItemStyle(selectedDeptId === 'ALL')}
          >
            <span>전체 조직</span>
            <span>{headcountSummary.active + headcountSummary.leave}명</span>
          </button>

          {deptTree.map(({ dept, depth }) => {
            const active = selectedDeptId === dept.id;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => onSelectDept(dept.id)}
                style={deptTreeItemStyle(active, `${6 + depth * 12}px`)}
              >
                <span>
                  {depth > 0 ? 'ㄴ ' : ''}
                  {dept.name}
                </span>
                <span>{deptHeadcountMap.get(dept.id) || 0}명</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onSelectDept('UNASSIGNED')}
            style={deptTreeItemStyle(selectedDeptId === 'UNASSIGNED', undefined, 'var(--text-secondary)')}
          >
            <span>미배정 인원</span>
            <span>{deptHeadcountMap.get('UNASSIGNED') || 0}명</span>
          </button>
        </div>

        {children}
      </div>

      <ConservationBar
        manualId="hr-conservation"
        balanced={headcountSummary.balanced}
        balanceMessage={headcountSummary.balanced ? '정원 검증 일치' : '정원 집계 불일치'}
        items={[
          { label: '전체 임직원', value: `${headcountSummary.total}명`, tone: 'primary' },
          { label: '재직', value: `${headcountSummary.active}명`, tone: 'success' },
          { label: '휴직', value: `${headcountSummary.leave}명`, tone: 'warning' },
          { label: '퇴사', value: `${headcountSummary.retired}명`, tone: 'danger' },
          { label: '현재 조회', value: `${filteredCount}명`, tone: 'neutral' },
        ]}
      />
    </div>
  );
};

export interface HrDepartmentOrgPanelProps {
  departments: FlDepartment[];
  deptTree: DeptNode[];
  deptHeadcountMap: Map<string, number>;
  deptNameMap: Record<string, string>;
  userNameMap: Record<string, string>;
  visibleDeptFuncTags: string[];
  canEdit: boolean;
  onOpenDeptModal: (dept?: FlDepartment) => void;
}

/**
 * 부서 조직도 탭의 부서 계층 그리드와 부서 수·미배정 인원 요약 바를 렌더링한다.
 */
export const HrDepartmentOrgPanel: React.FC<HrDepartmentOrgPanelProps> = ({
  departments,
  deptTree,
  deptHeadcountMap,
  deptNameMap,
  userNameMap,
  visibleDeptFuncTags,
  canEdit,
  onOpenDeptModal,
}) => {
  const visibleDeptFuncTagSet = useMemo(() => new Set<string>(visibleDeptFuncTags), [visibleDeptFuncTags]);

  const deptColumns: GridColumn<DeptNode>[] = [
    {
      key: 'action',
      header: '관리',
      width: 74,
      align: 'center',
      stickyLeft: true,
      render: ({ dept }) => (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onOpenDeptModal(dept)}
          style={actionBtnStyle('secondary', true)}
        >
          수정
        </button>
      ),
    },
    { key: 'sortOrder', header: '정렬', width: 66, align: 'right', render: ({ dept }) => dept.sortOrder },
    {
      key: 'name',
      header: '부서명',
      width: 180,
      render: ({ dept, depth }) => (
        <span style={{ paddingLeft: `${depth * 16}px`, fontWeight: 700 }}>
          {depth > 0 ? 'ㄴ ' : ''}
          {dept.name}
        </span>
      ),
    },
    {
      key: 'parent',
      header: '상위 부서',
      width: 130,
      render: ({ dept }) => (dept.parentDepartmentId ? deptNameMap[dept.parentDepartmentId] || '-' : '최상위'),
    },
    {
      key: 'manager',
      header: '부서장',
      width: 100,
      render: ({ dept }) => dept.managerName || (dept.managerId ? userNameMap[dept.managerId] || '-' : '-'),
    },
    {
      key: 'tags',
      header: '업무 기능',
      width: 280,
      render: ({ dept }) => {
        const shownTags = dept.functionalTags.filter((t) => visibleDeptFuncTagSet.has(t));
        return shownTags.length > 0 ? (
          <div style={{ display: 'flex', gap: 'var(--space-label-gap)', alignItems: 'center' }}>
            {shownTags.map((t) => (
              <StatusBadge key={t} label={t} tone="info" />
            ))}
          </div>
        ) : (
          '-'
        );
      },
    },
    {
      key: 'headcount',
      header: '재직 인원',
      width: 86,
      align: 'right',
      render: ({ dept }) => `${deptHeadcountMap.get(dept.id) || 0}명`,
    },
    {
      key: 'active',
      header: '사용 여부',
      width: 82,
      align: 'center',
      render: ({ dept }) => <StatusBadge label={dept.isActive ? '사용' : '중지'} tone={dept.isActive ? 'success' : 'neutral'} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
        {canEdit && (
          <button type="button" onClick={() => onOpenDeptModal()} style={actionBtnStyle('primary')}>
            <Plus size={14} />
            신규 부서 등록
          </button>
        )}
      </div>
      <DataGrid
        manualId="hr-dept-tree"
        columns={deptColumns}
        rows={deptTree}
        rowKey={({ dept }) => dept.id}
        maxHeight="clamp(320px, calc(100vh - 260px), 780px)"
      />
      <ConservationBar
        manualId="hr-conservation"
        balanced
        balanceMessage="부서 조직 합계 일치"
        items={[
          { label: '전체 부서', value: `${departments.length}개`, tone: 'primary' },
          {
            label: '사용 부서',
            value: `${departments.filter((d) => d.isActive).length}개`,
            tone: 'success',
          },
          { label: '미배정 재직자', value: `${deptHeadcountMap.get('UNASSIGNED') || 0}명`, tone: 'warning' },
        ]}
      />
    </div>
  );
};
