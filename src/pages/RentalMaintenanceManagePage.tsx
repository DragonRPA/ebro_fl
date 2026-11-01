import React, { useState } from 'react';
import { Wrench, Boxes, ArrowRight, Plus, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Repairs } from './Repairs';
import { SEED_FL_RENTAL_ASSETS } from '../data/flUnifiedSeedData';
import { COMPATIBLE_PARTS_CATALOG } from '../data/compatiblePartsCatalogData';
import { loadPartsInventory, savePartsInventory, loadPartUsageHistory, savePartUsageHistory } from './PartsManagePage';

export const RentalMaintenanceManagePage: React.FC = () => {
  const { setActiveTab } = useApp();
  const [showQuickPartLinkForm, setShowQuickPartLinkForm] = useState<boolean>(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(SEED_FL_RENTAL_ASSETS[0]?.id || 'AST-FL-001');
  const [selectedPartSku, setSelectedPartSku] = useState<string>(COMPATIBLE_PARTS_CATALOG[0]?.sku || '');
  const [usedQty, setUsedQty] = useState<number>(1);
  const [repairSummary, setRepairSummary] = useState<string>('정기 오버홀 및 마모 부품 신품 교체');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleSavePartLinkedRepair = () => {
    const ast = SEED_FL_RENTAL_ASSETS.find(a => a.id === selectedAssetId) || SEED_FL_RENTAL_ASSETS[0];
    const part = COMPATIBLE_PARTS_CATALOG.find(p => p.sku === selectedPartSku) || COMPATIBLE_PARTS_CATALOG[0];
    const currentParts = loadPartsInventory();
    const invItem = currentParts.find(p => p.skuCode === part.sku);
    const reqQty = Math.max(1, Math.floor(Number(usedQty) || 1));

    if (invItem && reqQty > invItem.repairStockQty) {
      setToastMsg(`렌탈 정비용 가용 부품재고(${invItem.repairStockQty}개)가 부족하여 차감이 차단되었습니다. (유통 판매용 재고 ${invItem.saleStockQty}개는 침범 불가)`);
      setTimeout(() => setToastMsg(null), 3500);
      return;
    }

    if (invItem) {
      const nextParts = currentParts.map(p => {
        if (p.skuCode !== part.sku) return p;
        const nextRepairQty = Math.max(0, p.repairStockQty - reqQty);
        return {
          ...p,
          repairStockQty: nextRepairQty,
          totalQty: p.saleStockQty + nextRepairQty
        };
      });
      savePartsInventory(nextParts);
    }

    const currentHistory = loadPartUsageHistory();
    const newRecord = {
      id: `PUH-202611-${String(currentHistory.length + 1).padStart(3, '0')}`,
      usedDate: new Date().toISOString().split('T')[0],
      repairTicketNo: `REP-202611-${String(currentHistory.length + 1).padStart(3, '0')}`,
      assetId: ast.id,
      assetNo: ast.assetNo,
      modelName: ast.modelName,
      partId: part.id,
      skuCode: part.sku,
      partName: part.partName,
      usedQty: reqQty,
      unitCost: part.dealerPriceKrw || part.retailPriceKrw,
      totalPartCost: (part.dealerPriceKrw || part.retailPriceKrw) * reqQty,
      mechanicName: '김정비',
      repairSummary
    };
    savePartUsageHistory([newRecord, ...currentHistory]);

    setShowQuickPartLinkForm(false);
    setToastMsg(`자산 [${ast.assetNo}] 정비이력 등록 완료 · 부품관리-렌탈 재고 차감(${part.partName} ${reqQty}개) 및 자산 부품사용이력 기록이 연동되었습니다.`);
    setTimeout(() => setToastMsg(null), 3500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: '12.5px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            정비관리-렌탈 · 렌탈자산 정비이력 입력 및 조회 (부품재고 자동 차감 · 자산이력 연동)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowQuickPartLinkForm(prev => !prev)}
            className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>부품재고 연동 정비이력 입력</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('parts_manage_rental')}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Boxes size={14} />
            <span>부품관리-렌탈 재고·사용원장 보기</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {showQuickPartLinkForm && (
        <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb', backgroundColor: 'rgba(37, 99, 235, 0.03)' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>
            렌탈자산 정비이력 입력 (부품관리-렌탈 정비용 재고 차감 및 자산이력 동시 기록)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 0.7fr 2fr auto', gap: '10px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>정비 대상 렌탈자산</label>
              <select value={selectedAssetId} onChange={e => setSelectedAssetId(e.target.value)} style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>사용 부품 선택 (렌탈정비용 재고 연동)</label>
              <select value={selectedPartSku} onChange={e => setSelectedPartSku(e.target.value)} style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {COMPATIBLE_PARTS_CATALOG.slice(0, 12).map(p => (
                  <option key={p.sku} value={p.sku}>[{p.sku}] {p.partName}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>차감 수량</label>
              <input type="number" min={1} value={usedQty} onChange={e => setUsedQty(Math.max(1, Number(e.target.value) || 1))} style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>정비 조치 내역</label>
              <input type="text" value={repairSummary} onChange={e => setRepairSummary(e.target.value)} style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleSavePartLinkedRepair} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} />
                <span>정비이력 및 부품차감 확정</span>
              </button>
              <button type="button" onClick={() => setShowQuickPartLinkForm(false)} className="btn btn-secondary" style={{ padding: '7px 10px', fontSize: '12px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Repairs />
      </div>
    </div>
  );
};
export default RentalMaintenanceManagePage;
