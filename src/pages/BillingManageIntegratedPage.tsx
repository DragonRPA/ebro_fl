import React, { useState } from 'react';
import { FileText, ShoppingBag } from 'lucide-react';
import { Billings } from './Billings';
import { TradeBillingPage } from './distribution/TradeBillingPage';

export const BillingManageIntegratedPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'RENTAL_INTEGRATED' | 'TRADE_BILLING'>('RENTAL_INTEGRATED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            청구관리 · 계약에 의한 청구의 생성·관리 및 청구서/명세서 발송
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('RENTAL_INTEGRATED')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'RENTAL_INTEGRATED' ? 'var(--primary)' : 'transparent',
              color: subTab === 'RENTAL_INTEGRATED' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FileText size={14} />
            <span>렌탈·통합 계약 청구 생성 및 청구서 발송</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('TRADE_BILLING')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'TRADE_BILLING' ? '#059669' : 'transparent',
              color: subTab === 'TRADE_BILLING' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <ShoppingBag size={14} />
            <span>유통 계약 청구 및 매출원장</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'RENTAL_INTEGRATED' && <Billings />}
        {subTab === 'TRADE_BILLING' && <TradeBillingPage />}
      </div>
    </div>
  );
};
export default BillingManageIntegratedPage;
