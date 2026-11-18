import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { todayIso } from '../../services/domainMath';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { computeDueDateFromCycle, formatKoPayableType } from '../../types/domain';
import { buildNonRentalPayables } from './financeHelpers';

interface CashScheduleItem {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  category: string;
  docNo: string;
  partnerName: string;
  amountKrw: number;
  statusLabel: string;
}

export const CashCalendarPage: React.FC = () => {
  const { isRentalEnabled, datasets, formatMoney } = useAppShell();
  const today = todayIso();
  const [currentYm, setCurrentYm] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [dirFilter, setDirFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [partnerKeyword, setPartnerKeyword] = useState('');

  const partnerMap = useMemo(
    () => new Map(datasets.partners.map((p) => [p.id, p])),
    [datasets.partners]
  );
  const contractMap = useMemo(
    () => new Map(datasets.contracts.map((c) => [c.id, c])),
    [datasets.contracts]
  );
  const leaseMap = useMemo(
    () => new Map(datasets.financeLeases.map((l) => [l.id, l])),
    [datasets.financeLeases]
  );

  const scheduleItems = useMemo<CashScheduleItem[]>(() => {
    const out: CashScheduleItem[] = [];

    // 1. 입금예정 (미수납 청구 · 매출거래처 납기일자 기준)
    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.unpaidBalanceKrw <= 0) continue;
      if (!isRentalEnabled && b.billingDomain === 'RENTAL') continue;
      const partner = partnerMap.get(b.partnerId);
      const contract = contractMap.get(b.contractId);
      const dueDate =
        b.dueDate ||
        computeDueDateFromCycle(
          b.billingYm || b.billingDate.slice(0, 7),
          contract?.paymentCycle || partner?.defaultPaymentCycle || '익월',
          contract?.paymentMonthOffset ?? partner?.defaultPaymentMonthOffset ?? 1,
          contract?.paymentDueDay ?? partner?.defaultPaymentDueDay ?? 10,
          b.billingDate
        );
      out.push({
        id: `IN-${b.id}`,
        date: dueDate,
        direction: 'IN',
        category: !isRentalEnabled ? '청구 입금' : b.billingDomain === 'RENTAL' ? '렌탈청구 입금' : '유통청구 입금',
        docNo: b.billingNo,
        partnerName: b.partnerName,
        amountKrw: Math.round(b.unpaidBalanceKrw),
        statusLabel: b.status === 'PARTIAL' ? '부분수납' : '입금예정',
      });
    }

    // 2. 지출예정 (미지급 매입·물류·외주 채무 · 매입거래처 지급일자 기준)
    const payablePool = isRentalEnabled ? datasets.apPayables : buildNonRentalPayables(datasets);
    for (const ap of payablePool) {
      const rem = Math.round(ap.totalAmountKrw - ap.paidAmountKrw);
      if (ap.status === 'PAID' || rem <= 0) continue;
      const partner = partnerMap.get(ap.partnerId);
      const dueDate =
        ap.dueDate ||
        computeDueDateFromCycle(
          ap.accrualDate.slice(0, 7),
          partner?.defaultPaymentCycle || '익월',
          partner?.defaultPaymentMonthOffset ?? 1,
          partner?.defaultPaymentDueDay ?? 10,
          ap.accrualDate
        );
      out.push({
        id: `AP-${ap.id}`,
        date: dueDate,
        direction: 'OUT',
        category: formatKoPayableType(ap.payableType),
        docNo: ap.payableNo,
        partnerName: ap.partnerName,
        amountKrw: rem,
        statusLabel: ap.status === 'PARTIAL' ? '부분지급' : '지급예정',
      });
    }

    // 3. 지출예정 (미납 금융리스 회차)
    if (isRentalEnabled) {
      for (const sch of datasets.financeLeaseSchedules) {
        if (sch.isPaid || sch.totalInstallmentKrw <= 0) continue;
        const lease = leaseMap.get(sch.leaseId);
        out.push({
          id: `LEASE-${sch.id}`,
          date: sch.dueDate,
          direction: 'OUT',
          category: '금융리스 상환',
          docNo: `${lease?.leaseNo || sch.leaseId} · ${sch.installmentNo}회`,
          partnerName: lease?.lenderName || '금융사',
          amountKrw: Math.round(sch.totalInstallmentKrw),
          statusLabel: '납입예정',
        });
      }
    }

    return out;
  }, [contractMap, datasets, isRentalEnabled, leaseMap, partnerMap]);

  const filteredItems = useMemo(() => {
    const kw = partnerKeyword.trim().toLowerCase();
    return scheduleItems.filter((item) => {
      if (dirFilter !== 'ALL' && item.direction !== dirFilter) return false;
      if (kw && !`${item.partnerName} ${item.docNo} ${item.category}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [dirFilter, partnerKeyword, scheduleItems]);

  const monthItems = useMemo(
    () => filteredItems.filter((item) => item.date.startsWith(currentYm)),
    [currentYm, filteredItems]
  );

  const byDateMap = useMemo(() => {
    const map = new Map<string, { inSum: number; outSum: number; items: CashScheduleItem[] }>();
    for (const item of monthItems) {
      const entry = map.get(item.date) || { inSum: 0, outSum: 0, items: [] };
      if (item.direction === 'IN') entry.inSum += item.amountKrw;
      else entry.outSum += item.amountKrw;
      entry.items.push(item);
      map.set(item.date, entry);
    }
    return map;
  }, [monthItems]);

  const calendarCells = useMemo(() => {
    const [y, m] = currentYm.split('-').map(Number);
    const firstDay = new Date(Date.UTC(y, m - 1, 1));
    const startWeekday = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${currentYm}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentYm]);

  const shiftMonth = (delta: number) => {
    const [y, m] = currentYm.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    const nextYm = dt.toISOString().slice(0, 7);
    setCurrentYm(nextYm);
    setSelectedDate(`${nextYm}-01`);
  };

  const selectedDayItems = useMemo(() => {
    const entry = byDateMap.get(selectedDate);
    if (entry) return entry.items;
    return [];
  }, [byDateMap, selectedDate]);

  const monthTotals = useMemo(() => {
    const inTotal = monthItems.filter((i) => i.direction === 'IN').reduce((s, i) => s + i.amountKrw, 0);
    const outTotal = monthItems.filter((i) => i.direction === 'OUT').reduce((s, i) => s + i.amountKrw, 0);
    return { inTotal, outTotal, net: inTotal - outTotal };
  }, [monthItems]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="자금 일정 캘린더 · 입금예정 · 지출예정"
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button type="button" onClick={() => shiftMonth(-1)} style={actionBtnStyle('secondary', true)}>
              이전달
            </button>
            <input
              type="month"
              value={currentYm}
              onChange={(e) => {
                setCurrentYm(e.target.value);
                setSelectedDate(`${e.target.value}-01`);
              }}
              style={{ ...controlInputStyle, width: '140px' }}
            />
            <button type="button" onClick={() => shiftMonth(1)} style={actionBtnStyle('secondary', true)}>
              다음달
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentYm(today.slice(0, 7));
                setSelectedDate(today);
              }}
              style={actionBtnStyle('primary', true)}
            >
              이번달
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체 일정', count: monthItems.length },
              { id: 'IN', label: '입금예정' },
              { id: 'OUT', label: '지출예정' },
            ]}
            activeId={dirFilter}
            onChange={(id) => setDirFilter(id as typeof dirFilter)}
          />
          <VerticalField label="거래처 · 전표 검색" width={260}>
            <input
              type="text"
              value={partnerKeyword}
              onChange={(e) => setPartnerKeyword(e.target.value)}
              placeholder="거래처명, 청구/채무번호"
              style={controlInputStyle}
            />
          </VerticalField>
        </div>
      </SectionPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--space-page-gap)', alignItems: 'start' }}>
        <SectionPanel title={`${currentYm} 월간 자금 캘린더`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
            {['일', '월', '화', '수', '목', '금', '토'].map((w, idx) => (
              <div
                key={w}
                style={{
                  textAlign: 'center',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '4px 0',
                  color: idx === 0 ? 'var(--danger)' : idx === 6 ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {w}
              </div>
            ))}
            {calendarCells.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`empty-${idx}`} style={{ minHeight: '72px', backgroundColor: 'var(--bg-app)', borderRadius: '6px' }} />;
              }
              const info = byDateMap.get(dateStr);
              const isSelected = dateStr === selectedDate;
              const dayNum = Number(dateStr.slice(8, 10));
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    minHeight: '72px',
                    padding: '6px',
                    borderRadius: '6px',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--table-border-color)',
                    backgroundColor: isSelected ? 'var(--bg-active)' : 'var(--bg-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    cursor: 'pointer',
                    gap: '3px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{dayNum}</span>
                    {info && (
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {info.items.length}건
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10.5px', fontWeight: 700 }}>
                    {info && info.inSum > 0 && (
                      <span style={{ color: 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        +{info.inSum.toLocaleString('ko-KR')}
                      </span>
                    )}
                    {info && info.outSum > 0 && (
                      <span style={{ color: 'var(--danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        -{info.outSum.toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </SectionPanel>

        <SectionPanel title={`${selectedDate} 입출금 상세 · ${selectedDayItems.length}건`}>
          <DataGrid
            columns={[
              {
                key: 'dir',
                header: '구분',
                width: 72,
                align: 'center',
                sortable: true,
                sortValue: (r) => r.direction,
                render: (r) => (
                  <StatusBadge
                    label={r.direction === 'IN' ? '입금' : '지출'}
                    tone={r.direction === 'IN' ? 'success' : 'danger'}
                  />
                ),
              },
              {
                key: 'partnerName',
                header: '거래처',
                sortable: true,
                sortValue: (r) => r.partnerName,
                render: (r) => r.partnerName,
              },
              {
                key: 'category',
                header: '항목',
                width: 105,
                sortable: true,
                sortValue: (r) => r.category,
                render: (r) => r.category,
              },
              {
                key: 'amountKrw',
                header: '금액',
                width: 115,
                align: 'right',
                sortable: true,
                sortValue: (r) => r.amountKrw,
                render: (r) => (
                  <span style={{ fontWeight: 700, color: r.direction === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                    {formatMoney(r.amountKrw)}
                  </span>
                ),
              },
            ]}
            rows={selectedDayItems}
            rowKey={(r) => r.id}
            emptyText="선택한 일자에 예정된 입출금 일정이 없습니다."
            maxHeight="clamp(320px, calc(100vh - 340px), 700px)"
          />
        </SectionPanel>
      </div>

      <ConservationBar
        items={[
          { label: `${currentYm} 입금예정`, value: formatMoney(monthTotals.inTotal), tone: 'success' },
          { label: `${currentYm} 지출예정`, value: formatMoney(monthTotals.outTotal), tone: 'danger' },
          {
            label: '월간 순자금흐름',
            value: formatMoney(monthTotals.net),
            tone: monthTotals.net >= 0 ? 'primary' : 'warning',
          },
        ]}
      />
    </div>
  );
};
