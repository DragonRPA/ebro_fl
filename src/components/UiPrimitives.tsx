import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileSpreadsheet, Mail, Search, ChevronDown } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { usePageActive } from '../core/PageActivityContext';
import { matchesKoreanQuery } from '../utils/hangulSearch';
import { formatKoStatus, koStatusTone, type FlItemMaster, type FlPartner } from '../types/domain';
import {
  downloadExcelFile,
  openExcelInAgent,
  sendDocumentEmailViaAgent,
} from '../services/documentService';

export const controlInputStyle: React.CSSProperties = {
  height: 'var(--space-control-h)',
  padding: '0 var(--space-control-pad-x)',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-app)',
  color: 'var(--text-main)',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  boxShadow: 'none',
};

function formatCommaDisplayValue(value: number, allowDecimal: boolean, maxDecimals: number): string {
  if (!Number.isFinite(value)) return '0';
  const decimals = allowDecimal ? maxDecimals : 0;
  const rounded = Number(value.toFixed(decimals));
  const [intPart, decPart] = String(rounded).split('.');
  const formattedInt = Number(intPart || '0').toLocaleString('ko-KR');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

function parseAndFormatCommaDraft(
  raw: string,
  allowDecimal: boolean,
  maxDecimals: number
): { display: string; numeric: number } {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return { display: '', numeric: 0 };
  if (!allowDecimal) {
    const digits = cleaned.replace(/\./g, '');
    if (!digits) return { display: '', numeric: 0 };
    const n = Number(digits);
    return {
      display: Number.isFinite(n) ? n.toLocaleString('ko-KR') : '',
      numeric: Number.isFinite(n) ? n : 0,
    };
  }
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx === -1) {
    const n = Number(cleaned);
    return {
      display: Number.isFinite(n) ? n.toLocaleString('ko-KR') : '',
      numeric: Number.isFinite(n) ? n : 0,
    };
  }
  const intRaw = cleaned.slice(0, dotIdx);
  const decRaw = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, maxDecimals);
  const intNum = intRaw ? Number(intRaw) : 0;
  const formattedInt = Number.isFinite(intNum) ? intNum.toLocaleString('ko-KR') : '0';
  const parsed = Number(`${intRaw || '0'}.${decRaw || '0'}`);
  return {
    display: `${formattedInt}.${decRaw}`,
    numeric: Number.isFinite(parsed) ? parsed : 0,
  };
}

export interface CommaNumberInputProps {
  value: number;
  onChange: (nextValue: number) => void;
  allowDecimal?: boolean;
  maxDecimals?: number;
  min?: number;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  dataTestId?: string;
  dataManualWage?: boolean;
}

export const CommaNumberInput: React.FC<CommaNumberInputProps> = ({
  value,
  onChange,
  allowDecimal = false,
  maxDecimals = 4,
  min,
  disabled = false,
  placeholder,
  style,
  dataTestId,
  dataManualWage,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue = focused
    ? draft
    : formatCommaDisplayValue(Number(value || 0), allowDecimal, maxDecimals);

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      disabled={disabled}
      placeholder={placeholder}
      data-testid={dataTestId}
      data-manual-wage={dataManualWage ? 'true' : undefined}
      value={displayValue}
      onFocus={() => {
        setFocused(true);
        setDraft(formatCommaDisplayValue(Number(value || 0), allowDecimal, maxDecimals));
      }}
      onChange={(e) => {
        const { display, numeric } = parseAndFormatCommaDraft(
          e.target.value,
          allowDecimal,
          maxDecimals
        );
        setDraft(display);
        onChange(numeric);
      }}
      onBlur={() => {
        setFocused(false);
        const current = Number(value || 0);
        if (min !== undefined && (!Number.isFinite(current) || current < min)) {
          onChange(min);
        }
      }}
      style={{
        ...controlInputStyle,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    />
  );
};

export const controlTextareaStyle: React.CSSProperties = {
  padding: 'var(--space-textarea-pad-y) var(--space-control-pad-x)',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-app)',
  color: 'var(--text-main)',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  boxShadow: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};

export function actionBtnStyle(
  variant: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' = 'secondary',
  small = false
): React.CSSProperties {
  const bgMap: Record<string, string> = {
    primary: 'var(--primary)',
    secondary: 'var(--bg-card)',
    danger: 'var(--danger)',
    success: 'var(--success)',
    warning: 'var(--warning)',
  };
  const fgMap: Record<string, string> = {
    primary: '#ffffff',
    secondary: 'var(--text-main)',
    danger: '#ffffff',
    success: '#ffffff',
    warning: '#ffffff',
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: small ? 'var(--space-control-h-sm)' : 'var(--space-control-h)',
    padding: small ? '0 var(--space-btn-sm-pad-x)' : '0 var(--space-btn-pad-x)',
    borderRadius: '6px',
    border: variant === 'secondary' ? '1px solid var(--border-color)' : '1px solid transparent',
    backgroundColor: bgMap[variant],
    color: fgMap[variant],
    fontSize: small ? '12px' : '12.5px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxShadow: 'none',
  };
}

export interface VerticalFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  minWidth?: number | string;
  width?: number | string;
  flex?: string | number;
  manualId?: string;
}

export const VerticalField: React.FC<VerticalFieldProps> = ({
  label,
  required,
  children,
  minWidth = 120,
  width,
  flex,
  manualId,
}) => (
  <div
    data-manual-id={manualId}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-label-gap)',
      minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth,
      width: typeof width === 'number' ? `${width}px` : width,
      flex,
    }}
  >
    <label
      style={{
        fontSize: '11.5px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: 1.25,
      }}
    >
      {label}
      {required && <span style={{ color: 'var(--danger)', marginLeft: '3px' }}>*</span>}
    </label>
    {children}
  </div>
);

export interface SegmentedTabOption {
  id: string;
  label: string;
  count?: number;
}

export const SegmentedTabs: React.FC<{
  tabs: SegmentedTabOption[];
  activeId: string;
  onChange: (id: string) => void;
  manualId?: string;
}> = ({ tabs, activeId, onChange, manualId }) => (
  <div className="segmented-tab-group" data-manual-id={manualId} style={{ boxShadow: 'none' }}>
    {tabs.map((tab) => {
      const active = tab.id === activeId;
      return (
        <button
          key={tab.id}
          type="button"
          className={`segmented-tab-item ${active ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {tab.label}
          {typeof tab.count === 'number' ? ` · ${tab.count}` : ''}
        </button>
      );
    })}
  </div>
);

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const StatusBadge: React.FC<{ label: string; tone?: BadgeTone }> = ({
  label,
  tone,
}) => {
  const toneStyles: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
    neutral: {
      bg: 'var(--bg-secondary)',
      fg: 'var(--text-secondary)',
      border: 'var(--border-color)',
    },
    primary: {
      bg: 'var(--primary-light)',
      fg: 'var(--primary)',
      border: 'var(--primary)',
    },
    success: {
      bg: 'var(--success-light)',
      fg: 'var(--success)',
      border: 'var(--success)',
    },
    warning: {
      bg: 'var(--warning-light)',
      fg: 'var(--warning)',
      border: 'var(--warning)',
    },
    danger: {
      bg: 'var(--danger-light)',
      fg: 'var(--danger)',
      border: 'var(--danger)',
    },
    info: {
      bg: 'var(--info-light)',
      fg: 'var(--info)',
      border: 'var(--info)',
    },
  };
  const displayLabel = formatKoStatus(label);
  const resolvedTone = tone ?? koStatusTone(label);
  const palette = toneStyles[resolvedTone];
  return (
    <span
      data-ui="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 'var(--space-badge-pad-y) var(--space-badge-pad-x)',
        borderRadius: '4px',
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: '11.5px',
        fontWeight: 700,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {displayLabel}
    </span>
  );
};

export interface GridColumn<T> {
  key: string;
  header: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  stickyLeft?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

export interface DataGridProps<T> {
  columns: GridColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  emptyText?: string;
  maxHeight?: string;
  manualId?: string;
}

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedRowId,
  emptyText = '조회된 데이터가 없습니다.',
  maxHeight = '600px',
  manualId,
}: DataGridProps<T>) {
  return (
    <div
      data-manual-id={manualId}
      style={{
        width: '100%',
        overflow: 'auto',
        maxHeight,
        border: '1px solid var(--table-border-color)',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-card)',
        boxShadow: 'none',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12.5px',
          color: 'var(--text-main)',
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  position: col.stickyLeft ? 'sticky' : 'sticky',
                  top: 0,
                  left: col.stickyLeft ? 0 : undefined,
                  zIndex: col.stickyLeft ? 4 : 3,
                  backgroundColor: 'var(--bg-header)',
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '12px',
                  textAlign: col.align || 'left',
                  padding: 'var(--space-table-th-pad-y) var(--space-table-th-pad-x)',
                  borderBottom: '1px solid var(--table-border-color)',
                  borderRight: '1px solid var(--table-row-border)',
                  whiteSpace: 'nowrap',
                  width: typeof col.width === 'number' ? `${col.width}px` : col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'calc(32px - 2pt) var(--space-panel-pad-x)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const id = rowKey(row, idx);
              const isSelected = selectedRowId != null && selectedRowId === id;
              const rowBg = isSelected ? 'var(--bg-active)' : 'var(--bg-card)';
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    height: 'var(--space-table-row-h)',
                    backgroundColor: rowBg,
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        position: col.stickyLeft ? 'sticky' : undefined,
                        left: col.stickyLeft ? 0 : undefined,
                        zIndex: col.stickyLeft ? 2 : undefined,
                        backgroundColor: col.stickyLeft ? rowBg : undefined,
                        textAlign: col.align || 'left',
                        padding: 'var(--space-table-td-pad-y) var(--space-table-td-pad-x)',
                        borderBottom: '1px solid var(--table-row-border)',
                        borderRight: '1px solid var(--table-row-border)',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                      }}
                    >
                      {col.render(row, idx)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export const SectionPanel: React.FC<{
  title?: string;
  titleSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  manualId?: string;
  style?: React.CSSProperties;
}> = ({ title, titleSlot, rightSlot, children, manualId, style }) => (
  <div
    className="fl-section-panel"
    data-manual-id={manualId}
    style={{
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      backgroundColor: 'var(--bg-card)',
      padding: 'var(--space-panel-pad-y) var(--space-panel-pad-x)',
      boxShadow: 'none',
      ...style,
    }}
  >
    {(title || titleSlot || rightSlot) && (
      <div
        className="fl-section-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-panel-head-gap)',
          marginBottom: 'var(--space-panel-head-mb)',
          paddingBottom: 'var(--space-panel-head-pb)',
          borderBottom: '1px solid var(--table-row-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-field-grid-gap)', flexWrap: 'wrap', minWidth: 0 }}>
          {title ? (
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {title}
            </h3>
          ) : null}
          {titleSlot}
        </div>
        {rightSlot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
            {rightSlot}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
);

export interface ConservationItem {
  label: string;
  value: string;
  tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warning';
}

export const ConservationBar: React.FC<{
  items: ConservationItem[];
  balanced?: boolean;
  balanceMessage?: string;
  children?: React.ReactNode;
  manualId?: string;
}> = ({ items, balanced = true, balanceMessage, children, manualId }) => {
  const toneColor: Record<string, string> = {
    neutral: 'var(--text-main)',
    primary: 'var(--primary)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
  };

  return (
    <div
      className="fl-conservation-bar"
      data-manual-id={manualId}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-conservation-gap)',
        padding: 'var(--space-conservation-pad-y) var(--space-conservation-pad-x)',
        border: `1px solid ${balanced ? 'var(--border-color)' : 'var(--danger)'}`,
        borderRadius: '8px',
        backgroundColor: 'var(--bg-header)',
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-conservation-item-gap)' }}>
        {items.map((item, idx) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-inline-gap)',
              paddingRight: idx < items.length - 1 ? 'var(--space-conservation-item-gap)' : 0,
              borderRight: idx < items.length - 1 ? '1px solid var(--table-row-border)' : 'none',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: toneColor[item.tone || 'neutral'],
                whiteSpace: 'nowrap',
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
        {balanceMessage && (
          <StatusBadge label={balanceMessage} tone={balanced ? 'success' : 'danger'} />
        )}
      </div>
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', marginLeft: 'auto' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export const ModalDialog: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}> = ({ open, title, onClose, width = 640, children }) => {
  const isPageActive = usePageActive();

  useEffect(() => {
    if (!open || !isPageActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPageActive, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 8800,
        backgroundColor: 'rgba(15, 23, 42, 0.56)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-modal-backdrop-pad)',
      }}
    >
      <div
        style={{
          width: `min(${width}px, 100%)`,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-main)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-modal-head-pad-y) var(--space-modal-head-pad-x)',
            backgroundColor: 'var(--bg-header)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap' }}>{title}</span>
          <button type="button" onClick={onClose} style={actionBtnStyle('secondary', true)}>
            <X size={14} />
            닫기
          </button>
        </div>
        <div style={{ padding: 'var(--space-modal-body-pad)', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
};

export const DocumentActionBar: React.FC<{
  docLabel: string;
  defaultEmail?: string;
  defaultSubject: string;
  defaultBody: string;
  onGenerate: () => Promise<{ fileName: string; base64: string; bytes: Uint8Array }>;
  disabled?: boolean;
  manualId?: string;
}> = ({
  docLabel,
  defaultEmail = '',
  defaultSubject,
  defaultBody,
  onGenerate,
  disabled = false,
  manualId,
}) => {
  const { tenantProfile, notifyToast, agentOnline } = useAppShell();
  const [busy, setBusy] = useState(false);
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [editedPath, setEditedPath] = useState<string | null>(null);
  const [editedFileName, setEditedFileName] = useState<string | null>(null);

  const [toEmail, setToEmail] = useState(defaultEmail);
  const [ccEmail, setCcEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  useEffect(() => {
    setToEmail(defaultEmail);
    setSubject(defaultSubject);
    setBody(defaultBody);
  }, [defaultEmail, defaultSubject, defaultBody]);

  const handleDownload = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await onGenerate();
      downloadExcelFile(res.fileName, res.bytes);
      notifyToast(`${docLabel} 엑셀 생성 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '문서 생성 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenInAgent = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await onGenerate();
      const localPath = await openExcelInAgent(res.fileName, res.base64);
      setEditedPath(localPath);
      setEditedFileName(res.fileName);
      notifyToast('로컬 엑셀 편집 실행 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '로컬 엑셀 편집 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSendMail = async () => {
    if (!toEmail.trim()) {
      notifyToast('받는사람 이메일 주소를 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      let fileName = editedFileName || `${docLabel}.xlsx`;
      let base64Content: string | undefined;
      if (!editedPath) {
        const res = await onGenerate();
        fileName = res.fileName;
        base64Content = res.base64;
      }
      await sendDocumentEmailViaAgent({
        tenant: tenantProfile,
        to: toEmail.trim(),
        cc: ccEmail.trim() || undefined,
        subject: subject.trim(),
        body,
        fileName,
        localEditedPath: editedPath,
        base64Content,
      });
      notifyToast(`${docLabel} 공식 이메일 발송 완료`, 'success');
      setMailModalOpen(false);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '이메일 발송 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        data-manual-id={manualId}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}
      >
        <button
          type="button"
          disabled={busy || disabled}
          onClick={handleDownload}
          style={actionBtnStyle('secondary', true)}
        >
          <Download size={13} />
          엑셀 다운로드
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={handleOpenInAgent}
          title={agentOnline ? '로컬 엑셀 편집 열기' : '전용 에이전트 실행 필요'}
          style={actionBtnStyle('secondary', true)}
        >
          <FileSpreadsheet size={13} />
          에이전트 편집
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setMailModalOpen(true)}
          style={actionBtnStyle('primary', true)}
        >
          <Mail size={13} />
          이메일 발송
        </button>
      </div>

      <ModalDialog
        open={mailModalOpen}
        title={`${docLabel} 공식 이메일 발송`}
        onClose={() => setMailModalOpen(false)}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-field-grid-gap)', flexWrap: 'wrap' }}>
            <VerticalField label="받는사람 이메일" required flex={1} minWidth={200}>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="수신자 이메일 주소 입력"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="참조 이메일" flex={1} minWidth={180}>
              <input
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="선택 입력"
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
          <VerticalField label="메일 제목" required>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="메일 본문" required>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={controlTextareaStyle}
            />
          </VerticalField>
          <div
            style={{
              padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {editedPath
              ? `편집 파일 첨부 대상: ${editedFileName} · ${editedPath}`
              : `발송 시 ${docLabel} 최신 양식 파일 생성 후 첨부`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
            {editedPath && (
              <button
                type="button"
                onClick={() => {
                  setEditedPath(null);
                  setEditedFileName(null);
                }}
                style={actionBtnStyle('secondary')}
              >
                편집본 연결 해제
              </button>
            )}
            <button
              type="button"
              onClick={() => setMailModalOpen(false)}
              style={actionBtnStyle('secondary')}
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSendMail}
              style={actionBtnStyle('primary')}
            >
              {busy ? '발송중' : '발송 실행'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
};

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  searchText?: string;
}

export function toPartnerSelectOptions(partners: FlPartner[]): SearchableSelectOption[] {
  return partners.map((p) => ({
    value: p.id,
    label: p.name,
    subLabel: p.bizRegNo || p.partnerRoles?.[0] || undefined,
    searchText: [p.name, p.bizRegNo, p.representative, ...(p.partnerRoles || [])]
      .filter(Boolean)
      .join(' '),
  }));
}

export function toItemMasterSelectOptions(items: FlItemMaster[]): SearchableSelectOption[] {
  return items.map((it) => ({
    value: it.id,
    label: `${it.sku} · ${it.name}`,
    subLabel: it.manufacturer || it.itemCategory,
    searchText: [
      it.sku,
      it.name,
      it.manufacturer,
      it.modelName,
      it.itemCategory,
      it.specSummary,
    ]
      .filter(Boolean)
      .join(' '),
  }));
}

export interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  dataTestId?: string;
  minDropdownWidth?: number;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = '선택',
  searchPlaceholder = '초성 또는 키워드 검색',
  emptyText = '일치하는 항목이 없습니다.',
  disabled = false,
  dataTestId,
  minDropdownWidth = 280,
}) => {
  const isPageActive = usePageActive();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: minDropdownWidth,
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim();
    if (!q) return options.slice(0, 120);
    return options
      .filter((opt) =>
        matchesKoreanQuery(
          `${opt.label} ${opt.subLabel || ''} ${opt.searchText || ''}`,
          q
        )
      )
      .slice(0, 120);
  }, [options, query]);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropWidth = Math.max(rect.width, minDropdownWidth);
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 310;
    const top =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight
        ? Math.max(8, rect.top - estimatedHeight - 4)
        : rect.bottom + 4;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - dropWidth - 12));
    setPos({ top, left, width: dropWidth });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    setHighlightIdx(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 10);

    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', handleDocClick);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleDocClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!isPageActive && open) {
      setOpen(false);
    }
  }, [isPageActive, open]);

  const handleSelect = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) =>
        filteredOptions.length === 0 ? 0 : Math.min(prev + 1, filteredOptions.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetOpt = filteredOptions[highlightIdx];
      if (targetOpt) handleSelect(targetOpt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-testid={dataTestId}
        onClick={() => {
          if (disabled) return;
          setQuery('');
          setOpen((prev) => !prev);
        }}
        style={{
          ...controlInputStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            color: selectedOption ? 'var(--text-main)' : 'var(--text-muted)',
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              width: `${pos.width}px`,
              zIndex: 9500,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-tight-gap)',
                padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
                borderBottom: '1px solid var(--table-row-border)',
                backgroundColor: 'var(--bg-app)',
              }}
            >
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightIdx(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text-main)',
                  fontSize: '12.5px',
                  width: '100%',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setHighlightIdx(0);
                    inputRef.current?.focus();
                  }}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto', padding: 'max(1px, calc(4px - 2pt))' }}>
              {filteredOptions.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--space-panel-pad-y) var(--space-compact-pad-x)',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => handleSelect(opt)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 'calc(7px - 2pt) var(--space-compact-pad-x)',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-inline-gap)',
                        backgroundColor: isSelected
                          ? 'var(--primary-light)'
                          : isHighlighted
                          ? 'var(--bg-secondary)'
                          : 'transparent',
                        color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {opt.subLabel}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
