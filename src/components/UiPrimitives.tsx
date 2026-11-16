import React, { useEffect, useState } from 'react';
import { X, Download, FileSpreadsheet, Mail } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import {
  downloadExcelFile,
  openExcelInAgent,
  sendDocumentEmailViaAgent,
} from '../services/documentService';

export const controlInputStyle: React.CSSProperties = {
  height: '34px',
  padding: '0 10px',
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
  padding: '8px 10px',
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
    gap: '5px',
    height: small ? '28px' : '34px',
    padding: small ? '0 10px' : '0 14px',
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
      gap: '4px',
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
        lineHeight: 1.3,
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
  tone = 'neutral',
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
  const palette = toneStyles[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: '11.5px',
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
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
  maxHeight = '540px',
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
                  padding: '9px 10px',
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
                  padding: '32px 16px',
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
                    height: '40px',
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
                        padding: '6px 10px',
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
    data-manual-id={manualId}
    style={{
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      backgroundColor: 'var(--bg-card)',
      padding: '14px 16px',
      boxShadow: 'none',
      ...style,
    }}
  >
    {(title || titleSlot || rightSlot) && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--table-row-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
      data-manual-id={manualId}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 16px',
        border: `1px solid ${balanced ? 'var(--border-color)' : 'var(--danger)'}`,
        borderRadius: '8px',
        backgroundColor: 'var(--bg-header)',
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px' }}>
        {items.map((item, idx) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
              paddingRight: idx < items.length - 1 ? '18px' : 0,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
        padding: '20px',
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
            padding: '12px 16px',
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
        <div style={{ padding: '16px', overflowY: 'auto' }}>{children}</div>
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
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
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
          title={agentOnline ? 'PC 엑셀 편집 열기' : 'eBro Agent 실행 필요'}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <VerticalField label="받는사람 이메일" required flex={1} minWidth={200}>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="customer@example.com"
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
              padding: '8px 10px',
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
