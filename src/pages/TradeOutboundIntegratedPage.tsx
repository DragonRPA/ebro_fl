import React, { useState } from 'react';
import { Zap, Truck, ArrowLeftRight } from 'lucide-react';
import { TradeOutboundPage } from './distribution/TradeOutboundPage';
import { CourierDispatchPage } from './distribution/CourierDispatchPage';
import { TradeReturnsPage } from './distribution/TradeReturnsPage';

export const TradeOutboundIntegratedPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'OUTBOUND_DOCS' | 'DELIVERY_COST' | 'RETURNS'>('OUTBOUND_DOCS');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            유통 출고 관리
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('OUTBOUND_DOCS')}
            className={`segmented-tab-item ${subTab === 'OUTBOUND_DOCS' ? 'active' : ''}`}
          >
            <Zap size={14} />
            <span>출고처리·납품문서</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('DELIVERY_COST')}
            className={`segmented-tab-item ${subTab === 'DELIVERY_COST' ? 'active' : ''}`}
          >
            <Truck size={14} />
            <span>배송이력·운송비용</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('RETURNS')}
            className={`segmented-tab-item ${subTab === 'RETURNS' ? 'active' : ''}`}
          >
            <ArrowLeftRight size={14} />
            <span>환입·반품 처리</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'OUTBOUND_DOCS' && <TradeOutboundPage />}
        {subTab === 'DELIVERY_COST' && <CourierDispatchPage />}
        {subTab === 'RETURNS' && <TradeReturnsPage />}
      </div>
    </div>
  );
};
export default TradeOutboundIntegratedPage;
