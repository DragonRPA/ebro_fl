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
          <FileText size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            청구관리
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('RENTAL_INTEGRATED')}
            className={`segmented-tab-item ${subTab === 'RENTAL_INTEGRATED' ? 'active' : ''}`}
          >
            <FileText size={14} />
            <span>렌탈·통합 청구 대장</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('TRADE_BILLING')}
            className={`segmented-tab-item ${subTab === 'TRADE_BILLING' ? 'active' : ''}`}
          >
            <ShoppingBag size={14} />
            <span>유통 청구·매출원장</span>
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
