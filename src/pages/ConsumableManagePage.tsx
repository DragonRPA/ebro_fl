import React, { useState } from 'react';
import { Boxes, ShoppingBag, ArrowLeftRight } from 'lucide-react';
import { ConsumableStockPage } from './ConsumableStockPage';
import { ConsumablePurchasesPage } from './ConsumablePurchasesPage';
import { ConsumableInOutPage } from './ConsumableInOutPage';

export const ConsumableManagePage: React.FC = () => {
  const [subTab, setSubTab] = useState<'STOCK' | 'PURCHASE' | 'INOUT_USAGE'>('STOCK');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Boxes size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            소모품관리-렌탈 · 소모품 재고 조회, 구매, 입고 및 사용(소모) 통합 관리
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('STOCK')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'STOCK' ? 'var(--primary)' : 'transparent',
              color: subTab === 'STOCK' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Boxes size={14} />
            <span>소모품 재고 조회 · 입고 · 사용</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PURCHASE')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'PURCHASE' ? '#059669' : 'transparent',
              color: subTab === 'PURCHASE' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <ShoppingBag size={14} />
            <span>소모품 구매 · 입고 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('INOUT_USAGE')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'INOUT_USAGE' ? '#d97706' : 'transparent',
              color: subTab === 'INOUT_USAGE' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <ArrowLeftRight size={14} />
            <span>소모품 입고 · 사용(소모) 대장</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'STOCK' && <ConsumableStockPage />}
        {subTab === 'PURCHASE' && <ConsumablePurchasesPage />}
        {subTab === 'INOUT_USAGE' && <ConsumableInOutPage />}
      </div>
    </div>
  );
};
export default ConsumableManagePage;
