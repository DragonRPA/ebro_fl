import React, { useState } from 'react';
import { Users, Building2 } from 'lucide-react';
import { Customers } from './Customers';
import { Vendors } from './Vendors';

export const CustomerVendorManagePage: React.FC = () => {
  const [subTab, setSubTab] = useState<'CUSTOMERS' | 'VENDORS'>('CUSTOMERS');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            고객관리 · 고객사 현장·담당자 및 매입처·임차처 등록/조회
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('CUSTOMERS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'CUSTOMERS' ? 'var(--primary)' : 'transparent',
              color: subTab === 'CUSTOMERS' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Users size={14} />
            <span>고객사 · 현장 · 담당자 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('VENDORS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'VENDORS' ? '#059669' : 'transparent',
              color: subTab === 'VENDORS' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Building2 size={14} />
            <span>매입처 · 임차처 관리</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'CUSTOMERS' && <Customers />}
        {subTab === 'VENDORS' && <Vendors />}
      </div>
    </div>
  );
};
export default CustomerVendorManagePage;
