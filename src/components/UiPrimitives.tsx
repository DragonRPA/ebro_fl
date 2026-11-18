import React, { useEffect, useMemo, useState } from 'react';
import { X, FileSpreadsheet, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { usePageActive } from '../core/PageActivityContext';
import { getPageTitleForTenant } from '../manual/manualPageTitles';
import { formatKoStatus, koStatusTone } from '../types/domain';

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

const BADGE_TONE_STYLES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--bg-secondary)', fg: 'var(--text-secondary)', border: 'var(--border-color)' },
  primary: { bg: 'var(--primary-light)', fg: 'var(--primary)', border: 'var(--primary)' },
  success: { bg: 'var(--success-light)', fg: 'var(--success)', border: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', fg: 'var(--warning)', border: 'var(--warning)' },
  danger: { bg: 'var(--danger-light)', fg: 'var(--danger)', border: 'var(--danger)' },
  info: { bg: 'var(--info-light)', fg: 'var(--info)', border: 'var(--info)' },
};

export const StatusBadge: React.FC<{ label: string; tone?: BadgeTone }> = React.memo(({
  label,
  tone,
}) => {
  const displayLabel = formatKoStatus(label);
  const resolvedTone = tone ?? koStatusTone(label);
  const palette = BADGE_TONE_STYLES[resolvedTone];
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
});

export interface GridColumn<T> {
  key: string;
  header: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  stickyLeft?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
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
  enableExcelExport?: boolean;
  excelFileName?: string;
}

function extractReactNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractReactNodeText).filter(Boolean).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (typeof props.label === 'string') return props.label;
    if (props.children !== undefined) return extractReactNodeText(props.children as React.ReactNode);
  }
  return '';
}

const GRID_RENDER_STEP = 250;

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedRowId,
  emptyText = '조회된 데이터가 없습니다.',
  maxHeight = 'calc(100vh - 210px)',
  manualId,
  enableExcelExport = true,
  excelFileName,
}: DataGridProps<T>) {
  const { activePage } = useAppShell();
  const [sortState, setSortState] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(GRID_RENDER_STEP);

  const toggleSort = (col: GridColumn<T>) => {
    if (!col.sortable && !col.sortValue) return;
    setVisibleLimit(GRID_RENDER_STEP);
    setSortState((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortState) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col || (!col.sortable && !col.sortValue)) return rows;
    const getVal = col.sortValue
      ? col.sortValue
      : (row: T) => (row as Record<string, unknown>)[col.key] as string | number | null | undefined;
    const factor = sortState.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * factor;
      }
      return String(va).localeCompare(String(vb), 'ko', { numeric: true }) * factor;
    });
  }, [columns, rows, sortState]);

  const handleExportExcel = async () => {
    if (sortedRows.length === 0) return;
    const exportCols = columns.filter(
      (c) =>
        c.header &&
        c.header.trim() !== '' &&
        !['상세', '저장', '삭제', '작업', '처리'].includes(c.header.trim())
    );
    const sheetRows = sortedRows.map((row, idx) => {
      const obj: Record<string, string | number> = {};
      for (const col of exportCols) {
        const rendered = extractReactNodeText(col.render(row, idx)).trim();
        if (rendered) {
          obj[col.header] = rendered;
        } else if (col.sortValue) {
          const sv = col.sortValue(row);
          obj[col.header] = sv ?? '';
        } else {
          obj[col.header] = '';
        }
      }
      return obj;
    });
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '목록');
    const pageTitle = excelFileName || getPageTitleForTenant(activePage) || '목록';
    const safeTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${safeTitle}_${dateTag}.xlsx`);
  };

  const renderedRows = sortedRows.length > visibleLimit ? sortedRows.slice(0, visibleLimit) : sortedRows;

  return (
    <div data-manual-id={manualId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {enableExcelExport && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            type="button"
            data-testid="grid-excel-export-btn"
            disabled={sortedRows.length === 0}
            onClick={handleExportExcel}
            style={{
              ...actionBtnStyle('secondary', true),
              opacity: sortedRows.length === 0 ? 0.5 : 1,
              cursor: sortedRows.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <FileSpreadsheet size={13} />
            <span>엑셀 다운로드</span>
          </button>
        </div>
      )}
      <div
        onScroll={(e) => {
          if (visibleLimit >= sortedRows.length) return;
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
            setVisibleLimit((v) => Math.min(sortedRows.length, v + GRID_RENDER_STEP));
          }
        }}
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
            {columns.map((col) => {
              const isSortable = Boolean(col.sortable || col.sortValue);
              const activeDir = sortState?.key === col.key ? sortState.dir : null;
              return (
                <th
                  key={col.key}
                  aria-sort={
                    isSortable
                      ? activeDir === 'asc'
                        ? 'ascending'
                        : activeDir === 'desc'
                          ? 'descending'
                          : 'none'
                      : undefined
                  }
                  onClick={isSortable ? () => toggleSort(col) : undefined}
                  title={isSortable ? '클릭하여 오름차순 · 내림차순 · 정렬안함 전환' : undefined}
                  style={{
                    position: col.stickyLeft ? 'sticky' : 'sticky',
                    top: 0,
                    left: col.stickyLeft ? 0 : undefined,
                    zIndex: col.stickyLeft ? 4 : 3,
                    backgroundColor: 'var(--bg-header)',
                    color: activeDir ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '12px',
                    textAlign: col.align || 'left',
                    padding: 'var(--space-table-th-pad-y) var(--space-table-th-pad-x)',
                    borderBottom: '1px solid var(--table-border-color)',
                    borderRight: '1px solid var(--table-row-border)',
                    whiteSpace: 'nowrap',
                    width: typeof col.width === 'number' ? `${col.width}px` : col.width,
                    cursor: isSortable ? 'pointer' : 'default',
                    userSelect: isSortable ? 'none' : undefined,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      justifyContent:
                        col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                    }}
                  >
                    <span>{col.header}</span>
                    {isSortable && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', opacity: activeDir ? 1 : 0.45 }}>
                        {activeDir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : activeDir === 'desc' ? (
                          <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={11} />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
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
            <>
              {renderedRows.map((row, idx) => {
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
              })}
              {visibleLimit < sortedRows.length && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: '8px var(--space-panel-pad-x)', textAlign: 'center', backgroundColor: 'var(--bg-header)' }}>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => Math.min(sortedRows.length, v + GRID_RENDER_STEP))}
                      style={actionBtnStyle('secondary', true)}
                    >
                      {`${renderedRows.length.toLocaleString('ko-KR')}/${sortedRows.length.toLocaleString('ko-KR')} · 더 보기`}
                    </button>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      </div>
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
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-conservation-gap)', padding: 'var(--space-conservation-pad-y) var(--space-conservation-pad-x)', border: `1px solid ${balanced ? 'var(--border-color)' : 'var(--danger)'}`, borderRadius: '8px', backgroundColor: 'var(--bg-header)', boxShadow: 'none' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-conservation-item-gap)' }}>
        {items.map((item, idx) => (
          <div
            key={item.label}
            style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-inline-gap)', paddingRight: idx < items.length - 1 ? 'var(--space-conservation-item-gap)' : 0, borderRight: idx < items.length - 1 ? '1px solid var(--table-row-border)' : 'none' }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: toneColor[item.tone || 'neutral'], whiteSpace: 'nowrap' }}>{item.value}</span>
          </div>
        ))}
        {balanceMessage && <StatusBadge label={balanceMessage} tone={balanced ? 'success' : 'danger'} />}
      </div>
      {children && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', marginLeft: 'auto' }}>{children}</div>}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 8800, backgroundColor: 'rgba(15, 23, 42, 0.56)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-modal-backdrop-pad)' }}>
      <div style={{ width: `min(${width}px, 100%)`, maxHeight: '88vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-modal-head-pad-y) var(--space-modal-head-pad-x)', backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}>
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
