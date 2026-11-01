import React, { useState } from 'react';
import { BookOpen, Send, FileSpreadsheet } from 'lucide-react';
import { SEED_FL_CUSTOMERS } from '../data/flUnifiedSeedData';
import { ForkliftDocArchivePage } from './distribution/ForkliftDocArchivePage';
import { CompatiblePartsCatalogOrderPage } from './distribution/CompatiblePartsCatalogOrderPage';

export const BrochureCatalogSendPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'BROCHURE_ARCHIVE' | 'PARTS_CATALOG'>('BROCHURE_ARCHIVE');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(SEED_FL_CUSTOMERS[0].id);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const selectedCustomer = SEED_FL_CUSTOMERS.find(c => c.id === selectedCustomerId) || SEED_FL_CUSTOMERS[0];

  const handleSendPackage = () => {
    setToastMsg(`${selectedCustomer.name} (${selectedCustomer.repEmail}) 앞 공식 제품 브로셔 및 카타로그 패키지 발송이 완료되었습니다.`);
    setTimeout(() => setToastMsg(null), 3200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: '12.5px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={18} color="#2563eb" />
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
              브로셔/카타로그 · 공식 브로셔 및 호환부품 카타로그 발송
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 700 }}
            >
              {SEED_FL_CUSTOMERS.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.repEmail}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSendPackage}
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            >
              <Send size={13} />
              <span>선택 고객사 브로셔·카타로그 발송</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('BROCHURE_ARCHIVE')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'BROCHURE_ARCHIVE' ? 'var(--primary)' : 'transparent',
              color: subTab === 'BROCHURE_ARCHIVE' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <BookOpen size={14} />
            <span>지게차 브로셔 · 제원표 · 매뉴얼</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PARTS_CATALOG')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'PARTS_CATALOG' ? '#059669' : 'transparent',
              color: subTab === 'PARTS_CATALOG' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FileSpreadsheet size={14} />
            <span>호환부품 카타로그 · 주문서 발송</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'BROCHURE_ARCHIVE' ? <ForkliftDocArchivePage /> : <CompatiblePartsCatalogOrderPage />}
      </div>
    </div>
  );
};
export default BrochureCatalogSendPage;
