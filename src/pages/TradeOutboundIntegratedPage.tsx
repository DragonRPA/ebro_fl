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
          <Zap size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            출고관리-유통 · 유통계약 출고처리, 납품문서 전달 및 배송이력·비용 관리
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('OUTBOUND_DOCS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'OUTBOUND_DOCS' ? 'var(--primary)' : 'transparent',
              color: subTab === 'OUTBOUND_DOCS' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Zap size={14} />
            <span>유통계약 출고처리 · 납품문서 전달</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('DELIVERY_COST')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'DELIVERY_COST' ? '#059669' : 'transparent',
              color: subTab === 'DELIVERY_COST' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Truck size={14} />
            <span>배송 이력 · 운송비용 입력</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('RETURNS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'RETURNS' ? '#d97706' : 'transparent',
              color: subTab === 'RETURNS' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <ArrowLeftRight size={14} />
            <span>환입 · 반품 처리</span>
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
