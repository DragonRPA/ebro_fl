// src/pages/ConsumableStockPage.tsx
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Boxes, Truck, Archive, CheckSquare, Plus, Search, Download, 
  CheckCircle2, XCircle, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, 
  Edit, Trash2, X, AlertTriangle, ShieldCheck, FileCheck, ChevronLeft, ChevronRight
} from 'lucide-react';
import { exportToExcel } from '../services/excel';
import { SortableTh } from '../components/SortableTh';
import { useSortableData } from '../hooks/useSortableData';
import { 
  Consumable, MechanicConsumableStock, StocktakingAudit, 
  StocktakingAuditItem, CollectedPart, User, db 
} from '../services/db';
import { normalizeMenuId } from '../config/menu_config';
import { getRoleTemplatePermission } from '../config/role_templates';
import { createHangulMatcher } from '../utils/hangulSearch';

export interface ConsumableStockPageProps {
  initialTab?: 'STOCK' | 'MASTER' | 'VEHICLE_STOCK' | 'COLLECTED_PARTS' | 'STOCKTAKING';
}

export const ConsumableStockPage: React.FC<ConsumableStockPageProps> = ({ initialTab = 'STOCK' }) => {
  const {
    consumables,
    consumableLots,
    consumableLogs,
    mechanicConsumableStocks,
    stocktakingAudits,
    stocktakingAuditItems,
    collectedParts,
    users,
    permissions,
    currentUser,
    addConsumable,
    updateConsumable,
    deleteConsumable,
    transferConsumableToMechanic,
    returnConsumableToHq,
    transferConsumableBetweenMechanics,
    createStocktakingAudit,
    updateStocktakingItem,
    confirmStocktakingAudit,
    cancelStocktakingAudit,
    processCollectedPart,
    hasPermission,
    showErrorModal
  } = useApp();

  const canSave = hasPermission('consumable_stock', 'save') || hasPermission('consumable', 'save');

  // O(1) 룩업 맵 사전 연산
  const consumableMap = useMemo(() => {
    const map = new Map<string, Consumable>();
    for (const c of consumables) map.set(c.id, c);
    return map;
  }, [consumables]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of (users || [])) map.set(u.id, u);
    return map;
  }, [users]);

  const permissionsByUserMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of (permissions || [])) {
      const uid = p.userId || (p as any).user_id;
      if (!uid) continue;
      const arr = map.get(uid);
      if (arr) arr.push(p);
      else map.set(uid, [p]);
    }
    return map;
  }, [permissions]);

  const vehicleQtyByConsumableMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ms of (mechanicConsumableStocks || [])) {
      if (!ms.stockQty) continue;
      map.set(ms.consumableId, (map.get(ms.consumableId) || 0) + ms.stockQty);
    }
    return map;
  }, [mechanicConsumableStocks]);

  const auditMap = useMemo(() => {
    const map = new Map<string, StocktakingAudit>();
    for (const a of stocktakingAudits) map.set(a.id, a);
    return map;
  }, [stocktakingAudits]);

  const auditItemsByAuditIdMap = useMemo(() => {
    const map = new Map<string, StocktakingAuditItem[]>();
    for (const item of stocktakingAuditItems) {
      const arr = map.get(item.auditId);
      if (arr) arr.push(item);
      else map.set(item.auditId, [item]);
    }
    return map;
  }, [stocktakingAuditItems]);

  // 활성 탭: STOCK (주기장재고) | MASTER (소모품마스터) | VEHICLE_STOCK (차량재고) | COLLECTED_PARTS (고품관리) | STOCKTAKING (재고실사)
  const [activeTab, setActiveTab] = useState<'STOCK' | 'MASTER' | 'VEHICLE_STOCK' | 'COLLECTED_PARTS' | 'STOCKTAKING'>(initialTab);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // 토스트 알림 상태
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // --- [1] 주기장 재고 상태 ---
  const [stockSearch, setStockSearch] = useState('');
  const [targetYm, setTargetYm] = useState('2026-04');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<number | 'ALL'>('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [handlingFilter, setHandlingFilter] = useState<'ALL' | 'HANDLED' | 'UNHANDLED'>('HANDLED');
  const [masterBrandFilter, setMasterBrandFilter] = useState('ALL');
  const [masterCategoryFilter, setMasterCategoryFilter] = useState('ALL');
  const [masterHandlingFilter, setMasterHandlingFilter] = useState<'ALL' | 'HANDLED' | 'UNHANDLED'>('ALL');
  const [masterSearchTerm, setMasterSearchTerm] = useState('');
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [masterEditingId, setMasterEditingId] = useState<string | null>(null);
  const [masterSkuCode, setMasterSkuCode] = useState('');
  const [masterModelName, setMasterModelName] = useState('');
  const [masterCategory, setMasterCategory] = useState('윤활유·오일류');
  const [masterBrand, setMasterBrand] = useState('SK루브리컨츠');
  const [masterSpec, setMasterSpec] = useState('');
  const [masterUnit, setMasterUnit] = useState('통');
  const [masterUnitPrice, setMasterUnitPrice] = useState(0);
  const [masterSalePrice, setMasterSalePrice] = useState(0);
  const [masterSupplier, setMasterSupplier] = useState('');
  const [masterIsHandled, setMasterIsHandled] = useState(true);
  const [masterInitialStockQty, setMasterInitialStockQty] = useState(0);
  const [expandedMasterIds, setExpandedMasterIds] = useState<Set<string>>(new Set());

  const toggleMasterExpand = (id: string) => {
    setExpandedMasterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- [2] 차량 재고 상태 및 이동 모달 ---
  const [vehicleStockSearch, setVehicleStockSearch] = useState('');
  const [selectedMechanicFilter, setSelectedMechanicFilter] = useState('ALL');

  // 주기장  차량 불출 모달
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMechanicId, setTransferMechanicId] = useState('');
  const [transferConsumableId, setTransferConsumableId] = useState('');
  const [transferQty, setTransferQty] = useState(1);
  const [transferMemo, setTransferMemo] = useState('');

  // 차량  주기장 반납 모달
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnMechanicId, setReturnMechanicId] = useState('');
  const [returnConsumableId, setReturnConsumableId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [returnMemo, setReturnMemo] = useState('');
  const [isReturnDefective, setIsReturnDefective] = useState(false);
  const [returnDisposition, setReturnDisposition] = useState<'REBUILD' | 'SCRAP' | 'VENDOR_WARRANTY'>('REBUILD');

  // 차량 간 이동 모달
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [p2pFromMechanicId, setP2pFromMechanicId] = useState('');
  const [p2pToMechanicId, setP2pToMechanicId] = useState('');
  const [p2pConsumableId, setP2pConsumableId] = useState('');
  const [p2pQty, setP2pQty] = useState(1);
  const [p2pMemo, setP2pMemo] = useState('');

  // --- [3] 고품 관리 상태 ---
  const [partDispositionFilter, setPartDispositionFilter] = useState<'ALL' | 'REBUILD' | 'SCRAP' | 'VENDOR_WARRANTY'>('ALL');
  const [partStatusFilter, setPartStatusFilter] = useState<'ALL' | 'RECEIVED' | 'IN_PROCESS' | 'COMPLETED'>('ALL');
  const [partSearch, setPartSearch] = useState('');

  // --- [4] 재고 실사 상태 ---
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [auditTargetFilter, setAuditTargetFilter] = useState<'ALL' | 'HQ' | 'VEHICLE'>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState<'ALL' | 'DRAFT' | 'CONFIRMED' | 'CANCELLED'>('ALL');
  const [showCreateAuditModal, setShowCreateAuditModal] = useState(false);
  const [newAuditTargetType, setNewAuditTargetType] = useState<'HQ' | 'VEHICLE'>('HQ');
  const [newAuditMechanicId, setNewAuditMechanicId] = useState('');
  const [newAuditMemo, setNewAuditMemo] = useState('');
  const [auditItemSearch, setAuditItemSearch] = useState('');

  // 소모품 적재/차량 불출 대상 정비사 (AS팀 실무자 및 소모품/정비/현장AS 권한 보유자)
  const mechanics = useMemo(() => {
    const asDeptIds = new Set(
      (db.departments || [])
        .filter(d => d.name?.includes('AS') || d.name?.includes('정비'))
        .map(d => d.id)
    );
    asDeptIds.add('DEPT-0000005');

    // 현재 이미 차량 재고를 보유하고 있는 정비사 ID 목록
    const existingHolders = new Set(
      (mechanicConsumableStocks || [])
        .filter(ms => ms.stockQty > 0)
        .map(ms => ms.mechanicId)
    );

    const vehicleTargetMenuIds = ['consumable_stock', 'consumable', 'field_as', 'repair'];

    const filtered = (users || []).filter(u => {
      // 0. 퇴사자 전면 배제
      if (!u || u.status === 'RETIRED') return false;

      // 이미 재고를 보유 중인 경우 관리 및 반납을 위해 무조건 표시
      if (existingHolders.has(u.id)) return true;

      // 1. 최고관리자/대표이사 등 정비 비실무 임원진 기본 배제
      if (u.id === 'sys-admin' || u.id === 'u-1' || u.loginId === 'admin') return false;
      if (u.position === '대표이사' || u.position === '대표' || u.position?.includes('대표')) return false;
      const dName = (u.department || '').trim();
      if (dName.includes('대표') || dName.includes('임원') || dName.includes('시스템')) return false;

      // 2. 소모품재고/현장AS/정비 관련 개별 권한 부여 여부 확인
      const userPerms = permissionsByUserMap.get(u.id) || [];
      const hasExplicitPerm = userPerms.some(p => 
        vehicleTargetMenuIds.includes(normalizeMenuId(p.menuId)) && (p.canView || p.canSave)
      );
      if (hasExplicitPerm) return true;

      // 3. 직무 템플릿 기준 권한 확인
      const dept = u.departmentId || u.department;
      const canViewStock = getRoleTemplatePermission(u.role, dept, 'consumable_stock', 'view');
      const canSaveStock = getRoleTemplatePermission(u.role, dept, 'consumable_stock', 'save');
      const canViewAs = getRoleTemplatePermission(u.role, dept, 'field_as', 'view');
      if (canViewStock || canSaveStock || canViewAs) return true;

      // 4. 실무 정비 역할이나 AS팀 소속인 경우
      const isAsDept = (u.departmentId && asDeptIds.has(u.departmentId)) || dName.includes('AS') || dName.includes('정비');
      const isMechanicRole = u.role === 'MECHANIC';
      if (isAsDept || isMechanicRole) return true;

      return false;
    });

    // 정렬: AS팀원 우선 배치, 팀장 우선 및 이름순 정렬
    return filtered.sort((a, b) => {
      const aIsAs = (a.departmentId && asDeptIds.has(a.departmentId)) || (a.department || '').includes('AS');
      const bIsAs = (b.departmentId && asDeptIds.has(b.departmentId)) || (b.department || '').includes('AS');
      if (aIsAs && !bIsAs) return -1;
      if (!aIsAs && bIsAs) return 1;
      if (a.role === 'MANAGER' && b.role !== 'MANAGER') return -1;
      if (b.role === 'MANAGER' && a.role !== 'MANAGER') return 1;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [users, permissionsByUserMap, mechanicConsumableStocks]);

  const mechanicMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const m of mechanics) map.set(m.id, m);
    return map;
  }, [mechanics]);

  const shiftTargetYm = (delta: number) => {
    setTargetYm(prev => {
      const [yStr, mStr] = (prev || '2026-04').split('-');
      let y = parseInt(yStr, 10) || 2026;
      let m = (parseInt(mStr, 10) || 4) + delta;
      while (m > 12) { m -= 12; y += 1; }
      while (m < 1) { m += 12; y -= 1; }
      return `${y}-${String(m).padStart(2, '0')}`;
    });
  };

  // 기준년월(targetYm) 이하의 출고·조정 차감 수량 맵 (수불 원장 기반 역산)
  const netDeductedByConsumableMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of (consumableLogs || [])) {
      if (!log || !log.consumableId) continue;
      const aYm = (log.actionDate || '').slice(0, 7);
      if (!aYm || aYm > targetYm) continue;
      if (log.type === 'OUTBOUND') {
        map.set(log.consumableId, (map.get(log.consumableId) || 0) + (log.quantity || 0));
      } else if (log.type === 'ADJUST') {
        map.set(log.consumableId, (map.get(log.consumableId) || 0) - (log.quantity || 0));
      }
    }
    return map;
  }, [consumableLogs, targetYm]);

  // 입고연월로부터 1개월 단위 경과월수 및 재고잔량·재고잔액 동적 재집계(역산)
  const backcalculatedConsumables = useMemo(() => {
    const [tyStr, tmStr] = (targetYm || '2026-04').split('-');
    const ty = parseInt(tyStr, 10) || 2026;
    const tm = parseInt(tmStr, 10) || 4;

    return consumables.map(c => {
      const inboundDate = c.inboundDate || (c.createdAt ? c.createdAt.slice(0, 10) : '2026-04-01');
      const inboundYm = (c.inboundYm || inboundDate.slice(0, 7)).replace('.', '-');
      const [iyStr, imStr] = inboundYm.split('-');
      const iy = parseInt(iyStr, 10) || 2026;
      const im = parseInt(imStr, 10) || 4;
      const elapsedMonths = (ty - iy) * 12 + (tm - im);

      if (elapsedMonths < 0) {
        return {
          ...c,
          inboundDate,
          inboundYm,
          calcElapsedMonths: elapsedMonths,
          calcAgingBucket: -1,
          calcStockQty: 0,
          calcStockBalanceAmount: 0,
          calcSaleStockQty: 0,
          calcRepairStockQty: 0,
          isReceivedAsOfTarget: false
        };
      }

      const bucket = Math.min(24, elapsedMonths);
      const initQty = c.initialQty ?? c.stockQty ?? 0;
      const initAmt = c.initialAmount ?? c.stockBalanceAmount ?? (initQty * (c.unitPrice || 0));
      const deducted = netDeductedByConsumableMap.get(c.id) || 0;
      const extraAdded = Math.max(0, (c.stockQty || 0) - initQty);
      const calcQty = Math.max(0, initQty + extraAdded - deducted);

      // 원단위 정밀 재고잔액 역산 (수량 변동이 없을 시 원본 총금액 100% 보존 -> 합계 64,889,155원 일치)
      let calcAmt = 0;
      if (calcQty === (c.stockQty || 0) && c.stockBalanceAmount !== undefined && extraAdded === 0) {
        calcAmt = c.stockBalanceAmount;
      } else if (calcQty === initQty && extraAdded === 0) {
        calcAmt = initAmt;
      } else if (initQty > 0) {
        const exactUnit = c.exactUnitCost ?? (initAmt / initQty);
        calcAmt = Math.round(calcQty * exactUnit);
      } else {
        calcAmt = calcQty * (c.unitPrice || 0);
      }

      const saleRatio = (c.stockQty || 0) > 0 && c.saleStockQty !== undefined ? c.saleStockQty / c.stockQty : 0.6;
      const calcSale = calcQty === (c.stockQty || 0) && c.saleStockQty !== undefined ? c.saleStockQty : Math.round(calcQty * saleRatio);
      const calcRepair = Math.max(0, calcQty - calcSale);

      return {
        ...c,
        inboundDate,
        inboundYm,
        calcElapsedMonths: elapsedMonths,
        calcAgingBucket: bucket,
        calcStockQty: calcQty,
        calcStockBalanceAmount: calcAmt,
        calcSaleStockQty: calcSale,
        calcRepairStockQty: calcRepair,
        isReceivedAsOfTarget: true
      };
    });
  }, [consumables, targetYm, netDeductedByConsumableMap]);

  // 0개월 ~ 23개월, 24개월이상 총 25개 경과월 버킷별 집계 매트릭스
  const agingBucketsSummary = useMemo(() => {
    const buckets = Array.from({ length: 25 }, (_, i) => ({
      bucket: i,
      label: i === 24 ? '24개월이상' : `${i}개월`,
      itemCount: 0,
      stockQty: 0,
      stockAmount: 0
    }));
    let activeKinds = 0;
    for (const bc of backcalculatedConsumables) {
      if (handlingFilter === 'HANDLED' && bc.isHandled === false) continue;
      if (handlingFilter === 'UNHANDLED' && bc.isHandled !== false) continue;
      if (!bc.isReceivedAsOfTarget || bc.calcStockQty <= 0) continue;
      activeKinds += 1;
      const b = bc.calcAgingBucket;
      if (b >= 0 && b <= 24) {
        buckets[b].itemCount += 1;
        buckets[b].stockQty += bc.calcStockQty;
        buckets[b].stockAmount += bc.calcStockBalanceAmount;
      }
    }
    return { buckets, activeKinds };
  }, [backcalculatedConsumables, handlingFilter]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(['윤활유·오일류', '구리스·방청·케미컬', '장갑·안전보호구', '세척·보로·전장소모재']);
    for (const c of consumables) {
      if (c.category) set.add(c.category);
    }
    return Array.from(set);
  }, [consumables]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of consumables) {
      const b = c.manufacturer || c.brand;
      if (b) set.add(b);
    }
    return Array.from(set);
  }, [consumables]);

  // 소모품 마스터 취급/미취급 통계 및 필터링
  const consumableMasterStats = useMemo(() => {
    let total = 0;
    let handled = 0;
    let unhandled = 0;
    for (const c of consumables) {
      total += 1;
      if (c.isHandled === false) unhandled += 1;
      else handled += 1;
    }
    return { total, handled, unhandled };
  }, [consumables]);

  const filteredMasterConsumables = useMemo(() => {
    const matcher = masterSearchTerm ? createHangulMatcher(masterSearchTerm) : null;
    return consumables.filter(c => {
      const b = c.manufacturer || c.brand || '';
      if (masterBrandFilter !== 'ALL' && b !== masterBrandFilter) return false;
      if (masterCategoryFilter !== 'ALL' && c.category !== masterCategoryFilter) return false;
      if (masterHandlingFilter === 'HANDLED' && c.isHandled === false) return false;
      if (masterHandlingFilter === 'UNHANDLED' && c.isHandled !== false) return false;
      if (!matcher) return true;
      return matcher.testAny([
        c.skuCode || '',
        c.modelName || '',
        c.category || '',
        b,
        c.spec || '',
        c.compatibleModels || '',
        c.supplier || ''
      ]);
    });
  }, [consumables, masterBrandFilter, masterCategoryFilter, masterHandlingFilter, masterSearchTerm]);

  // 재고 통계 요약 (기준년월 역산 및 유통 판매용 / 렌탈자산 정비용 구분 집계)
  const stockSummary = useMemo(() => {
    let hqTotalKinds = 0;
    let hqTotalQty = 0;
    let hqSaleQty = 0;
    let hqRepairQty = 0;
    let hqTotalValue = 0;
    for (const bc of backcalculatedConsumables) {
      if (handlingFilter === 'HANDLED' && bc.isHandled === false) continue;
      if (handlingFilter === 'UNHANDLED' && bc.isHandled !== false) continue;
      if (!bc.isReceivedAsOfTarget) continue;
      hqTotalKinds += 1;
      hqTotalQty += bc.calcStockQty;
      hqSaleQty += bc.calcSaleStockQty;
      hqRepairQty += bc.calcRepairStockQty;
      hqTotalValue += bc.calcStockBalanceAmount;
    }

    let vehicleTotalQty = 0;
    let vehicleTotalValue = 0;
    for (const s of (mechanicConsumableStocks || [])) {
      const qty = s.stockQty || 0;
      vehicleTotalQty += qty;
      const c = consumableMap.get(s.consumableId);
      vehicleTotalValue += qty * (c?.unitPrice || 0);
    }

    return {
      hqTotalKinds,
      hqTotalQty,
      hqSaleQty,
      hqRepairQty,
      hqTotalValue,
      vehicleTotalQty,
      vehicleTotalValue,
      grandTotalQty: hqTotalQty + vehicleTotalQty,
      grandTotalValue: hqTotalValue + vehicleTotalValue
    };
  }, [backcalculatedConsumables, handlingFilter, mechanicConsumableStocks, consumableMap]);

  // 고품 관리 요약 및 배지 카운트
  const collectedPartsSummary = useMemo(() => {
    const totalCount = collectedParts.length;
    let uncompletedCount = 0;
    let rebuildCount = 0;
    let scrapCount = 0;
    let warrantyCount = 0;
    for (const p of collectedParts) {
      if (p.status !== 'COMPLETED') uncompletedCount++;
      if (p.disposition === 'REBUILD') rebuildCount++;
      else if (p.disposition === 'SCRAP') scrapCount++;
      else if (p.disposition === 'VENDOR_WARRANTY') warrantyCount++;
    }
    return { totalCount, uncompletedCount, rebuildCount, scrapCount, warrantyCount };
  }, [collectedParts]);

  const draftAuditsCount = useMemo(() => {
    let count = 0;
    for (const a of stocktakingAudits) {
      if (a.status === 'DRAFT') count++;
    }
    return count;
  }, [stocktakingAudits]);

  const filteredAudits = useMemo(() => {
    return stocktakingAudits.filter(a => {
      const matchTarget = auditTargetFilter === 'ALL' || a.targetType === auditTargetFilter;
      const matchStatus = auditStatusFilter === 'ALL' || a.status === auditStatusFilter;
      return matchTarget && matchStatus;
    });
  }, [stocktakingAudits, auditTargetFilter, auditStatusFilter]);

  const currentAudit = useMemo(() => {
    return selectedAuditId ? auditMap.get(selectedAuditId) : undefined;
  }, [auditMap, selectedAuditId]);

  const currentAuditItems = useMemo(() => {
    if (!currentAudit) return [];
    const items = auditItemsByAuditIdMap.get(currentAudit.id) || [];
    if (!auditItemSearch) return items;
    const matcher = createHangulMatcher(auditItemSearch);
    return items.filter(item => matcher.test(item.modelName));
  }, [currentAudit, auditItemsByAuditIdMap, auditItemSearch]);

  // --- 정렬용 Enriched Data ---
  const enrichedStock = useMemo(() => {
    const matcher = stockSearch ? createHangulMatcher(stockSearch) : null;
    return backcalculatedConsumables.filter(c => {
      if (!c.isReceivedAsOfTarget) return false;
      if (handlingFilter === 'HANDLED' && c.isHandled === false) return false;
      if (handlingFilter === 'UNHANDLED' && c.isHandled !== false) return false;
      const b = c.manufacturer || c.brand || '';
      if (brandFilter !== 'ALL' && b !== brandFilter) return false;
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (selectedAgingBucket !== 'ALL' && c.calcAgingBucket !== selectedAgingBucket) return false;
      return !matcher || matcher.testAny([c.modelName, c.skuCode || '', c.category || '', c.compatibleModels || '', c.supplier, b]);
    }).map(c => {
      const totalVehicleQty = vehicleQtyByConsumableMap.get(c.id) || 0;
      const grandQty = (c.calcStockQty || 0) + totalVehicleQty;
      const hqValue = c.calcStockBalanceAmount ?? ((c.calcStockQty || 0) * (c.unitPrice || 0));
      return { ...c, stockQty: c.calcStockQty, totalVehicleQty, grandQty, hqValue };
    });
  }, [backcalculatedConsumables, handlingFilter, brandFilter, categoryFilter, selectedAgingBucket, stockSearch, vehicleQtyByConsumableMap]);

  const { items: sortedStock, requestSort: requestSortStock, sortConfig: sortConfigStock } = useSortableData(enrichedStock);

  const enrichedVehicleStock = useMemo(() => {
    const matcher = vehicleStockSearch ? createHangulMatcher(vehicleStockSearch) : null;
    return (mechanicConsumableStocks || []).filter(ms => {
      if (ms.stockQty <= 0) return false;
      const matchMech = selectedMechanicFilter === 'ALL' || ms.mechanicId === selectedMechanicFilter;
      const item = consumableMap.get(ms.consumableId);
      const matchSearch = !matcher || (item && matcher.test(item.modelName));
      return matchMech && matchSearch;
    }).map(ms => {
      const item = consumableMap.get(ms.consumableId);
      const mechanic = mechanicMap.get(ms.mechanicId) || userMap.get(ms.mechanicId);
      const msValue = (ms.stockQty || 0) * (item?.unitPrice || 0);
      return { ...ms, item, mechanic, msValue };
    });
  }, [mechanicConsumableStocks, selectedMechanicFilter, vehicleStockSearch, consumableMap, mechanicMap, userMap]);

  const { items: sortedVehicleStock, requestSort: requestSortVehicle, sortConfig: sortConfigVehicle } = useSortableData(enrichedVehicleStock);

  const enrichedCollectedParts = useMemo(() => {
    const matcher = partSearch ? createHangulMatcher(partSearch) : null;
    return collectedParts.filter(p => {
      const matchDisp = partDispositionFilter === 'ALL' || p.disposition === partDispositionFilter;
      const matchStatus = partStatusFilter === 'ALL' || p.status === partStatusFilter;
      const matchSearch = !matcher || matcher.testAny([p.modelName, p.partNo]);
      return matchDisp && matchStatus && matchSearch;
    }).map(p => {
      return { ...p, quantity: p.quantity }; // Ensure quantity maps for sorting
    });
  }, [collectedParts, partDispositionFilter, partStatusFilter, partSearch]);

  const { items: sortedCollectedParts, requestSort: requestSortParts, sortConfig: sortConfigParts } = useSortableData(enrichedCollectedParts);

  // --- 엑셀 다운로드 핸들러 ---
  const handleExportStock = () => {
    const excelData = sortedStock.map((c, idx) => {
      const totalVehicleQty = c.totalVehicleQty || 0;
      const hqVal = c.hqValue || 0;
      const vehVal = totalVehicleQty * (c.unitPrice || 0);
      const rowObj: Record<string, any> = {
        '순번': idx + 1,
        '기준년월': targetYm.replace('-', '.'),
        '최초입고일': c.inboundDate || '2026-04-01',
        '입고연월': c.inboundYm || '2026-04',
        '경과월수': c.calcAgingBucket,
        '품번': c.skuCode || c.id,
        '부품 품목명': c.modelName,
        '제품종류': c.category || '-',
        '호환모델': c.compatibleModels || c.applicableModels || '-',
        '공급업체': c.brand || c.supplier || '-',
        '주기장 재고': c.stockQty,
        '차량 이동 재고': totalVehicleQty,
        '전사 총 재고': c.stockQty + totalVehicleQty,
        '단위': c.unit || '개',
        '단가': c.unitPrice || 0,
        '주기장 재고잔액': hqVal,
        '차량 재고평가액': vehVal,
        '총 재고잔액': hqVal + vehVal
      };
      for (let m = 0; m < 24; m++) {
        rowObj[`${m}개월금액`] = c.calcAgingBucket === m ? hqVal : 0;
      }
      rowObj['24개월이상금액'] = c.calcAgingBucket === 24 ? hqVal : 0;
      rowObj['시리얼번호'] = c.serialNo || '';
      return rowObj;
    });

    exportToExcel(excelData, `무진글로벌_부품재고대장_경과월역산_${targetYm}`, '주기장재고');
  };

  const handleExportVehicleStock = () => {
    const excelData = (mechanicConsumableStocks || []).map((ms, idx) => {
      const item = consumableMap.get(ms.consumableId);
      const mechanic = userMap.get(ms.mechanicId);
      return {
        '순번': idx + 1,
        '담당 정비사': mechanic?.name || '정비사',
        '자재 품목명': item?.modelName || '-',
        '차량 적재 수량': ms.stockQty,
        '단위': item?.unit || '개',
        '단가': `${(item?.unitPrice || 0).toLocaleString()}원`,
        '평가액': `${(ms.stockQty * (item?.unitPrice || 0)).toLocaleString()}원`,
        '최종 변경일': ms.updatedAt
      };
    });

    exportToExcel(excelData, `소모품_차량재고대장_${new Date().toISOString().split('T')[0]}`, '차량재고');
  };

  // --- 소모품 마스터 CUD 및 취급여부 토글 핸들러 ---
  const openCreateMaster = () => {
    setMasterEditingId(null);
    setMasterSkuCode(`CSM-${Date.now().toString().slice(-6)}`);
    setMasterModelName('');
    setMasterCategory('윤활유·오일류');
    setMasterBrand('SK루브리컨츠');
    setMasterSpec('');
    setMasterUnit('통');
    setMasterUnitPrice(0);
    setMasterSalePrice(0);
    setMasterSupplier('평택항만윤활유상사');
    setMasterIsHandled(true);
    setMasterInitialStockQty(0);
    setShowMasterModal(true);
  };

  const openEditMaster = (item: Consumable) => {
    setMasterEditingId(item.id);
    setMasterSkuCode(item.skuCode || item.id);
    setMasterModelName(item.modelName);
    setMasterCategory(item.category || '윤활유·오일류');
    setMasterBrand(item.manufacturer || item.brand || 'SK루브리컨츠');
    setMasterSpec(item.spec || '');
    setMasterUnit(item.unit || '통');
    setMasterUnitPrice(item.unitPrice || 0);
    setMasterSalePrice(item.saleUnitPrice || 0);
    setMasterSupplier(item.supplier || '');
    setMasterIsHandled(item.isHandled !== false);
    setMasterInitialStockQty(item.stockQty || 0);
    setShowMasterModal(true);
  };

  const handleToggleConsumableHandled = async (item: Consumable) => {
    const nextHandled = item.isHandled === false ? true : false;
    try {
      await updateConsumable(item.id, {
        isHandled: nextHandled
      });
      await db.awaitPendingWrites();
      showToast(`소모품 마스터 [${item.modelName}] 취급여부가 [${nextHandled ? '취급' : '미취급'}]으로 변경되었습니다.`);
    } catch (err: any) {
      showErrorModal(`소모품 취급여부 변경 실패:\n${err?.message || err}`);
    }
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterModelName.trim()) {
      showToast('소모품명을 입력해 주세요.', 'error');
      return;
    }
    try {
      if (masterEditingId) {
        await updateConsumable(masterEditingId, {
          skuCode: masterSkuCode.trim() || undefined,
          modelName: masterModelName.trim(),
          name: masterModelName.trim(),
          partName: masterModelName.trim(),
          category: masterCategory,
          brand: masterBrand.trim() || '공통',
          manufacturer: masterBrand.trim() || '공통',
          spec: masterSpec.trim(),
          unit: masterUnit.trim() || '통',
          unitPrice: masterUnitPrice,
          saleUnitPrice: masterSalePrice || Math.round(masterUnitPrice * 1.35),
          supplier: masterSupplier.trim(),
          isHandled: masterIsHandled
        });
        await db.awaitPendingWrites();
        showToast('소모품 마스터 정보가 수정되었습니다.');
      } else {
        await addConsumable({
          skuCode: masterSkuCode.trim() || `CSM-${Date.now().toString().slice(-6)}`,
          modelName: masterModelName.trim(),
          name: masterModelName.trim(),
          partName: masterModelName.trim(),
          category: masterCategory,
          brand: masterBrand.trim() || '공통',
          manufacturer: masterBrand.trim() || '공통',
          spec: masterSpec.trim(),
          unit: masterUnit.trim() || '통',
          unitPrice: masterUnitPrice,
          saleUnitPrice: masterSalePrice || Math.round(masterUnitPrice * 1.35),
          supplier: masterSupplier.trim(),
          isHandled: masterIsHandled,
          stockQty: masterIsHandled ? masterInitialStockQty : 0
        } as any);
        await db.awaitPendingWrites();
        showToast('신규 소모품 마스터가 등록되었습니다.');
      }
      setShowMasterModal(false);
    } catch (err: any) {
      showErrorModal(`소모품 마스터 저장 실패:\n${err?.message || err}`);
    }
  };

  const handleDeleteMaster = async (id: string, modelName: string) => {
    if (!window.confirm(`[${modelName}] 품목을 정말 삭제하시겠습니까?`)) return;
    try {
      await deleteConsumable(id);
      showToast(`[${modelName}] 품목이 삭제되었습니다.`);
    } catch (err: any) {
      showErrorModal(`품목 삭제 실패:\n${err?.message || err}`);
    }
  };

  // --- 주기장  차량 불출 핸들러 ---
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMechanicId || !transferConsumableId || transferQty <= 0) {
      showToast('정비사와 소모품 품목, 불출 수량을 선택해 주세요.', 'error');
      return;
    }
    const targetItem = consumables.find(c => c.id === transferConsumableId);
    if (!targetItem) return;
    if (transferQty > targetItem.stockQty) {
      showErrorModal(`불출 요청 수량(${transferQty}개)이 주기장 가용 재고(${targetItem.stockQty}개)를 초과할 수 없습니다.`);
      return;
    }

    try {
      await transferConsumableToMechanic(transferMechanicId, transferConsumableId, transferQty, transferMemo);
      await db.awaitPendingWrites();
      showToast('주기장에서 정비사 차량으로 소모품 불출 이동이 완료되었습니다.');
      setShowTransferModal(false);
      setTransferQty(1);
      setTransferMemo('');
    } catch (err: any) {
      showErrorModal(err?.message || '소모품 불출 이동 중 오류가 발생했습니다.');
    }
  };

  // --- 차량  주기장 반납 핸들러 ---
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnMechanicId || !returnConsumableId || returnQty <= 0) {
      showToast('정비사와 반납 소모품 품목, 반납 수량을 선택해 주세요.', 'error');
      return;
    }
    const currentVehicleStock = (mechanicConsumableStocks || []).find(
      ms => ms.mechanicId === returnMechanicId && ms.consumableId === returnConsumableId
    )?.stockQty || 0;

    if (returnQty > currentVehicleStock) {
      showErrorModal(`반납 요청 수량(${returnQty}개)이 정비사 차량 보유 재고(${currentVehicleStock}개)를 초과할 수 없습니다.`);
      return;
    }

    try {
      await returnConsumableToHq(returnMechanicId, returnConsumableId, returnQty, returnMemo, isReturnDefective, returnDisposition);
      await db.awaitPendingWrites();
      showToast(isReturnDefective 
        ? `수거 고품(${returnDisposition === 'REBUILD' ? '재생' : returnDisposition === 'SCRAP' ? '폐기' : '무상보증'}) 반납 격리 처리가 완료되었습니다.`
        : '정비사 차량에서 주기장으로 정상 소모품 반납이 완료되었습니다.');
      setShowReturnModal(false);
      setReturnQty(1);
      setReturnMemo('');
      setIsReturnDefective(false);
      setReturnDisposition('REBUILD');
    } catch (err: any) {
      showErrorModal(err?.message || '소모품 반납 중 오류가 발생했습니다.');
    }
  };

  // --- 차량 간 이동 핸들러 ---
  const handleP2PSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p2pFromMechanicId || !p2pToMechanicId || !p2pConsumableId || p2pQty <= 0) {
      showToast('양도/양수 정비사 및 소모품, 수량을 올바르게 지정해 주세요.', 'error');
      return;
    }
    if (p2pFromMechanicId === p2pToMechanicId) {
      showToast('동일한 정비사 간에는 이동할 수 없습니다.', 'error');
      return;
    }
    const fromStock = (mechanicConsumableStocks || []).find(
      ms => ms.mechanicId === p2pFromMechanicId && ms.consumableId === p2pConsumableId
    )?.stockQty || 0;

    if (p2pQty > fromStock) {
      showErrorModal(`양도 정비사 차량의 보유 재고(${fromStock}개)를 초과할 수 없습니다.`);
      return;
    }

    try {
      await transferConsumableBetweenMechanics(p2pFromMechanicId, p2pToMechanicId, p2pConsumableId, p2pQty, p2pMemo);
      await db.awaitPendingWrites();
      showToast('정비사 차량 간 소모품 이동이 완료되었습니다.');
      setShowP2PModal(false);
      setP2pQty(1);
      setP2pMemo('');
    } catch (err: any) {
      showErrorModal(err?.message || '차량 간 소모품 이동 중 오류가 발생했습니다.');
    }
  };

  // --- 신규 실사 전표 생성 핸들러 ---
  const handleCreateAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (newAuditTargetType === 'VEHICLE' && !newAuditMechanicId) {
      showToast('차량 실사의 경우 담당 정비사를 선택해 주세요.', 'error');
      return;
    }

    try {
      const newAudit = await createStocktakingAudit(
        newAuditTargetType, 
        newAuditTargetType === 'VEHICLE' ? newAuditMechanicId : undefined, 
        newAuditMemo
      );
      await db.awaitPendingWrites();
      showToast(`재고실사 전표(${newAudit.auditNo})가 성공적으로 생성되었습니다.`);
      setSelectedAuditId(newAudit.id);
      setShowCreateAuditModal(false);
      setNewAuditMemo('');
    } catch (err: any) {
      showErrorModal(`실사 전표 생성 실패:\n${err?.message || err}`);
    }
  };

  // --- 실사 품목 수량 인라인 수정 핸들러 ---
  const handleAuditItemQtyChange = async (itemId: string, newActualQty: number, diffReason?: StocktakingAuditItem['diffReason'], note?: string) => {
    if (!selectedAuditId) return;
    try {
      await updateStocktakingItem(selectedAuditId, itemId, newActualQty, diffReason, note);
    } catch (err: any) {
      showToast(err?.message || '수량 반영 실패', 'error');
    }
  };

  // --- 실사 확정 핸들러 ---
  const handleConfirmAudit = async (auditId: string) => {
    if (!canSave) return;
    try {
      await confirmStocktakingAudit(auditId);
      await db.awaitPendingWrites();
      showToast('재고 실사가 최종 확정되어 전산 재고가 강제 보정되었습니다.');
    } catch (err: any) {
      showErrorModal(`실사 확정 실패:\n${err?.message || err}`);
    }
  };

  // --- 실사 취소 핸들러 ---
  const handleCancelAudit = async (auditId: string) => {
    if (!canSave) return;
    try {
      await cancelStocktakingAudit(auditId);
      await db.awaitPendingWrites();
      showToast('실사 전표가 취소되었습니다.');
    } catch (err: any) {
      showErrorModal(`실사 취소 실패:\n${err?.message || err}`);
    }
  };

  // --- 수거 고품 처리 상태 변경 핸들러 ---
  const handleProcessCollectedPart = async (partId: string, actionStatus: 'IN_PROCESS' | 'COMPLETED', actionMemo?: string) => {
    if (!canSave) return;
    try {
      await processCollectedPart(partId, actionStatus, actionMemo);
      await db.awaitPendingWrites();
      showToast(`고품 상태가 '${actionStatus === 'COMPLETED' ? '완료' : '처리중'}'으로 갱신되었습니다.`);
    } catch (err: any) {
      showErrorModal(`고품 상태 갱신 실패:\n${err?.message || err}`);
    }
  };

  return (
    <div data-hs-observe="consumablestockpage" data-subview="consumable_stock" data-subview-title="Generated" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      {/* ─── 토스트 알림 ─── */}
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '8px',
          backgroundColor: toastMessage.type === 'success' ? '#059669' : '#dc2626',
          color: '#ffffff', fontWeight: 600, fontSize: '13px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ─── [Z-패턴 1단계: 헤더 & 탭 네비게이션] ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Boxes size={18} color="var(--primary)" />
          <h2 data-mid="consumable_stock-header" style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            소모품 재고 및 소모품 마스터 관리
          </h2>
          <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, backgroundColor: 'rgba(15, 118, 110, 0.14)', color: '#0f766e', border: '1px solid rgba(15, 118, 110, 0.35)', whiteSpace: 'nowrap' }}>
            사용 시 소멸 물품 · 윤활유 · 구리스 · 장갑 · 방청제 · 세척제
          </span>
        </div>

        {/* 탭 버튼군 (무수식어 건조 표준) */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={activeTab === 'STOCK' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('STOCK')}
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Boxes size={14} /> 주기장 소모품 재고
          </button>
          <button
            type="button"
            className={activeTab === 'MASTER' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('MASTER')}
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <ShieldCheck size={14} /> 소모품 마스터 · 취급여부
          </button>
          <button
            type="button"
            className={activeTab === 'VEHICLE_STOCK' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('VEHICLE_STOCK')}
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Truck size={14} /> 차량 적재 소모품
          </button>
          <button
            type="button"
            className={activeTab === 'COLLECTED_PARTS' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('COLLECTED_PARTS')}
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Archive size={14} /> 폐용기 · 회수품 관리
            {collectedPartsSummary.uncompletedCount > 0 && (
              <span style={{
                backgroundColor: '#7c3aed', color: '#fff', fontSize: '11px',
                padding: '1px 6px', borderRadius: '10px', fontWeight: 700
              }}>
                {collectedPartsSummary.uncompletedCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={activeTab === 'STOCKTAKING' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('STOCKTAKING')}
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <CheckSquare size={14} /> 소모품 재고 실사
            {draftAuditsCount > 0 && (
              <span style={{
                backgroundColor: 'var(--warning)', color: '#fff', fontSize: '11px',
                padding: '1px 6px', borderRadius: '10px', fontWeight: 700
              }}>
                {draftAuditsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* [TAB: 소모품 마스터 · 제조사별 조회 · 등록 · 취급여부 결정] */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'MASTER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card" style={{ margin: 0, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  소모품 마스터 · 품목분류 및 제조사 기준 조회 · 취급여부 결정
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setMasterHandlingFilter('ALL')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: masterHandlingFilter === 'ALL' ? '2px solid #0f766e' : '1px solid var(--border-color)',
                      backgroundColor: masterHandlingFilter === 'ALL' ? '#f0fdf4' : 'var(--bg-app)',
                      color: masterHandlingFilter === 'ALL' ? '#0f766e' : 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    전체 소모품 마스터 {consumableMasterStats.total}종
                  </button>
                  <button
                    type="button"
                    onClick={() => setMasterHandlingFilter('HANDLED')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: masterHandlingFilter === 'HANDLED' ? '2px solid #16a34a' : '1px solid var(--border-color)',
                      backgroundColor: masterHandlingFilter === 'HANDLED' ? '#dcfce7' : '#ffffff',
                      color: '#166534',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    취급 소모품 {consumableMasterStats.handled}종
                  </button>
                  <button
                    type="button"
                    onClick={() => setMasterHandlingFilter('UNHANDLED')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: masterHandlingFilter === 'UNHANDLED' ? '2px solid #64748b' : '1px solid var(--border-color)',
                      backgroundColor: masterHandlingFilter === 'UNHANDLED' ? '#f1f5f9' : '#ffffff',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    미취급 소모품 {consumableMasterStats.unhandled}종
                  </button>
                </div>
              </div>

              {canSave && (
                <button
                  type="button"
                  className="btn-save"
                  onClick={openCreateMaster}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Plus size={13} /> 소모품 마스터 신규 등록
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>소모품 분류</label>
                <select
                  value={masterCategoryFilter}
                  onChange={e => setMasterCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 소모품 분류</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사 · 브랜드</label>
                <select
                  value={masterBrandFilter}
                  onChange={e => setMasterBrandFilter(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 제조사</option>
                  {brandOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>취급여부 필터</label>
                <select
                  value={masterHandlingFilter}
                  onChange={e => setMasterHandlingFilter(e.target.value as any)}
                  style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 · 취급 및 미취급</option>
                  <option value="HANDLED">취급 소모품만</option>
                  <option value="UNHANDLED">미취급 소모품만</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>소모품명 · 규격 · 제조사 검색</label>
                <input
                  type="text"
                  value={masterSearchTerm}
                  onChange={e => setMasterSearchTerm(e.target.value)}
                  placeholder="윤활유, 구리스, 장갑, 방청제, 품번 검색"
                  style={{ padding: '6px 10px', fontSize: '12.5px', width: '250px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>취급여부 결정</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>순번</th>
                    <th style={{ whiteSpace: 'nowrap' }}>품번</th>
                    <th style={{ whiteSpace: 'nowrap' }}>소모품 분류</th>
                    <th style={{ whiteSpace: 'nowrap' }}>제조사 · 브랜드</th>
                    <th style={{ whiteSpace: 'nowrap' }}>소모품명</th>
                    <th style={{ whiteSpace: 'nowrap' }}>포장 규격 · 용량</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>단위</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>기준 매입단가</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>기준 판매단가</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>현재고</th>
                    <th style={{ whiteSpace: 'nowrap' }}>주요 공급처</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMasterConsumables.map((c, idx) => {
                    const isHandled = c.isHandled !== false;
                    return (
                      <tr
                        key={c.id}
                        style={{
                          backgroundColor: isHandled ? 'transparent' : 'rgba(241, 245, 249, 0.65)'
                        }}
                      >
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleConsumableHandled(c)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: isHandled ? '1px solid #16a34a' : '1px solid #94a3b8',
                              backgroundColor: isHandled ? '#dcfce7' : '#f1f5f9',
                              color: isHandled ? '#166534' : '#475569',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isHandled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            <span>{isHandled ? '취급' : '미취급'}</span>
                          </button>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{idx + 1}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap' }}>{c.skuCode || c.id}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ccfbf1', color: '#0f766e' }}>
                            {c.category || '윤활유·오일류'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>{c.manufacturer || c.brand || '-'}</td>
                        <td style={{ fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{c.modelName}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.spec || c.compatibleModels || '-'}</td>
                        <td style={{ textAlign: 'center', fontSize: '12px', whiteSpace: 'nowrap' }}>{c.unit || '통'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>₩{(c.unitPrice || 0).toLocaleString('ko-KR')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0284c7', whiteSpace: 'nowrap' }}>
                          ₩{(c.saleUnitPrice || Math.round((c.unitPrice || 0) * 1.35)).toLocaleString('ko-KR')}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: (c.stockQty || 0) > 0 ? '#059669' : '#64748b', whiteSpace: 'nowrap' }}>
                          {(c.stockQty || 0).toLocaleString('ko-KR')}{c.unit || '개'}
                        </td>
                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{c.supplier || '-'}</td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {canSave && (
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => openEditMaster(c)}
                                style={{ padding: '2px 6px', fontSize: '11px' }}
                              >
                                <Edit size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleDeleteMaster(c.id, c.modelName)}
                                style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--danger)' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-app)', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                소모품 마스터 조회 결과 {filteredMasterConsumables.length.toLocaleString('ko-KR')}종
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                <span>전체 마스터: <strong>{consumableMasterStats.total}종</strong></span>
                <span>취급 소모품: <strong style={{ color: '#166534' }}>{consumableMasterStats.handled}종</strong></span>
                <span>미취급 소모품: <strong style={{ color: '#64748b' }}>{consumableMasterStats.unhandled}종</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* [TAB 1] 주기장 재고 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'STOCK' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 입고연월 기준 1개월 단위 경과월수별 재고잔량 · 재고잔액 역산 매트릭스 바 */}
          <div className="card" style={{ margin: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  입고연월 기준 1개월 단위 경과별 재고잔량 · 재고잔액 재집계
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-app)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => shiftTargetYm(-1)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
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
                    onClick={() => shiftTargetYm(1)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
                  >
                    1개월 후 <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetYm('2026-04');
                      setSelectedAgingBucket('ALL');
                    }}
                    className="btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    기준월 2026-04 복원
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>경과월 구간:</span>
                  <select
                    value={selectedAgingBucket}
                    onChange={e => setSelectedAgingBucket(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 경과월 구간</option>
                    {agingBucketsSummary.buckets.map(b => (
                      <option key={b.bucket} value={b.bucket}>{b.label} 경과 ({b.itemCount}종)</option>
                    ))}
                  </select>
                </div>
                {selectedAgingBucket !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgingBucket('ALL')}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    경과월 필터 해제
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 검색 및 액션 바 */}
          <div className="card" style={{ margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>소모품 분류</label>
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '4px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 소모품 분류</option>
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사 · 브랜드</label>
                  <select
                    value={brandFilter}
                    onChange={e => setBrandFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '4px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 제조사</option>
                    {brandOptions.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>마스터 취급여부</label>
                  <select
                    value={handlingFilter}
                    onChange={e => setHandlingFilter(e.target.value as any)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', borderRadius: '4px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
                  >
                    <option value="HANDLED">취급 소모품만</option>
                    <option value="ALL">전체 · 미취급 포함</option>
                    <option value="UNHANDLED">미취급 소모품만</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>품번 · 소모품명 · 공급처 검색</label>
                  <input
                    type="text"
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    placeholder="윤활유, 구리스, 장갑, 방청제, 공급처 검색"
                    style={{ padding: '6px 10px', fontSize: '12.5px', width: '240px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveTab('MASTER')}
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  소모품 마스터 · 취급여부 결정
                </button>
                {canSave && (
                  <button data-hs-trigger="Register"
                    type="button"
                    className="btn-save"
                    onClick={openCreateMaster}
                  >
                    <Plus size={13} /> 소모품 마스터 등록
                  </button>
                )}
                <button
                  type="button"
                  className="btn-excel-download"
                  onClick={handleExportStock}
                >
                  <Download size={13} /> 경과월 재고잔액 엑셀
                </button>
              </div>
            </div>
          </div>

          {/* 소모품 재고 목록 테이블 */}
          <div className="card" style={{ margin: 0 }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>순번</th>
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>취급여부</th>
                    <SortableTh label="품번" sortKey="skuCode" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <SortableTh label="소모품명" sortKey="modelName" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <SortableTh label="소모품 분류" sortKey="category" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <SortableTh label="최초입고일" sortKey="inboundDate" currentSort={sortConfigStock} onSort={requestSortStock} align="center" />
                    <SortableTh label="경과월수" sortKey="calcAgingBucket" currentSort={sortConfigStock} onSort={requestSortStock} align="center" />
                    <th style={{ textAlign: 'center', color: '#0284c7', whiteSpace: 'nowrap' }}>유통 판매용 재고</th>
                    <th style={{ textAlign: 'center', color: '#b45309', whiteSpace: 'nowrap' }}>렌탈자산 정비용 재고</th>
                    <SortableTh label="주기장 재고수량" sortKey="stockQty" currentSort={sortConfigStock} onSort={requestSortStock} align="center" />
                    <SortableTh label="차량 재고" sortKey="totalVehicleQty" currentSort={sortConfigStock} onSort={requestSortStock} align="center" />
                    <SortableTh label="전사 총수량" sortKey="grandQty" currentSort={sortConfigStock} onSort={requestSortStock} align="center" />
                    <SortableTh label="매입단가 / 판매단가" sortKey="unitPrice" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <SortableTh label="재고잔액" sortKey="hqValue" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <SortableTh label="공급처" sortKey="supplier" currentSort={sortConfigStock} onSort={requestSortStock} />
                    <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = sortedStock;

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={16} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                            조회 조건에 해당하는 소모품이 없습니다.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((c, idx) => {
                      const totalVehicleQty = c.totalVehicleQty;
                      const grandQty = c.grandQty;
                      const hqValue = c.hqValue;
                      const saleStock = c.calcSaleStockQty ?? c.saleStockQty ?? 0;
                      const repairStock = c.calcRepairStockQty ?? c.repairStockQty ?? 0;
                      const agingLabel = c.calcAgingBucket === 24 ? '24개월이상' : `${c.calcAgingBucket}개월`;
                      const isHandled = c.isHandled !== false;

                      return (
                        <tr key={c.id}>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{idx + 1}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: isHandled ? '#dcfce7' : '#f1f5f9',
                                color: isHandled ? '#166534' : '#64748b'
                              }}
                            >
                              {isHandled ? '취급' : '미취급'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap' }}>{c.skuCode || c.id}</td>
                          <td style={{ whiteSpace: 'nowrap' }}><strong style={{ color: 'var(--primary)' }}>{c.modelName}</strong></td>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ccfbf1', color: '#0f766e' }}>
                              {c.category || '윤활유·오일류'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {c.inboundDate || '2026-04-01'}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: c.calcAgingBucket >= 12 ? '#fef3c7' : '#dcfce7',
                                color: c.calcAgingBucket >= 12 ? '#b45309' : '#166534'
                              }}
                            >
                              {agingLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#0284c7', whiteSpace: 'nowrap' }}>
                            {saleStock}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
                            {repairStock}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: c.stockQty > 0 ? '#059669' : '#dc2626', whiteSpace: 'nowrap' }}>
                            {c.stockQty}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{totalVehicleQty}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{grandQty}</td>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {(c.unitPrice || 0).toLocaleString()}원
                            {c.saleUnitPrice ? <span style={{ color: '#0284c7', marginLeft: '6px', fontWeight: 700 }}>/ 판매 {c.saleUnitPrice.toLocaleString()}원</span> : null}
                          </td>
                          <td style={{ fontWeight: 800, color: '#7c3aed', whiteSpace: 'nowrap' }}>₩{hqValue.toLocaleString()}</td>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{c.supplier || '-'}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {canSave && (
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => openEditMaster(c)}
                                  style={{ padding: '2px 6px', fontSize: '11px' }}
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => handleDeleteMaster(c.id, c.modelName)}
                                  style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--danger)' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* [TAB 2] 차량 재고 (AS 정비사 차량 적재 이동재고) */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'VEHICLE_STOCK' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 상단 액션 바: 3대 이동 모달 호출 버튼군 */}
          <div className="card" style={{ margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <select
                  value={selectedMechanicFilter}
                  onChange={e => setSelectedMechanicFilter(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                >
                  <option value="ALL">전체 정비사 차량</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>{m.name} 차량</option>
                  ))}
                </select>

                <input
                  type="text"
                  value={vehicleStockSearch}
                  onChange={e => setVehicleStockSearch(e.target.value)}
                  placeholder="품목명 검색..."
                  style={{ padding: '6px 10px', fontSize: '12px', width: '160px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {canSave && (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setTransferMechanicId(mechanics[0]?.id || '');
                        setTransferConsumableId(consumables[0]?.id || '');
                        setTransferQty(1);
                        setShowTransferModal(true);
                      }}
                      style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ArrowUpRight size={14} /> 주기장 차량 불출
 </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setReturnMechanicId(mechanics[0]?.id || '');
                        setReturnConsumableId(consumables[0]?.id || '');
                        setReturnQty(1);
                        setShowReturnModal(true);
                      }}
                      style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ArrowDownLeft size={14} /> 차량 주기장 반납
 </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setP2pFromMechanicId(mechanics[0]?.id || '');
                        setP2pToMechanicId(mechanics[1]?.id || mechanics[0]?.id || '');
                        setP2pConsumableId(consumables[0]?.id || '');
                        setP2pQty(1);
                        setShowP2PModal(true);
                      }}
                      style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ArrowRightLeft size={14} /> 차량 간 이동
 </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn-excel-download"
                  onClick={handleExportVehicleStock}
                >
                  <Download size={13} /> 차량 재고 엑셀
 </button>
              </div>
            </div>
          </div>

          {/* 차량 이동재고 테이블 */}
          <div className="card" style={{ margin: 0 }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <SortableTh label="담당 정비사" sortKey="mechanic.name" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <SortableTh label="품목명" sortKey="item.modelName" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <SortableTh label="차량 적재수량" sortKey="stockQty" currentSort={sortConfigVehicle} onSort={requestSortVehicle} align="center" />
                    <SortableTh label="단위" sortKey="item.unit" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <SortableTh label="단가" sortKey="item.unitPrice" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <SortableTh label="평가 금액" sortKey="msValue" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <SortableTh label="최종 갱신일" sortKey="updatedAt" currentSort={sortConfigVehicle} onSort={requestSortVehicle} />
                    <th style={{ textAlign: 'center' }}>인라인 조치</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filteredList = sortedVehicleStock;

                    if (filteredList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                            차량에 적재된 이동 재고 내역이 없습니다.
 </td>
                        </tr>
                      );
                    }

                    return filteredList.map(ms => {
                      const item = ms.item;
                      const mech = ms.mechanic;
                      const unitPrice = item?.unitPrice || 0;

                      return (
                        <tr key={ms.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                              <Truck size={13} style={{ color: 'var(--primary)' }} /> {mech?.name || '정비사'}
                            </div>
                          </td>
                          <td><strong style={{ color: 'var(--primary)' }}>{item?.modelName || '-'}</strong></td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--success)' }}>
                            {ms.stockQty}
                          </td>
                          <td style={{ fontSize: '12px' }}>{item?.unit || '개'}</td>
                          <td style={{ fontSize: '12px' }}>{unitPrice.toLocaleString()}원</td>
                          <td style={{ fontWeight: 600 }}>{(ms.stockQty * unitPrice).toLocaleString()}원</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ms.updatedAt}</td>
                          <td style={{ textAlign: 'center' }}>
                            {canSave && (
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setTransferMechanicId(ms.mechanicId);
                                    setTransferConsumableId(ms.consumableId);
                                    setShowTransferModal(true);
                                  }}
                                  style={{ padding: '2px 6px', fontSize: '11px' }}
                                >
                                  추가불출
 </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setReturnMechanicId(ms.mechanicId);
                                    setReturnConsumableId(ms.consumableId);
                                    setReturnQty(Math.min(ms.stockQty, 1));
                                    setShowReturnModal(true);
                                  }}
                                  style={{ padding: '2px 6px', fontSize: '11px' }}
                                >
                                  주기장반납
 </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* [TAB 3] 고품 관리 (폐부품/교체부품 격리 및 사후처리) */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'COLLECTED_PARTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 필터 바 */}
          <div className="card" style={{ margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={partDispositionFilter}
                  onChange={e => setPartDispositionFilter(e.target.value as any)}
                  style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                >
                  <option value="ALL">전체 처분구분</option>
                  <option value="REBUILD">재생 대상</option>
                  <option value="SCRAP">폐기/고철</option>
                  <option value="VENDOR_WARRANTY">제조사 무상보증</option>
                </select>

                <select
                  value={partStatusFilter}
                  onChange={e => setPartStatusFilter(e.target.value as any)}
                  style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                >
                  <option value="ALL">전체 처리상태</option>
                  <option value="RECEIVED">수거 접수</option>
                  <option value="IN_PROCESS">처리 진행중</option>
                  <option value="COMPLETED">조치 완료</option>
                </select>

                <input
                  type="text"
                  value={partSearch}
                  onChange={e => setPartSearch(e.target.value)}
                  placeholder="부품명, 관리번호 검색..."
                  style={{ padding: '6px 10px', fontSize: '12px', width: '160px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>
          </div>

          {/* 고품 목록 테이블 */}
          <div className="card" style={{ margin: 0 }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <SortableTh label="고품 번호" sortKey="partNo" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <SortableTh label="부품 품목명" sortKey="modelName" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <SortableTh label="수량" sortKey="quantity" currentSort={sortConfigParts} onSort={requestSortParts} align="center" />
                    <SortableTh label="수거 정비사" sortKey="mechanicName" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <SortableTh label="처분 구분" sortKey="disposition" currentSort={sortConfigParts} onSort={requestSortParts} align="center" />
                    <SortableTh label="처리 상태" sortKey="status" currentSort={sortConfigParts} onSort={requestSortParts} align="center" />
                    <SortableTh label="수거 일자" sortKey="receivedDate" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <SortableTh label="조치 일자" sortKey="actionDate" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <SortableTh label="조치 메모" sortKey="actionMemo" currentSort={sortConfigParts} onSort={requestSortParts} />
                    <th style={{ textAlign: 'center' }}>조치 액션</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = sortedCollectedParts;

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                            수거된 고품 내역이 없습니다. (차량 반납 시 '고품' 체크 시 자동 등록됩니다)
 </td>
                        </tr>
                      );
                    }

                    return filtered.map(p => {
                      const dispLabel = p.disposition === 'REBUILD' ? '재생 대상' : (p.disposition === 'SCRAP' ? '폐기/고철' : '제조사 보증');
                      const dispColor = p.disposition === 'REBUILD' ? '#7c3aed' : (p.disposition === 'SCRAP' ? '#ea580c' : '#2563eb');
                      const dispBg = p.disposition === 'REBUILD' ? 'rgba(124, 58, 237, 0.1)' : (p.disposition === 'SCRAP' ? 'rgba(234, 88, 12, 0.1)' : 'rgba(37, 99, 235, 0.1)');

                      const statusLabel = p.status === 'COMPLETED' ? '조치 완료' : (p.status === 'IN_PROCESS' ? '처리중' : '수거 접수');
                      const statusColor = p.status === 'COMPLETED' ? '#059669' : (p.status === 'IN_PROCESS' ? '#2563eb' : '#d97706');

                      return (
                        <tr key={p.id}>
                          <td><strong>{p.partNo}</strong></td>
                          <td><strong style={{ color: 'var(--primary)' }}>{p.modelName}</strong></td>
                          <td style={{ textAlign: 'center', fontWeight: 800 }}>{p.quantity}개</td>
                          <td>{p.mechanicName}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', color: dispColor, backgroundColor: dispBg }}>
                              {dispLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: statusColor }}>
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px' }}>{p.receivedDate}</td>
                          <td style={{ fontSize: '12px' }}>{p.actionDate || '-'}</td>
                          <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{p.actionMemo || p.memo || '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {canSave && p.status !== 'COMPLETED' && (
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                {p.status === 'RECEIVED' && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleProcessCollectedPart(p.id, 'IN_PROCESS', '재생/외주 정비 또는 폐기 착수')}
                                    style={{ padding: '2px 6px', fontSize: '11px' }}
                                  >
                                    착수
 </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => handleProcessCollectedPart(p.id, 'COMPLETED', `${dispLabel} 최종 조치 완료`)}
                                  style={{ padding: '2px 8px', fontSize: '11px' }}
                                >
                                  조치완료
 </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* [TAB 4] 재고 실사 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'STOCKTAKING' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 상단: 실사 전표 스코프 및 필터 바 */}
          <div className="card" style={{ margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>실사 대상 구분</label>
                  <select
                    value={auditTargetFilter}
                    onChange={e => setAuditTargetFilter(e.target.value as any)}
                    style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="ALL">전체 대상</option>
                    <option value="HQ">주기장 창고</option>
                    <option value="VEHICLE">정비 차량</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>실사 상태</label>
                  <select
                    value={auditStatusFilter}
                    onChange={e => setAuditStatusFilter(e.target.value as any)}
                    style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="ALL">전체 상태</option>
                    <option value="DRAFT">작성중</option>
                    <option value="CONFIRMED">실사확정</option>
                    <option value="CANCELLED">취소</option>
                  </select>
                </div>
              </div>

              {canSave && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setNewAuditTargetType('HQ');
                    setNewAuditMechanicId(mechanics[0]?.id || '');
                    setNewAuditMemo('');
                    setShowCreateAuditModal(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', fontSize: '13px' }}
                >
                  <Plus size={14} /> 새 실사 전표 생성
 </button>
              )}
            </div>

            {/* 실사 전표 카드 목록 */}
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                실사 전표 목록 ({stocktakingAudits.length}건)
 </div>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
                {(() => {
                  if (filteredAudits.length === 0) {
                    return (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>
                        조건에 맞는 실사 전표가 없습니다. [새 실사 전표 생성] 버튼을 눌러 실사를 시작하세요.
 </div>
                    );
                  }

                  return filteredAudits.map(a => {
                    const isSelected = selectedAuditId === a.id;
                    const statusColor = a.status === 'CONFIRMED' ? '#059669' : (a.status === 'CANCELLED' ? '#dc2626' : '#d97706');
                    const statusBg = a.status === 'CONFIRMED' ? 'rgba(5, 150, 105, 0.1)' : (a.status === 'CANCELLED' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)');

                    return (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAuditId(a.id)}
                        style={{
                          minWidth: '220px', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-app)',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>{a.auditNo}</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', color: statusColor, backgroundColor: statusBg }}>
                            {a.status === 'CONFIRMED' ? '확정' : a.status === 'CANCELLED' ? '취소' : '작성중'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '4px' }}>
                          {a.targetType === 'HQ' ? '주기장 재고' : `차량: ${a.mechanicName || '정비사'}`}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {a.auditDate} | {(auditItemsByAuditIdMap.get(a.id) || []).length}개 품목
 </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* 선택 전표 상세 대사 스튜디오 */}
          {(() => {
            if (!currentAudit) {
              return (
                <div className="card" style={{ margin: 0, padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  상단에서 실사 전표를 선택하면 전산 재고 vs 실사 수량 대사 작업대가 표시됩니다.
 </div>
              );
            }

            const currentItems = currentAuditItems;
            const isDraft = currentAudit.status === 'DRAFT';

            return (
              <div className="card" style={{ margin: 0 }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileCheck size={16} style={{ color: 'var(--primary)' }} />
                      전표 {currentAudit.auditNo} 실사 검증 대장
 </h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      전산재고 ↔ 실사수량 1:1 인라인 검증 및 차이 사유 확정
 </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={auditItemSearch}
                      onChange={e => setAuditItemSearch(e.target.value)}
                      placeholder="실사 품목 검색..."
                      style={{ padding: '5px 8px', fontSize: '12px', width: '150px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                    />
                    {isDraft && canSave && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleCancelAudit(currentAudit.id)}
                        style={{ padding: '5px 10px', fontSize: '12px', color: 'var(--danger)' }}
                      >
                        전표 취소
 </button>
                    )}
                  </div>
                </div>

                <div className="table-container" style={{ border: 'none', boxShadow: 'none', maxHeight: 'calc(100vh - 420px)', overflowY: 'auto', overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'center' }}>순번</th>
                        <th>품목명</th>
                        <th>단위</th>
                        <th style={{ textAlign: 'right' }}>단가</th>
                        <th style={{ textAlign: 'center' }}>전산 수량</th>
                        <th style={{ textAlign: 'center' }}>실사 수량</th>
                        <th style={{ textAlign: 'center' }}>차이 수량</th>
                        <th style={{ textAlign: 'right' }}>차이 금액</th>
                        <th>차이 사유 (횡령/감모 원인)</th>
                        <th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                            실사 대상 품목이 없습니다.
 </td>
                        </tr>
                      ) : (
                        currentItems.map((item, idx) => {
                          const hasDiff = item.diffQty !== 0;

                          return (
                            <tr key={item.id} style={{ backgroundColor: hasDiff ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                              <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                              <td><strong style={{ color: 'var(--primary)' }}>{item.modelName}</strong></td>
                              <td style={{ fontSize: '12px' }}>{item.unit}</td>
                              <td style={{ textAlign: 'right', fontSize: '12px' }}>₩{(item.unitPrice || 0).toLocaleString()}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.systemQty}</td>
                              <td style={{ textAlign: 'center' }}>
                                {isDraft ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.actualQty}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0);
                                      handleAuditItemQtyChange(item.id, val, item.diffReason, item.note);
                                    }}
                                    style={{
                                      width: '70px', padding: '4px', textAlign: 'center', fontWeight: 800,
                                      borderRadius: '4px',
                                      border: hasDiff ? '2px solid #dc2626' : '1px solid var(--border-color)',
                                      backgroundColor: hasDiff ? '#fff1f2' : 'inherit'
                                    }}
                                  />
                                ) : (
                                  <strong style={{ color: 'var(--primary)' }}>{item.actualQty}</strong>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {item.diffQty === 0 ? (
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>0</span>
                                ) : item.diffQty > 0 ? (
                                  <span className="badge badge-primary" style={{ fontWeight: 800 }}>+{item.diffQty} (잉여)</span>
                                ) : (
                                  <span className="badge badge-danger" style={{ fontWeight: 800 }}>{item.diffQty} (감모)</span>
                                )}
                              </td>
                              <td style={{
                                textAlign: 'right', fontWeight: 700, fontSize: '12px',
                                color: item.diffAmount === 0 ? 'inherit' : (item.diffAmount > 0 ? '#2563eb' : '#dc2626')
                              }}>
                                {item.diffAmount === 0 ? '-' : `₩${(item.diffAmount || 0).toLocaleString()}`}
                              </td>
                              <td>
                                {isDraft ? (
                                  <select
                                    value={item.diffReason || 'OTHER'}
                                    disabled={!hasDiff}
                                    onChange={e => handleAuditItemQtyChange(item.id, item.actualQty, e.target.value as any, item.note)}
                                    style={{ padding: '3px 6px', fontSize: '11px', width: '100%', opacity: hasDiff ? 1 : 0.4 }}
                                  >
                                    <option value="LOST">망실/도난</option>
                                    <option value="DAMAGED">파손/부식/폐기</option>
                                    <option value="UNRECORDED_USAGE">미기록 현장소모</option>
                                    <option value="SURPLUS">미등록 잉여수거</option>
                                    <option value="OTHER">기타 사유</option>
                                  </select>
                                ) : (
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                    {item.diffReason === 'LOST' ? '망실/도난' :
                                     item.diffReason === 'DAMAGED' ? '파손/부식' :
                                     item.diffReason === 'UNRECORDED_USAGE' ? '미기록 현장소모' :
                                     item.diffReason === 'SURPLUS' ? '미등록 잉여' : (item.diffQty !== 0 ? '기타' : '-')}
                                  </span>
                                )}
                              </td>
                              <td>
                                {isDraft ? (
                                  <input
                                    type="text"
                                    value={item.note || ''}
                                    placeholder="특이사항 메모..."
                                    onChange={e => handleAuditItemQtyChange(item.id, item.actualQty, item.diffReason, e.target.value)}
                                    style={{ width: '100%', padding: '3px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{item.note || '-'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 하단 Gutenberg Z-패턴 대차대조식 터미널 바 */}
                <div style={{
                  padding: '14px 20px', backgroundColor: 'var(--bg-app)', borderTop: '1px solid var(--border-color)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span><strong>실물 총액:</strong> ₩{currentAudit.totalActualAmount.toLocaleString()}원</span>
                    <span>=</span>
                    <span> <strong>전산 총액:</strong> ₩{currentAudit.totalSystemAmount.toLocaleString()}원</span>
                    <span>+</span>
                    <span><strong>실사 차액:</strong> ₩{currentAudit.totalDiffAmount.toLocaleString()}원</span>
                  </div>

                  {isDraft && canSave && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleConfirmAudit(currentAudit.id)}
                      style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <CheckCircle2 size={16} /> 실사 확정 및 재고 강제 반영
 </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 최하단 1줄 요약 바 (전체 탭 공통) */}
      <div
        data-mid="consumable-stock-bottom-summary"
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>등록 소모품: <strong style={{ color: 'var(--text-primary)' }}>{consumables.length}종</strong> (취급 {agingBucketsSummary.activeKinds}종)</span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>주기장 현재고 수량: <strong style={{ color: 'var(--primary)' }}>{stockSummary.hqTotalQty.toLocaleString('ko-KR')}개</strong></span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>주기장 재고잔액 합계: <strong style={{ color: '#2563eb' }}>₩{stockSummary.hqTotalValue.toLocaleString('ko-KR')}</strong></span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>안전재고 미달: <strong style={{ color: stockSummary.lowStockCount > 0 ? '#dc2626' : 'var(--success)' }}>{stockSummary.lowStockCount}종</strong></span>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>기준년월: {targetYm}</span>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 주기장  차량 불출 모달 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showTransferModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <form onSubmit={handleTransferSubmit} className="card" style={{ width: '90%', maxWidth: '450px', backgroundColor: 'var(--bg-card)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpRight size={16} style={{ color: 'var(--primary)' }} /> 주기장 차량 소모품 불출
 </h3>
              <button type="button" onClick={() => setShowTransferModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>수령 정비사 (차량) *</label>
                <select value={transferMechanicId} onChange={e => setTransferMechanicId(e.target.value)} required style={{ padding: '8px', fontSize: '13px' }}>
                  <option value="">-- 정비사 선택 --</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>{m.name} 차량</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>불출 소모품 품목 *</label>
                <select value={transferConsumableId} onChange={e => setTransferConsumableId(e.target.value)} required style={{ padding: '8px', fontSize: '13px' }}>
                  <option value="">-- 품목 선택 --</option>
                  {consumables.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.modelName} (주기장재고: {c.stockQty}개 | ₩{c.unitPrice.toLocaleString()})
 </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>불출 수량 *</label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={e => setTransferQty(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>불출 목적 및 메모</label>
                <input
                  type="text"
                  value={transferMemo}
                  onChange={e => setTransferMemo(e.target.value)}
                  placeholder="예: 월간 정기 현장 AS 비상 비축용"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTransferModal(false)} style={{ flex: 1, padding: '10px' }}>
                  취소
 </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  불출 완료
 </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 차량  주기장 반납 모달 (고품 격리 토글 포함) */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showReturnModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <form onSubmit={handleReturnSubmit} className="card" style={{ width: '90%', maxWidth: '450px', backgroundColor: 'var(--bg-card)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowDownLeft size={16} style={{ color: 'var(--warning)' }} /> 차량 소모품 주기장 반납
 </h3>
              <button type="button" onClick={() => setShowReturnModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>반납 정비사 (차량) *</label>
                <select value={returnMechanicId} onChange={e => setReturnMechanicId(e.target.value)} required style={{ padding: '8px', fontSize: '13px' }}>
                  <option value="">-- 정비사 선택 --</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>{m.name} 차량</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>반납 소모품 품목 *</label>
                <select value={returnConsumableId} onChange={e => setReturnConsumableId(e.target.value)} required style={{ padding: '8px', fontSize: '13px' }}>
                  <option value="">-- 품목 선택 --</option>
                  {consumables.map(c => (
                    <option key={c.id} value={c.id}>{c.modelName}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>반납 수량 *</label>
                <input
                  type="number"
                  min={1}
                  value={returnQty}
                  onChange={e => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              {/* 고품 격리 체크 */}
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isReturnDefective}
                    onChange={e => setIsReturnDefective(e.target.checked)}
                  />
                  <span>수거 고품(교체 폐부품/불량품) 반납 격리</span>
                </label>

                {isReturnDefective && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>사후 처분 구분 *</label>
                    <select
                      value={returnDisposition}
                      onChange={e => setReturnDisposition(e.target.value as any)}
                      style={{ padding: '6px', fontSize: '12px' }}
                    >
                      <option value="REBUILD">재생 대상 (공장 외주 수리/오버홀)</option>
                      <option value="SCRAP">폐기/고철 매각</option>
                      <option value="VENDOR_WARRANTY">제조사 무상보증 클레임 교환</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>반납 사유 및 메모</label>
                <input
                  type="text"
                  value={returnMemo}
                  onChange={e => setReturnMemo(e.target.value)}
                  placeholder="예: 잉여 부품 반납 또는 현장 교체 고품 회수"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowReturnModal(false)} style={{ flex: 1, padding: '10px' }}>
                  취소
 </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  반납 완료
 </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 차량 간 이동 모달 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showP2PModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <form onSubmit={handleP2PSubmit} className="card" style={{ width: '90%', maxWidth: '450px', backgroundColor: 'var(--bg-card)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowRightLeft size={16} style={{ color: 'var(--primary)' }} /> 정비 차량 간 소모품 이동
 </h3>
              <button type="button" onClick={() => setShowP2PModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>양도 정비사 (출고) *</label>
                  <select value={p2pFromMechanicId} onChange={e => setP2pFromMechanicId(e.target.value)} required style={{ padding: '8px', fontSize: '12px' }}>
                    <option value="">-- 정비사 선택 --</option>
                    {mechanics.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>양수 정비사 (입고) *</label>
                  <select value={p2pToMechanicId} onChange={e => setP2pToMechanicId(e.target.value)} required style={{ padding: '8px', fontSize: '12px' }}>
                    <option value="">-- 정비사 선택 --</option>
                    {mechanics.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>이동 품목 *</label>
                <select value={p2pConsumableId} onChange={e => setP2pConsumableId(e.target.value)} required style={{ padding: '8px', fontSize: '13px' }}>
                  <option value="">-- 품목 선택 --</option>
                  {consumables.map(c => (
                    <option key={c.id} value={c.id}>{c.modelName}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>이동 수량 *</label>
                <input
                  type="number"
                  min={1}
                  value={p2pQty}
                  onChange={e => setP2pQty(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>이동 메모</label>
                <input
                  type="text"
                  value={p2pMemo}
                  onChange={e => setP2pMemo(e.target.value)}
                  placeholder="예: 현장 긴급 AS 부품 지원 융통"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowP2PModal(false)} style={{ flex: 1, padding: '10px' }}>
                  취소
 </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  이동 완료
 </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 소모품 마스터 CUD 모달 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showMasterModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <form onSubmit={handleSaveMaster} className="card" style={{ width: '90%', maxWidth: '520px', backgroundColor: 'var(--bg-card)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                {masterEditingId ? '소모품 마스터 정보 수정' : '신규 소모품 마스터 등록'}
              </h3>
              <button type="button" onClick={() => setShowMasterModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>소모품 분류 *</label>
                  <select
                    value={masterCategory}
                    onChange={e => setMasterCategory(e.target.value)}
                    style={{ padding: '8px', fontSize: '13px' }}
                  >
                    <option value="윤활유·오일류">윤활유·오일류</option>
                    <option value="구리스·방청·케미컬">구리스·방청·케미컬</option>
                    <option value="장갑·안전보호구">장갑·안전보호구</option>
                    <option value="세척·보로·전장소모재">세척·보로·전장소모재</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>취급여부 결정 *</label>
                  <select
                    value={masterIsHandled ? 'HANDLED' : 'UNHANDLED'}
                    onChange={e => setMasterIsHandled(e.target.value === 'HANDLED')}
                    style={{ padding: '8px', fontSize: '13px', fontWeight: 700 }}
                  >
                    <option value="HANDLED">취급 소모품</option>
                    <option value="UNHANDLED">미취급 소모품</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>소모품 품번</label>
                  <input
                    type="text"
                    value={masterSkuCode}
                    onChange={e => setMasterSkuCode(e.target.value)}
                    placeholder="예: CSM-OIL-VG46-20L"
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>제조사 · 브랜드</label>
                  <input
                    type="text"
                    value={masterBrand}
                    onChange={e => setMasterBrand(e.target.value)}
                    placeholder="예: SK루브리컨츠, 뷔르트, 크린가드"
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>소모품명 *</label>
                <input
                  type="text"
                  value={masterModelName}
                  onChange={e => setMasterModelName(e.target.value)}
                  placeholder="예: 유압작동유 ISO VG 46 20L, 고하중 리튬 구리스 박스, 코팅장갑"
                  required
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>포장 규격 · 용량 설명</label>
                <input
                  type="text"
                  value={masterSpec}
                  onChange={e => setMasterSpec(e.target.value)}
                  placeholder="예: 20L 말통, 400g×20본입 1박스, 10켤레 1묶음"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>단위</label>
                  <input
                    type="text"
                    value={masterUnit}
                    onChange={e => setMasterUnit(e.target.value)}
                    placeholder="통, 박스, 묶음, 캔"
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>기준 매입단가</label>
                  <input
                    type="number"
                    min={0}
                    value={masterUnitPrice}
                    onChange={e => setMasterUnitPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>기준 판매단가</label>
                  <input
                    type="number"
                    min={0}
                    value={masterSalePrice}
                    onChange={e => setMasterSalePrice(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>주요 공급처</label>
                <input
                  type="text"
                  value={masterSupplier}
                  onChange={e => setMasterSupplier(e.target.value)}
                  placeholder="예: 평택항만윤활유상사, 안산산업안전케미컬"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              {!masterEditingId && masterIsHandled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>초기 주기장 보유 수량</label>
                  <input
                    type="number"
                    min={0}
                    value={masterInitialStockQty}
                    onChange={e => setMasterInitialStockQty(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ padding: '8px', fontSize: '13px' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowMasterModal(false)} style={{ flex: 1, padding: '10px' }}>
                  취소
                </button>
                <button data-hs-trigger="Register" type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  {masterEditingId ? '수정 완료' : '소모품 마스터 등록'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 신규 실사 전표 생성 모달 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showCreateAuditModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <form onSubmit={handleCreateAuditSubmit} className="card" style={{ width: '90%', maxWidth: '450px', backgroundColor: 'var(--bg-card)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>새 재고 실사 전표 생성</h3>
              <button type="button" onClick={() => setShowCreateAuditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>실사 대상 구분 *</label>
                <select
                  value={newAuditTargetType}
                  onChange={e => setNewAuditTargetType(e.target.value as any)}
                  style={{ padding: '8px', fontSize: '13px' }}
                >
                  <option value="HQ">주기장 재고</option>
                  <option value="VEHICLE">AS 기사 정비차량</option>
                </select>
              </div>

              {newAuditTargetType === 'VEHICLE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>담당 정비사 *</label>
                  <select
                    value={newAuditMechanicId}
                    onChange={e => setNewAuditMechanicId(e.target.value)}
                    required
                    style={{ padding: '8px', fontSize: '13px' }}
                  >
                    <option value="">-- 정비사 선택 --</option>
                    {mechanics.map(m => (
                      <option key={m.id} value={m.id}>{m.name} 차량</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>실사 목적 및 메모</label>
                <input
                  type="text"
                  value={newAuditMemo}
                  onChange={e => setNewAuditMemo(e.target.value)}
                  placeholder="예: 2026년 상반기 정기 재고 실사"
                  style={{ padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateAuditModal(false)} style={{ flex: 1, padding: '10px' }}>
                  취소
 </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  실사 전표 생성
 </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
