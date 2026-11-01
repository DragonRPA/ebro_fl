import React, { useState, useMemo } from 'react';
import { Wrench, Boxes, History, Plus, Search, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { COMPATIBLE_PARTS_CATALOG } from '../data/compatiblePartsCatalogData';
import { SEED_FL_RENTAL_ASSETS } from '../data/flUnifiedSeedData';
import { CompatiblePartsCatalogOrderPage } from './distribution/CompatiblePartsCatalogOrderPage';

export interface PartInventoryItem {
  id: string;
  skuCode: string;
  partName: string;
  category: string;
  compatibleModels: string;
  spec: string;
  totalQty: number;
  saleStockQty: number;
  repairStockQty: number;
  minStockQty: number;
  purchaseUnitCost: number;
  saleUnitPrice: number;
  location: string;
}

export interface AssetPartUsageHistoryRecord {
  id: string;
  usedDate: string;
  repairTicketNo: string;
  assetId: string;
  assetNo: string;
  modelName: string;
  partId: string;
  skuCode: string;
  partName: string;
  usedQty: number;
  unitCost: number;
  totalPartCost: number;
  mechanicName: string;
  repairSummary: string;
}

const INITIAL_PARTS_INVENTORY: PartInventoryItem[] = COMPATIBLE_PARTS_CATALOG.slice(0, 12).map((item, idx) => {
  const saleQty = (idx % 4 + 2) * 3;
  const repairQty = (idx % 3 + 2) * 2;
  return {
    id: item.id || `PRT-FL-${idx + 1}`,
    skuCode: item.sku,
    partName: item.partName,
    category: item.category,
    compatibleModels: item.compatibleModels.join(', '),
    spec: item.specSummary,
    totalQty: saleQty + repairQty,
    saleStockQty: saleQty,
    repairStockQty: repairQty,
    minStockQty: 4,
    purchaseUnitCost: item.dealerPriceKrw || Math.round(item.retailPriceKrw * 0.72),
    saleUnitPrice: item.retailPriceKrw,
    location: `부품창고 B-${String(idx + 1).padStart(2, '0')}`
  };
});

export const INITIAL_ASSET_PART_USAGE_HISTORY: AssetPartUsageHistoryRecord[] = [
  {
    id: 'PUH-202610-001',
    usedDate: '2026-10-12',
    repairTicketNo: 'REP-202610-001',
    assetId: 'AST-FL-001',
    assetNo: 'FL-001',
    modelName: '헬리 CPD25-G2 리튬전동 2.5톤',
    partId: INITIAL_PARTS_INVENTORY[0]?.id || 'PRT-FL-1',
    skuCode: INITIAL_PARTS_INVENTORY[0]?.skuCode || 'HYD-SEAL-25',
    partName: INITIAL_PARTS_INVENTORY[0]?.partName || '마스트 리프트실린더 오버홀 씰키트',
    usedQty: 1,
    unitCost: INITIAL_PARTS_INVENTORY[0]?.purchaseUnitCost || 68000,
    totalPartCost: INITIAL_PARTS_INVENTORY[0]?.purchaseUnitCost || 68000,
    mechanicName: '김정비',
    repairSummary: '마스트 리프트 실린더 미세 누유 씰키트 교체 정비 · 자산이력 자동 기록'
  },
  {
    id: 'PUH-202610-002',
    usedDate: '2026-10-19',
    repairTicketNo: 'REP-202610-002',
    assetId: 'AST-FL-005',
    assetNo: 'FL-005',
    modelName: '두산밥캣 D50S-9 디젤 5.0톤',
    partId: INITIAL_PARTS_INVENTORY[2]?.id || 'PRT-FL-3',
    skuCode: INITIAL_PARTS_INVENTORY[2]?.skuCode || 'BRK-SHOE-50',
    partName: INITIAL_PARTS_INVENTORY[2]?.partName || '제동 브레이크 라이닝 슈 세트',
    usedQty: 2,
    unitCost: INITIAL_PARTS_INVENTORY[2]?.purchaseUnitCost || 95000,
    totalPartCost: (INITIAL_PARTS_INVENTORY[2]?.purchaseUnitCost || 95000) * 2,
    mechanicName: '박기장',
    repairSummary: '창원 중공업 현장 정기점검 시 좌우 브레이크 슈 교체 · 자산이력 자동 기록'
  },
  {
    id: 'PUH-202610-003',
    usedDate: '2026-10-26',
    repairTicketNo: 'REP-202610-003',
    assetId: 'AST-FL-007',
    assetNo: 'FL-007',
    modelName: '니치유 FB18PN 리치전동 1.8톤',
    partId: INITIAL_PARTS_INVENTORY[4]?.id || 'PRT-FL-5',
    skuCode: INITIAL_PARTS_INVENTORY[4]?.skuCode || 'ELC-CONT-48',
    partName: INITIAL_PARTS_INVENTORY[4]?.partName || '구동 마그네틱 컨택터 48V 300A',
    usedQty: 1,
    unitCost: INITIAL_PARTS_INVENTORY[4]?.purchaseUnitCost || 145000,
    totalPartCost: INITIAL_PARTS_INVENTORY[4]?.purchaseUnitCost || 145000,
    mechanicName: '김정비',
    repairSummary: '리치트럭 주행 컨택터 접점 소손 교체 수리 · 자산이력 자동 기록'
  }
];

export function loadPartsInventory(): PartInventoryItem[] {
  try {
    const saved = localStorage.getItem('ebro_fl_parts_inv_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_PARTS_INVENTORY;
}

export function savePartsInventory(items: PartInventoryItem[]): void {
  try {
    localStorage.setItem('ebro_fl_parts_inv_v1', JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export function loadPartUsageHistory(): AssetPartUsageHistoryRecord[] {
  try {
    const saved = localStorage.getItem('ebro_fl_parts_usage_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_ASSET_PART_USAGE_HISTORY;
}

export function savePartUsageHistory(records: AssetPartUsageHistoryRecord[]): void {
  try {
    localStorage.setItem('ebro_fl_parts_usage_v1', JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export const PartsManagePage: React.FC = () => {
  const { setActiveTab } = useApp();
  const [subTab, setSubTab] = useState<'INVENTORY' | 'ASSET_HISTORY' | 'CATALOG'>('INVENTORY');
  const [parts, setParts] = useState<PartInventoryItem[]>(loadPartsInventory);
  const [usageHistory, setUsageHistory] = useState<AssetPartUsageHistoryRecord[]>(loadPartUsageHistory);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  React.useEffect(() => {
    try {
      if (!localStorage.getItem('ebro_fl_parts_inv_v1')) {
        localStorage.setItem('ebro_fl_parts_inv_v1', JSON.stringify(parts));
      }
      if (!localStorage.getItem('ebro_fl_parts_usage_v1')) {
        localStorage.setItem('ebro_fl_parts_usage_v1', JSON.stringify(usageHistory));
      }
    } catch {}
    const sync = () => {
      setParts(loadPartsInventory());
      setUsageHistory(loadPartUsageHistory());
    };
    window.addEventListener('ebro:parts_updated', sync);
    return () => window.removeEventListener('ebro:parts_updated', sync);
  }, []);

  // 입고 등록 인라인 폼 상태
  const [showInboundForm, setShowInboundForm] = useState<boolean>(false);
  const [targetPartId, setTargetPartId] = useState<string>(INITIAL_PARTS_INVENTORY[0]?.id || '');
  const [inboundPurpose, setInboundPurpose] = useState<'REPAIR' | 'SALE'>('REPAIR');
  const [inboundQty, setInboundQty] = useState<number>(5);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const filteredParts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return parts.filter(p => {
      if (!q) return true;
      return (
        p.partName.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q) ||
        p.compatibleModels.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [parts, searchTerm]);

  const filteredUsageHistory = useMemo(() => {
    return usageHistory.filter(u => {
      if (assetFilter !== 'ALL' && u.assetId !== assetFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        return (
          u.assetNo.toLowerCase().includes(q) ||
          u.partName.toLowerCase().includes(q) ||
          u.skuCode.toLowerCase().includes(q) ||
          u.repairSummary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [usageHistory, assetFilter, searchTerm]);

  const summary = useMemo(() => {
    const totalSaleQty = parts.reduce((s, p) => s + p.saleStockQty, 0);
    const totalRepairQty = parts.reduce((s, p) => s + p.repairStockQty, 0);
    const totalRepairValue = parts.reduce((s, p) => s + p.repairStockQty * p.purchaseUnitCost, 0);
    const totalUsedAmount = usageHistory.reduce((s, u) => s + u.totalPartCost, 0);
    return { totalSaleQty, totalRepairQty, totalRepairValue, totalUsedAmount };
  }, [parts, usageHistory]);

  const handleInboundSubmit = () => {
    const safeQty = Math.max(1, Math.floor(Number(inboundQty) || 1));
    setParts(prev => {
      const next = prev.map(p => {
        if (p.id !== targetPartId) return p;
        const addSale = inboundPurpose === 'SALE' ? safeQty : 0;
        const addRepair = inboundPurpose === 'REPAIR' ? safeQty : 0;
        return {
          ...p,
          saleStockQty: p.saleStockQty + addSale,
          repairStockQty: p.repairStockQty + addRepair,
          totalQty: p.totalQty + addSale + addRepair
        };
      });
      savePartsInventory(next);
      return next;
    });
    setShowInboundForm(false);
    showToast(`부품 입고 등록 완료 · ${inboundPurpose === 'REPAIR' ? '렌탈자산 정비용' : '유통 판매용'} 재고 ${safeQty}개가 반영되었습니다.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: '12.5px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      {/* 상단 헤더 및 탭 스위치 */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
              부품관리-렌탈 · 유통판매용 및 렌탈정비용 부품 통합재고 · 자산별 부품사용이력
            </h2>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            부품의 유통 판매용·렌탈 정비용 재고를 통합 관리하며, 정비관리-렌탈에서 정비 입력 시 차감된 부품사용이력이 렌탈자산 이력에 자동 기록됩니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('INVENTORY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'INVENTORY' ? 'var(--primary)' : 'transparent',
              color: subTab === 'INVENTORY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Boxes size={14} />
            <span>부품 통합 재고 · 구매입고 ({parts.length}종)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('ASSET_HISTORY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'ASSET_HISTORY' ? '#059669' : 'transparent',
              color: subTab === 'ASSET_HISTORY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <History size={14} />
            <span>렌탈자산별 부품사용이력 원장 ({usageHistory.length}건)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('CATALOG')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'CATALOG' ? '#7c3aed' : 'transparent',
              color: subTab === 'CATALOG' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileSpreadsheet size={14} />
            <span>호환부품 카탈로그 · 주문서</span>
          </button>
        </div>
      </div>

      {/* 상단 요약 카드 */}
      {subTab !== 'CATALOG' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>렌탈자산 정비용 부품재고</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>{summary.totalRepairQty}개</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>유통 판매용 부품재고</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#1d4ed8', marginTop: '4px' }}>{summary.totalSaleQty}개</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>렌탈정비용 부품 재고자산액</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>₩{summary.totalRepairValue.toLocaleString('ko-KR')}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>누적 렌탈자산 정비투입 부품원가</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>₩{summary.totalUsedAmount.toLocaleString('ko-KR')}</div>
          </div>
        </div>
      )}

      {subTab === 'CATALOG' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <CompatiblePartsCatalogOrderPage />
        </div>
      ) : subTab === 'INVENTORY' ? (
        <>
          <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="부품명, 품번, 호환 지게차 모델 검색..."
                style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowInboundForm(prev => !prev)}
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} />
                <span>부품 구매입고 등록</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('repairs')}
                className="btn btn-secondary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>정비관리-렌탈에서 부품 사용 등록</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {showInboundForm && (
            <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>부품 입고 등록 (용도별 재고 반영)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>입고 부품 선택</label>
                  <select value={targetPartId} onChange={e => setTargetPartId(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                    {parts.map(p => (
                      <option key={p.id} value={p.id}>{p.skuCode} · {p.partName}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>보유 용도 구분</label>
                  <select value={inboundPurpose} onChange={e => setInboundPurpose(e.target.value as any)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                    <option value="REPAIR">렌탈자산 정비용 재고</option>
                    <option value="SALE">유통 판매용 재고</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>입고 수량</label>
                  <input type="number" min={1} value={inboundQty} onChange={e => setInboundQty(Math.max(1, Number(e.target.value) || 1))} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={handleInboundSubmit} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700 }}>입고 확정</button>
                  <button type="button" onClick={() => setShowInboundForm(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12.5px' }}>취소</button>
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품 품번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>계통 분류</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>적용 지게차 모델</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>렌탈자산 정비용 재고</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>유통 판매용 재고</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>총 보유재고</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>매입 원가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>유통 판매단가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>보관 위치</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', height: '39px' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.skuCode}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{p.partName}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{p.category}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.compatibleModels}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#059669', whiteSpace: 'nowrap' }}>{p.repairStockQty}개</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8', whiteSpace: 'nowrap' }}>{p.saleStockQty}개</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, whiteSpace: 'nowrap' }}>{p.totalQty}개</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{p.purchaseUnitCost.toLocaleString('ko-KR')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>₩{p.saleUnitPrice.toLocaleString('ko-KR')}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800 }}>렌탈자산 정비 부품사용이력 원장</span>
              <select
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
              >
                <option value="ALL">전체 렌탈자산 ({SEED_FL_RENTAL_ASSETS.length}대)</option>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('repairs')}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>정비관리-렌탈에서 신규 정비·부품차감 입력</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>사용일자</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>정비번호</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>자산번호·모델명</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>투입 부품 품번·품명</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>사용수량</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>부품단가</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>부품원가 합계</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>담당 정비사</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>자산 정비이력 기록 내역</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsageHistory.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{u.usedDate}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{u.repairTicketNo}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <strong>{u.assetNo}</strong> · {u.modelName}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>[{u.skuCode}]</span> <strong>{u.partName}</strong>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{u.usedQty}개</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{u.unitCost.toLocaleString('ko-KR')}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#d97706', whiteSpace: 'nowrap' }}>₩{u.totalPartCost.toLocaleString('ko-KR')}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{u.mechanicName}</td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{u.repairSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default PartsManagePage;
