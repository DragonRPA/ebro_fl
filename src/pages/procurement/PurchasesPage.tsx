import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { SearchableSelect } from '../../components/SearchableSelect';
import {
  DataGrid,
  ModalDialog,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import {
  PURCHASE_STATUS_KO_LABELS,
  formatKoCurrency,
  formatKoStatus,
  koStatusTone,
  type FlPurchase,
  type FlPurchaseLine,
} from '../../types/domain';
import { PurchaseInboundFormPanel } from './PurchaseInboundFormPanel';

export const PurchasesPage: React.FC = () => {
  const { isRentalEnabled, datasets, formatMoney, canEditPage } = useAppShell();
  const canEdit = canEditPage('purchases');

  const [detailPurchase, setDetailPurchase] = useState<FlPurchase | null>(null);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [filterItemId, setFilterItemId] = useState('');

  const detailLines = useMemo<FlPurchaseLine[]>(() => {
    if (!detailPurchase) return [];
    return datasets.purchaseLines.filter((l) => l.purchaseId === detailPurchase.id);
  }, [datasets.purchaseLines, detailPurchase]);

  const itemMasterById = useMemo(
    () => new Map(datasets.itemMasters.map((m) => [m.id, m])),
    [datasets.itemMasters]
  );

  const purchaseLinesByPurchaseId = useMemo(() => {
    const map = new Map<string, FlPurchaseLine[]>();
    for (const l of datasets.purchaseLines) {
      const arr = map.get(l.purchaseId);
      if (arr) arr.push(l);
      else map.set(l.purchaseId, [l]);
    }
    return map;
  }, [datasets.purchaseLines]);

  const purchaseSummaryMap = useMemo(() => {
    const map = new Map<string, { modelLabel: string; totalQty: number; unitCostKrw: number }>();
    for (const p of datasets.purchases) {
      const lines = purchaseLinesByPurchaseId.get(p.id) || [];
      const totalQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
      const firstLine = lines[0];
      const firstMaster = firstLine ? itemMasterById.get(firstLine.itemId) : undefined;
      const baseModel = firstMaster?.modelName?.trim() || firstLine?.itemName || '-';
      const modelLabel = lines.length > 1 ? `${baseModel} 외 ${lines.length - 1}건` : baseModel;
      const unitCostKrw =
        lines.length === 1 && firstLine
          ? Number(firstLine.landedUnitCostKrw || 0)
          : totalQty > 0
            ? Math.round(Number(p.totalLandedCostKrw || 0) / totalQty)
            : 0;
      map.set(p.id, { modelLabel, totalQty, unitCostKrw });
    }
    return map;
  }, [datasets.purchases, itemMasterById, purchaseLinesByPurchaseId]);

  const visiblePurchases = useMemo(
    () => (isRentalEnabled ? datasets.purchases : datasets.purchases.filter((p) => p.targetDomain !== 'RENTAL')),
    [datasets.purchases, isRentalEnabled]
  );

  const visiblePurchaseIds = useMemo(
    () => new Set(visiblePurchases.map((p) => p.id)),
    [visiblePurchases]
  );

  const purchaseSupplierFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of visiblePurchases) {
      if (p.supplierId && !seen.has(p.supplierId)) {
        seen.set(p.supplierId, p.supplierName);
      }
    }
    return [
      { value: '', label: '전체 매입처' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [visiblePurchases]);

  const purchaseModelFilterOptions = useMemo(() => {
    const seen = new Map<string, { label: string; searchText: string }>();
    for (const l of datasets.purchaseLines) {
      if (!visiblePurchaseIds.has(l.purchaseId)) continue;
      if (l.itemId && !seen.has(l.itemId)) {
        const master = itemMasterById.get(l.itemId);
        const model = master?.modelName?.trim();
        const label = model ? `${model} · ${l.itemName}` : l.itemName;
        seen.set(l.itemId, {
          label,
          searchText: `${model || ''} ${l.itemName} ${l.sku}`.trim(),
        });
      }
    }
    return [
      { value: '', label: '전체 모델' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ko'))
        .map(([value, info]) => ({ value, label: info.label, searchText: info.searchText })),
    ];
  }, [datasets.purchaseLines, itemMasterById, visiblePurchaseIds]);

  const filteredPurchases = useMemo(() => {
    return visiblePurchases
      .filter((p) => {
        if (filterStartDate && p.effectiveDate < filterStartDate) return false;
        if (filterEndDate && p.effectiveDate > filterEndDate) return false;
        if (filterSupplierId && p.supplierId !== filterSupplierId) return false;
        if (filterItemId) {
          const lines = purchaseLinesByPurchaseId.get(p.id) || [];
          if (!lines.some((l) => l.itemId === filterItemId)) return false;
        }
        return true;
      })
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  }, [
    filterEndDate,
    filterItemId,
    filterStartDate,
    filterSupplierId,
    purchaseLinesByPurchaseId,
    visiblePurchases,
  ]);

  const purchaseCols: GridColumn<FlPurchase>[] = [
    {
      key: 'view',
      header: '상세',
      width: 72,
      align: 'center',
      stickyLeft: true,
      render: (r) => (
        <button type="button" onClick={() => setDetailPurchase(r)} style={actionBtnStyle('secondary', true)}>
          보기
        </button>
      ),
    },
    {
      key: 'purchaseNo',
      header: '전표번호',
      width: 145,
      sortable: true,
      sortValue: (r) => r.purchaseNo,
      render: (r) => <span style={{ fontWeight: 700 }}>{r.purchaseNo}</span>,
    },
    {
      key: 'effectiveDate',
      header: '입고기준일',
      width: 105,
      sortable: true,
      sortValue: (r) => r.effectiveDate,
      render: (r) => r.effectiveDate,
    },
    {
      key: 'purchaseType',
      header: '구분',
      width: 80,
      align: 'center',
      sortable: true,
      sortValue: (r) => (r.purchaseType === 'IMPORT' ? '수입' : '내수'),
      render: (r) => <StatusBadge label={r.purchaseType === 'IMPORT' ? '수입' : '내수'} tone="info" />,
    },
    ...(isRentalEnabled
      ? ([
          {
            key: 'targetDomain',
            header: '계정',
            width: 90,
            align: 'center',
            sortable: true,
            sortValue: (r) => (r.targetDomain === 'RENTAL' ? '렌탈자산' : '유통재고'),
            render: (r) => (
              <StatusBadge label={r.targetDomain === 'RENTAL' ? '렌탈자산' : '유통재고'} tone="primary" />
            ),
          },
        ] as GridColumn<FlPurchase>[])
      : []),
    {
      key: 'supplierName',
      header: '매입처',
      sortable: true,
      sortValue: (r) => r.supplierName,
      render: (r) => r.supplierName,
    },
    {
      key: 'modelName',
      header: '모델명',
      sortable: true,
      sortValue: (r) => purchaseSummaryMap.get(r.id)?.modelLabel || '',
      render: (r) => purchaseSummaryMap.get(r.id)?.modelLabel || '-',
    },
    {
      key: 'quantity',
      header: '수량',
      width: 78,
      align: 'right',
      sortable: true,
      sortValue: (r) => purchaseSummaryMap.get(r.id)?.totalQty ?? 0,
      render: (r) => (purchaseSummaryMap.get(r.id)?.totalQty ?? 0).toLocaleString('ko-KR'),
    },
    {
      key: 'unitCostKrw',
      header: '단가',
      width: 120,
      align: 'right',
      sortable: true,
      sortValue: (r) => purchaseSummaryMap.get(r.id)?.unitCostKrw ?? 0,
      render: (r) => formatMoney(purchaseSummaryMap.get(r.id)?.unitCostKrw ?? 0),
    },
    {
      key: 'currencyCode',
      header: '통화',
      width: 90,
      align: 'center',
      sortable: true,
      sortValue: (r) => formatKoCurrency(r.currencyCode),
      render: (r) => formatKoCurrency(r.currencyCode),
    },
    {
      key: 'fxDate',
      header: '환율적용일',
      width: 105,
      sortable: true,
      sortValue: (r) => (r.currencyCode === 'KRW' ? '' : r.fxDate || r.effectiveDate),
      render: (r) => (r.currencyCode === 'KRW' ? '-' : r.fxDate || r.effectiveDate),
    },
    {
      key: 'fxRate',
      header: '적용환율',
      width: 105,
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.fxRate || 0),
      render: (r) => Number(r.fxRate).toLocaleString('ko-KR', { maximumFractionDigits: 4 }),
    },
    {
      key: 'totalLandedCostKrw',
      header: '총입고원가',
      width: 135,
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.totalLandedCostKrw || 0),
      render: (r) => <span style={{ fontWeight: 700 }}>{formatMoney(r.totalLandedCostKrw)}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: 85,
      align: 'center',
      sortable: true,
      sortValue: (r) => PURCHASE_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status),
      render: (r) => (
        <StatusBadge
          label={PURCHASE_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status)}
          tone={koStatusTone(r.status)}
        />
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && <PurchaseInboundFormPanel />}

      <SectionPanel
        title={`매입 통관 원장 · ${filteredPurchases.length}건`}
        manualId="pur-grid"
        rightSlot={
          (filterStartDate || filterEndDate || filterSupplierId || filterItemId) ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterSupplierId('');
                setFilterItemId('');
              }}
              style={actionBtnStyle('secondary', true)}
            >
              필터 초기화
            </button>
          ) : undefined
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 'var(--space-field-grid-gap)',
            marginBottom: 'var(--space-stack-gap)',
            alignItems: 'end',
          }}
        >
          <VerticalField label="조회 시작일" minWidth={0}>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="조회 종료일" minWidth={0}>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="매입처" minWidth={0}>
            <SearchableSelect
              value={filterSupplierId}
              onChange={setFilterSupplierId}
              options={purchaseSupplierFilterOptions}
              placeholder="전체 매입처"
              searchPlaceholder="매입처명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="모델명" minWidth={0}>
            <SearchableSelect
              value={filterItemId}
              onChange={setFilterItemId}
              options={purchaseModelFilterOptions}
              placeholder="전체 모델"
              searchPlaceholder="모델명 · 품명 · 초성 검색"
            />
          </VerticalField>
        </div>
        <DataGrid
          columns={purchaseCols}
          rows={filteredPurchases}
          rowKey={(r) => r.id}
          maxHeight="calc(100vh - 230px)"
        />
      </SectionPanel>

      <ModalDialog
        open={Boolean(detailPurchase)}
        title={detailPurchase ? `매입 배분 상세 · ${detailPurchase.purchaseNo}` : ''}
        onClose={() => setDetailPurchase(null)}
        width={760}
      >
        {detailPurchase && (
          <DataGrid
            columns={[
              { key: 'sku', header: '품목코드', width: 120, render: (l) => l.sku },
              { key: 'itemName', header: '품명', render: (l) => l.itemName },
              {
                key: 'qty',
                header: '수량',
                width: 80,
                align: 'right',
                render: (l) => Number(l.quantity).toLocaleString('ko-KR'),
              },
              {
                key: 'foreignUnitPrice',
                header: '외화단가',
                width: 115,
                align: 'right',
                render: (l) => Number(l.foreignUnitPrice).toLocaleString('ko-KR', { maximumFractionDigits: 4 }),
              },
              {
                key: 'merch',
                header: '배분물품대',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.allocatedMerchandiseKrw),
              },
              {
                key: 'anc',
                header: '배분부대비',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.allocatedAncillaryKrw),
              },
              {
                key: 'unitCost',
                header: '단가',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.landedUnitCostKrw),
              },
              {
                key: 'totalCost',
                header: '배분총원가',
                width: 125,
                align: 'right',
                render: (l) => formatMoney(l.landedTotalCostKrw),
              },
            ]}
            rows={detailLines}
            rowKey={(l) => l.id}
            maxHeight="calc(100vh - 260px)"
          />
        )}
      </ModalDialog>
    </div>
  );
};
