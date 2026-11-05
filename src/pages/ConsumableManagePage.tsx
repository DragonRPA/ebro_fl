import React, { useState } from 'react';
import { Boxes, ShoppingBag, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { ConsumableStockPage } from './ConsumableStockPage';
import { ConsumablePurchasesPage } from './ConsumablePurchasesPage';
import { ConsumableInOutPage } from './ConsumableInOutPage';

export const ConsumableManagePage: React.FC = () => {
  const [subTab, setSubTab] = useState<'STOCK' | 'MASTER' | 'PURCHASE' | 'INOUT_USAGE'>('STOCK');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Boxes size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            소모품관리-렌탈 · 윤활유 · 구리스 · 장갑 · 케미컬 소모성 물품 원장
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('STOCK')}
            className={`segmented-tab-item ${subTab === 'STOCK' ? 'active' : ''}`}
          >
            <Boxes size={14} />
            <span>소모품 재고 조회·불출</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('MASTER')}
            className={`segmented-tab-item ${subTab === 'MASTER' ? 'active' : ''}`}
          >
            <ShieldCheck size={14} />
            <span>소모품 마스터 · 취급여부</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PURCHASE')}
            className={`segmented-tab-item ${subTab === 'PURCHASE' ? 'active' : ''}`}
          >
            <ShoppingBag size={14} />
            <span>소모품 구매·입고 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('INOUT_USAGE')}
            className={`segmented-tab-item ${subTab === 'INOUT_USAGE' ? 'active' : ''}`}
          >
            <ArrowLeftRight size={14} />
            <span>입고·소모 대장</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'STOCK' && <ConsumableStockPage initialTab="STOCK" />}
        {subTab === 'MASTER' && <ConsumableStockPage initialTab="MASTER" />}
        {subTab === 'PURCHASE' && <ConsumablePurchasesPage />}
        {subTab === 'INOUT_USAGE' && <ConsumableInOutPage />}
      </div>
    </div>
  );
};
export default ConsumableManagePage;
