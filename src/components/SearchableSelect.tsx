import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { usePageActive } from '../core/PageActivityContext';
import {
  buildKoreanSearchIndex,
  matchesIndexedKoreanQuery,
} from '../utils/hangulSearch';
import type { FlItemMaster, FlPartner } from '../types/domain';
import { controlInputStyle } from './UiPrimitives';

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

  const optionByValue = useMemo(
    () => new Map(options.map((opt) => [opt.value, opt])),
    [options]
  );

  const selectedOption = optionByValue.get(value) || null;

  const indexedOptions = useMemo(
    () =>
      options.map((opt) => ({
        opt,
        searchIndex: buildKoreanSearchIndex(
          `${opt.label} ${opt.subLabel || ''} ${opt.searchText || ''}`
        ),
      })),
    [options]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim();
    if (!q) return options.slice(0, 120);
    const result: SearchableSelectOption[] = [];
    for (const entry of indexedOptions) {
      if (matchesIndexedKoreanQuery(entry.searchIndex, q)) {
        result.push(entry.opt);
        if (result.length >= 120) break;
      }
    }
    return result;
  }, [indexedOptions, options, query]);

  const updatePosition = useCallback(() => {
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
  }, [minDropdownWidth]);

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
  }, [open, updatePosition]);

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
