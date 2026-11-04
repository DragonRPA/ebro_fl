import React, { useState, useMemo } from 'react';
import { Wrench, Boxes, History, Plus, Search, ArrowRight, FileSpreadsheet, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_RENTAL_ASSETS } from '../data/flUnifiedSeedData';
import { MUJIN_PARTS_INVENTORY } from '../data/mujinGlobalInitialData';
import { CompatiblePartsCatalogOrderPage } from './distribution/CompatiblePartsCatalogOrderPage';
import { exportToExcel } from '../services/excel';

export interface PartInventoryItem {
  id: string;
  skuCode: string;
  partName: string;
  category: string;
  brand?: string;
  inventoryType?: string;
  currency?: string;
  compatibleModels: string;
  spec: string;
  baseYm?: string;
  inboundDate?: string;
  inboundYm?: string;
  agingMonths?: number;
  initialQty?: number;
  initialAmount?: number;
  totalQty: number;
  saleStockQty: number;
  repairStockQty: number;
  minStockQty: number;
  purchaseUnitCost: number;
  exactUnitCost?: number;
  stockBalanceAmount?: number;
  saleUnitPrice: number;
  location: string;
  serialNo?: string;
  imageFile?: string;
  imageUrl?: string;
  createdDate?: string;
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

export interface MonthlyBackcalculatedPart extends PartInventoryItem {
  calcElapsedMonths: number;
  calcAgingBucket: number;
  calcStockQty: number;
  calcStockBalanceAmount: number;
  calcSaleStockQty: number;
  calcRepairStockQty: number;
  isReceivedAsOfTarget: boolean;
}

export function computeElapsedMonths(inboundYm: string | undefined, targetYm: string): number {
  const safeInbound = (inboundYm || '2026-04').replace('.', '-').slice(0, 7);
  const safeTarget = (targetYm || '2026-04').replace('.', '-').slice(0, 7);
  const [iyStr, imStr] = safeInbound.split('-');
  const [tyStr, tmStr] = safeTarget.split('-');
  const iy = parseInt(iyStr, 10) || 2026;
  const im = parseInt(imStr, 10) || 4;
  const ty = parseInt(tyStr, 10) || 2026;
  const tm = parseInt(tmStr, 10) || 4;
  return (ty - iy) * 12 + (tm - im);
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [yStr, mStr] = (ym || '2026-04').split('-');
  let y = parseInt(yStr, 10) || 2026;
  let m = (parseInt(mStr, 10) || 4) + deltaMonths;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

const INITIAL_PARTS_INVENTORY: PartInventoryItem[] = [
  ...MUJIN_PARTS_INVENTORY
];

export const INITIAL_ASSET_PART_USAGE_HISTORY: AssetPartUsageHistoryRecord[] = [];

const PARTS_STORAGE_KEY = 'ebro_fl_parts_inv_v3_mujin_273';
const PARTS_USAGE_STORAGE_KEY = 'ebro_fl_parts_usage_v2_mujin';

export function loadPartsInventory(): PartInventoryItem[] {
  try {
    const saved = localStorage.getItem(PARTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(p => String(p.id || '').startsWith('PRT-FL-'))) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_PARTS_INVENTORY;
}

export function savePartsInventory(items: PartInventoryItem[]): void {
  try {
    localStorage.setItem(PARTS_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export function loadPartUsageHistory(): AssetPartUsageHistoryRecord[] {
  try {
    const saved = localStorage.getItem(PARTS_USAGE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return INITIAL_ASSET_PART_USAGE_HISTORY;
}

export function savePartUsageHistory(records: AssetPartUsageHistoryRecord[]): void {
  try {
    localStorage.setItem(PARTS_USAGE_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export const PartsManagePage: React.FC = () => {
  const { setActiveTab } = useApp();
  const [subTab, setSubTab] = useState<'INVENTORY' | 'ASSET_HISTORY' | 'CATALOG'>('INVENTORY');
  const [parts, setParts] = useState<PartInventoryItem[]>(loadPartsInventory);
  const [usageHistory, setUsageHistory] = useState<AssetPartUsageHistoryRecord[]>(loadPartUsageHistory);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [targetYm, setTargetYm] = useState<string>('2026-04');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<number | 'ALL'>('ALL');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  React.useEffect(() => {
    try {
      if (!localStorage.getItem(PARTS_STORAGE_KEY)) {
        localStorage.setItem(PARTS_STORAGE_KEY, JSON.stringify(parts));
      }
      if (!localStorage.getItem(PARTS_USAGE_STORAGE_KEY)) {
        localStorage.setItem(PARTS_USAGE_STORAGE_KEY, JSON.stringify(usageHistory));
      }
    } catch {}
    const sync = () => {
      setParts(loadPartsInventory());
      setUsageHistory(loadPartUsageHistory());
    };
    window.addEventListener('ebro:parts_updated', sync);
    return () => window.removeEventListener('ebro:parts_updated', sync);
  }, []);

  const [showInboundForm, setShowInboundForm] = useState<boolean>(false);
  const [targetPartId, setTargetPartId] = useState<string>(INITIAL_PARTS_INVENTORY[0]?.id || '');
  const [inboundPurpose, setInboundPurpose] = useState<'REPAIR' | 'SALE'>('REPAIR');
  const [inboundQty, setInboundQty] = useState<number>(5);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 부품별 당월 이후 사용수량 맵 (역산용)
  const usedQtyUpToTargetMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usageHistory) {
      const uYm = (u.usedDate || '').slice(0, 7);
      if (uYm && uYm <= targetYm) {
        map.set(u.partId, (map.get(u.partId) || 0) + (u.usedQty || 0));
      }
    }
    return map;
  }, [usageHistory, targetYm]);

  // 1개월 단위 경과월수 및 재고잔량·재고잔액 동적 역산
  const backcalculatedParts = useMemo<MonthlyBackcalculatedPart[]>(() => {
    return parts.map(p => {
      const inboundYm = p.inboundYm || (p.inboundDate ? p.inboundDate.slice(0, 7) : '2026-04');
      const elapsed = computeElapsedMonths(inboundYm, targetYm);
      if (elapsed < 0) {
        return {
          ...p,
          calcElapsedMonths: elapsed,
          calcAgingBucket: -1,
          calcStockQty: 0,
          calcStockBalanceAmount: 0,
          calcSaleStockQty: 0,
          calcRepairStockQty: 0,
          isReceivedAsOfTarget: false
        };
      }

      const bucket = Math.min(24, elapsed);
      const initQty = p.initialQty ?? p.totalQty;
      const initAmt = p.initialAmount ?? p.stockBalanceAmount ?? (initQty * p.purchaseUnitCost);
      const usedUpToTarget = usedQtyUpToTargetMap.get(p.id) || 0;
      // 신규 입고 추가분이 있는 경우 반영
      const extraAddedQty = Math.max(0, p.totalQty - initQty);
      const calcQty = Math.max(0, initQty + extraAddedQty - usedUpToTarget);

      // 원단위 정밀 재고잔액 역산: 수량 변동이 없을 경우 원본 총금액(stockBalanceAmount)을 1원 오차 없이 보존
      let calcAmt = 0;
      if (calcQty === p.totalQty && p.stockBalanceAmount !== undefined && extraAddedQty === 0) {
        calcAmt = p.stockBalanceAmount;
      } else if (calcQty === initQty && extraAddedQty === 0) {
        calcAmt = initAmt;
      } else if (initQty > 0) {
        const exactUnit = p.exactUnitCost ?? (initAmt / initQty);
        calcAmt = Math.round(calcQty * exactUnit);
      } else {
        calcAmt = calcQty * p.purchaseUnitCost;
      }

      const saleRatio = p.totalQty > 0 ? p.saleStockQty / p.totalQty : 0.6;
      const calcSale = calcQty === p.totalQty ? p.saleStockQty : Math.round(calcQty * saleRatio);
      const calcRepair = Math.max(0, calcQty - calcSale);

      return {
        ...p,
        calcElapsedMonths: elapsed,
        calcAgingBucket: bucket,
        calcStockQty: calcQty,
        calcStockBalanceAmount: calcAmt,
        calcSaleStockQty: calcSale,
        calcRepairStockQty: calcRepair,
        isReceivedAsOfTarget: true
      };
    });
  }, [parts, targetYm, usedQtyUpToTargetMap]);

  // 0개월 ~ 23개월, 24개월이상 총 25개 경과월 버킷별 집계 매트릭스
  const agingBucketsSummary = useMemo(() => {
    const buckets = Array.from({ length: 25 }, (_, i) => ({
      bucket: i,
      label: i === 24 ? '24개월이상' : `${i}개월`,
      itemCount: 0,
      stockQty: 0,
      stockAmount: 0
    }));
    let unreceivedCount = 0;
    let totalActiveKinds = 0;
    let totalStockQty = 0;
    let totalStockAmount = 0;
    let totalSaleQty = 0;
    let totalRepairQty = 0;

    for (const bp of backcalculatedParts) {
      if (!bp.isReceivedAsOfTarget || bp.calcStockQty <= 0) {
        if (!bp.isReceivedAsOfTarget) unreceivedCount += 1;
        continue;
      }
      const b = bp.calcAgingBucket;
      if (b >= 0 && b <= 24) {
        buckets[b].itemCount += 1;
        buckets[b].stockQty += bp.calcStockQty;
        buckets[b].stockAmount += bp.calcStockBalanceAmount;
      }
      totalActiveKinds += 1;
      totalStockQty += bp.calcStockQty;
      totalStockAmount += bp.calcStockBalanceAmount;
      totalSaleQty += bp.calcSaleStockQty;
      totalRepairQty += bp.calcRepairStockQty;
    }

    return {
      buckets,
      unreceivedCount,
      totalActiveKinds,
      totalStockQty,
      totalStockAmount,
      totalSaleQty,
      totalRepairQty
    };
  }, [backcalculatedParts]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of parts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [parts]);

  const filteredParts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return backcalculatedParts.filter(p => {
      if (!p.isReceivedAsOfTarget) return false;
      if (brandFilter !== 'ALL' && (p.brand || 'HANGCHA') !== brandFilter) return false;
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (selectedAgingBucket !== 'ALL' && p.calcAgingBucket !== selectedAgingBucket) return false;
      if (!q) return true;
      return (
        p.partName.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q) ||
        p.compatibleModels.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.serialNo || '').toLowerCase().includes(q)
      );
    });
  }, [backcalculatedParts, brandFilter, categoryFilter, selectedAgingBucket, searchTerm]);

  const filteredTotals = useMemo(() => {
    return filteredParts.reduce(
      (acc, p) => {
        acc.qty += p.calcStockQty;
        acc.amount += p.calcStockBalanceAmount;
        acc.saleQty += p.calcSaleStockQty;
        acc.repairQty += p.calcRepairStockQty;
        return acc;
      },
      { qty: 0, amount: 0, saleQty: 0, repairQty: 0 }
    );
  }, [filteredParts]);

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

  const handleInboundSubmit = () => {
    const safeQty = Math.max(1, Math.floor(Number(inboundQty) || 1));
    setParts(prev => {
      const next = prev.map(p => {
        if (p.id !== targetPartId) return p;
        const addSale = inboundPurpose === 'SALE' ? safeQty : 0;
        const addRepair = inboundPurpose === 'REPAIR' ? safeQty : 0;
        const addedQty = addSale + addRepair;
        const addedAmt = Math.round(addedQty * (p.exactUnitCost || p.purchaseUnitCost));
        return {
          ...p,
          saleStockQty: p.saleStockQty + addSale,
          repairStockQty: p.repairStockQty + addRepair,
          totalQty: p.totalQty + addedQty,
          stockBalanceAmount: (p.stockBalanceAmount ?? p.totalQty * p.purchaseUnitCost) + addedAmt
        };
      });
      savePartsInventory(next);
      return next;
    });
    setShowInboundForm(false);
    showToast(`부품 입고 등록 완료 · ${inboundPurpose === 'REPAIR' ? '렌탈자산 정비용' : '유통 판매용'} 재고 ${safeQty}개가 반영되었습니다.`);
  };

  // 원본 39컬럼 양식 그대로 엑셀 다운로드 (기준년월 역산 기준)
  const handleExportAgingExcel = () => {
    const excelRows = filteredParts.map((p, idx) => {
      const rowObj: Record<string, any> = {
        '순번': idx + 1,
        '기준년월': targetYm.replace('-', '.'),
        '최초입고일': p.inboundDate || '2026-04-01',
        '경과월수': p.calcAgingBucket,
        '품번': p.skuCode,
        '자재 내역': `${p.skuCode}_${p.partName}`,
        '제품종류': p.category,
        '호환모델': p.compatibleModels,
        '총재고': p.calcStockQty,
        '보관장소': p.location || '주기장',
        '공급업체명': p.brand || 'HANGCHA',
        '재고구분': p.inventoryType || '상품',
        '통화': p.currency || 'KRW',
        '총금액': p.calcStockBalanceAmount
      };
      for (let m = 0; m < 24; m++) {
        rowObj[`${m}개월금액`] = p.calcAgingBucket === m ? p.calcStockBalanceAmount : 0;
      }
      rowObj['24개월이상금액'] = p.calcAgingBucket === 24 ? p.calcStockBalanceAmount : 0;
      rowObj['시리얼번호'] = p.serialNo || '';
      rowObj['생성일'] = p.createdDate || '2026-05-13';
      rowObj['이미지파일'] = p.imageFile || '';
      rowObj['이미지출처'] = p.imageUrl || '';
      return rowObj;
    });

    exportToExcel(excelRows, `무진글로벌_부품재고리스트_경과월역산_${targetYm}`, 'Data');
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
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              부품관리-렌탈 · 부품재고리스트 및 월별 경과 역산 원장
            </h2>
          </div>
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
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Boxes size={14} />
            <span>부품 통합 재고 · 월별 경과 집계</span>
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
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <History size={14} />
            <span>렌탈자산별 부품사용이력 원장</span>
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
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FileSpreadsheet size={14} />
            <span>호환부품 카탈로그 · 주문서</span>
          </button>
        </div>
      </div>

      {/* 상단 요약 카드 */}
      {subTab !== 'CATALOG' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>기준년월 보유 품목수</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)', marginTop: '4px', whiteSpace: 'nowrap' }}>{agingBucketsSummary.totalActiveKinds.toLocaleString('ko-KR')}종</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>기준년월 총 재고수량</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '4px', whiteSpace: 'nowrap' }}>{agingBucketsSummary.totalStockQty.toLocaleString('ko-KR')}개</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>유통판매용 / 렌탈정비용</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8', marginTop: '4px', whiteSpace: 'nowrap' }}>
              {agingBucketsSummary.totalSaleQty.toLocaleString('ko-KR')}개 / <span style={{ color: '#b45309' }}>{agingBucketsSummary.totalRepairQty.toLocaleString('ko-KR')}개</span>
            </div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>기준년월 총 재고잔액</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#7c3aed', marginTop: '4px', whiteSpace: 'nowrap' }}>₩{agingBucketsSummary.totalStockAmount.toLocaleString('ko-KR')}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>현재 필터 선택 합계</div>
            <div style={{ fontSize: '16.5px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px', whiteSpace: 'nowrap' }}>
              {filteredTotals.qty.toLocaleString('ko-KR')}개 · ₩{filteredTotals.amount.toLocaleString('ko-KR')}
            </div>
          </div>
        </div>
      )}

      {subTab === 'CATALOG' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <CompatiblePartsCatalogOrderPage />
        </div>
      ) : subTab === 'INVENTORY' ? (
        <>
          {/* 1개월 단위 경과월수별 재고잔량 · 재고잔액 역산 매트릭스 바 */}
          <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  입고연월 기준 1개월 단위 경과별 재고잔량 · 재고잔액 재집계
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-app)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setTargetYm(prev => shiftYearMonth(prev, -1))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
                    title="이전 1개월"
                  >
                    <ChevronLeft size={14} /> 1개월 전
                  </button>
                  <input
                    type="month"
                    value={targetYm}
                    onChange={e => setTargetYm(e.target.value || '2026-04')}
                    style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '12.5px', fontWeight: 800 }}
                  />
                  <button
                    type="button"
                    onClick={() => setTargetYm(prev => shiftYearMonth(prev, 1))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
                    title="다음 1개월"
                  >
                    1개월 후 <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetYm('2026-04');
                      setSelectedAgingBucket('ALL');
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    기준월 2026-04 복원
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedAgingBucket !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgingBucket('ALL')}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    경과월 필터 해제
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportAgingExcel}
                  className="btn-excel-download"
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                >
                  <Download size={13} /> 39컬럼 경과월 재고잔액 엑셀 내보내기
                </button>
              </div>
            </div>

            {/* 0개월 ~ 24개월이상 가로 스크롤 매트릭스 */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: '6px', minWidth: 'max-content', paddingBottom: '2px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedAgingBucket('ALL')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: selectedAgingBucket === 'ALL' ? '2px solid #2563eb' : '1px solid var(--border-color)',
                    backgroundColor: selectedAgingBucket === 'ALL' ? '#eff6ff' : 'var(--bg-app)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: '115px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af' }}>전체 경과월 합계</div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {agingBucketsSummary.totalActiveKinds}종 · {agingBucketsSummary.totalStockQty.toLocaleString('ko-KR')}개
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#2563eb' }}>
                    ₩{agingBucketsSummary.totalStockAmount.toLocaleString('ko-KR')}
                  </div>
                </button>

                {agingBucketsSummary.buckets.map(b => {
                  const hasData = b.itemCount > 0;
                  const isSelected = selectedAgingBucket === b.bucket;
                  return (
                    <button
                      key={b.bucket}
                      type="button"
                      onClick={() => setSelectedAgingBucket(isSelected ? 'ALL' : b.bucket)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid var(--border-color)',
                        backgroundColor: isSelected ? '#eff6ff' : hasData ? '#ffffff' : 'var(--bg-app)',
                        opacity: hasData ? 1 : 0.55,
                        cursor: 'pointer',
                        textAlign: 'left',
                        minWidth: '96px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: b.bucket >= 12 ? '#b45309' : '#0f766e' }}>
                        {b.label} 경과
                      </div>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {b.itemCount}종 · {b.stockQty.toLocaleString('ko-KR')}개
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: hasData ? '#1e40af' : 'var(--text-muted)' }}>
                        ₩{b.stockAmount.toLocaleString('ko-KR')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 필터 및 검색 컨트롤 바 */}
          <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>공급업체 · 브랜드</label>
                <select
                  value={brandFilter}
                  onChange={e => setBrandFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 브랜드</option>
                  <option value="HANGCHA">항차</option>
                  <option value="HELI">헬리</option>
                  <option value="BYD">비와이디</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제품종류 · 계통분류</label>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 제품종류</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>품번 · 품명 · 모델 검색</label>
                <div style={{ position: 'relative', width: '260px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="품번, 부품명, 호환 지게차 모델 검색"
                    style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowInboundForm(prev => !prev)}
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <Plus size={14} />
                <span>부품 구매입고 등록</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('repairs')}
                className="btn btn-secondary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <span>정비관리-렌탈에서 부품 사용 등록</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {showInboundForm && (
            <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>부품 입고 등록</div>
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
                  <button type="button" onClick={handleInboundSubmit} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>입고 확정</button>
                  <button type="button" onClick={() => setShowInboundForm(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>취소</button>
                </div>
              </div>
            </div>
          )}

          {/* 부품 재고 대장 테이블 */}
          <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>순번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품 품번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>공급업체</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>제품종류 · 계통</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>적용 지게차 모델</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>최초입고일</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>입고연월</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>경과월수</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>유통판매용</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>렌탈정비용</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>재고수량</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>매입단가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>재고잔액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>시리얼번호</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>보관위치</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map((p, idx) => {
                    const brandLabel = p.brand === 'HELI' ? '헬리' : p.brand === 'BYD' ? '비와이디' : '항차';
                    const agingLabel = p.calcAgingBucket === 24 ? '24개월이상' : `${p.calcAgingBucket}개월`;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', height: '39px' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.skuCode}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{p.partName}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>{brandLabel}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{p.category}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.compatibleModels}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.inboundDate || '2026-04-01'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.inboundYm || '2026-04'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: p.calcAgingBucket >= 12 ? '#fef3c7' : '#dcfce7',
                              color: p.calcAgingBucket >= 12 ? '#b45309' : '#166534'
                            }}
                          >
                            {agingLabel}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>{p.calcSaleStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{p.calcRepairStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, whiteSpace: 'nowrap' }}>{p.calcStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{p.purchaseUnitCost.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, color: '#7c3aed', whiteSpace: 'nowrap' }}>₩{p.calcStockBalanceAmount.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.serialNo || '-'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 우하단 대차대조 합계 검증 바 (헌장 3.5 Z-Pattern 4단계) */}
            <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-app)', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                기준년월 {targetYm} · 조회 품목 {filteredParts.length.toLocaleString('ko-KR')}종
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                <span>유통판매용: <strong style={{ color: '#1d4ed8' }}>{filteredTotals.saleQty.toLocaleString('ko-KR')}개</strong></span>
                <span>렌탈정비용: <strong style={{ color: '#059669' }}>{filteredTotals.repairQty.toLocaleString('ko-KR')}개</strong></span>
                <span>재고수량 합계: <strong style={{ color: 'var(--primary)' }}>{filteredTotals.qty.toLocaleString('ko-KR')}개</strong></span>
                <span>재고잔액 합계: <strong style={{ color: '#7c3aed' }}>₩{filteredTotals.amount.toLocaleString('ko-KR')}</strong></span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>렌탈자산 정비 부품사용이력 원장</span>
              <select
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
              >
                <option value="ALL">전체 렌탈자산</option>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('repairs')}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
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
                {filteredUsageHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      등록된 부품 사용 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredUsageHistory.map(u => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default PartsManagePage;
