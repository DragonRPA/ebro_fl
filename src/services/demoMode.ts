// src/services/demoMode.ts
// ebro_fl 데모 모드 감지, 설정 및 리셋 서비스

import goldenData from './demo_golden_dataset.json';
import { createClient } from '@supabase/supabase-js';

export const DEMO_SUPABASE_CONFIG = {
  url: 'https://mluhhrbcogvsalkchrdp.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sdWhocmJjb2d2c2Fsa2NocmRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzM0MjM1MywiZXhwIjoyMTA4OTE4MzUzfQ.9DTI60YlVeKxPLvvGAZOq8cZF8onrU1NCrfBNB-Fvyo',
  projectRef: 'mluhhrbcogvsalkchrdp'
};

export function clearLocalErpCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('erp_') || k.startsWith('ebro_fl_trade_')) && k !== 'erp_current_tenant_id') {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
}

export function isProductionDomain(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();

  return (
    hostname === 'fl-demo.ebro.run' ||
    hostname === 'fl.ebro.run' ||
    hostname === 'ebro_fl.vercel.app' ||
    hostname === 'ebro-fl.vercel.app' ||
    (hostname.endsWith('.ebro.run') && !hostname.includes('awp-demo'))
  );
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;

  if (isProductionDomain()) {
    try { localStorage.removeItem('ebro_demo_mode'); } catch (e) {}
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();

  if (hostname.includes('demo') || hostname.includes('preview')) {
    return true;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('demo') === 'true' || searchParams.get('mode') === 'demo') {
      localStorage.setItem('ebro_demo_mode', 'true');
      return true;
    }
    return localStorage.getItem('ebro_demo_mode') === 'true';
  }

  return false;
}

export const DEMO_DEFAULT_ADMIN_USER = {
  id: 'USR-0000002',
  loginId: '이수용',
  name: '이수용',
  department: '경영관리팀',
  departmentId: 'DEPT-0000001',
  position: '대표이사',
  status: 'ACTIVE' as const,
  role: 'ADMIN' as const,
  customRoleId: 'role_mgmt',
  phone: '010-3344-5566',
  email: 'ceo@ebro.run',
  createdAt: '2026-01-01T00:00:00Z'
};

export function enterDemoMode() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ebro_demo_mode', 'true');
  sessionStorage.removeItem('demo_explicit_logout');
  sessionStorage.setItem('user', JSON.stringify(DEMO_DEFAULT_ADMIN_USER));
  sessionStorage.removeItem('original_admin_user');

  window.location.href = window.location.pathname;
}

export function exitDemoMode() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('ebro_demo_mode');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('original_admin_user');
  localStorage.removeItem('auto_user');

  window.location.href = window.location.pathname;
}

export function getDemoSupabaseClient() {
  return createClient(DEMO_SUPABASE_CONFIG.url, DEMO_SUPABASE_CONFIG.anonKey, {
    auth: { persistSession: false }
  });
}

export async function resetDemoDataToGolden(onProgress?: (msg: string) => void): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getDemoSupabaseClient();
    const dataset = goldenData as Record<string, any[]>;

    const deleteOrder = [
      'trade_billings',
      'trade_outbounds',
      'trade_sales_order_lines',
      'trade_sales_orders',
      'trade_inventory_lots',
      'trade_purchases',
      'trade_products',
      'todos',
      'as_route_logs',
      'collected_parts',
      'consumable_logs',
      'mechanic_consumable_stocks',
      'consumable_lots',
      'asset_inout_logs',
      'bank_transactions', 'bank_initial_balances',
      'payments', 'receivables', 'billing_details',
      'billings', 'billing_invoices',
      'repair_consumables', 'repairs',
      'outbound_inspections', 'deliveries',
      'contract_history', 'contract_assets', 'contracts',
      'assets',
      'customer_contacts', 'customer_sites', 'site_masters', 'customers',
      'transport_drivers', 'transport_companies',
      'consumables', 'standard_options', 'products', 'vendors',
      'users', 'departments', 'tenants'
    ];

    for (const tbl of deleteOrder) {
      if (onProgress) onProgress(`기존 데이터 정리 중: ${tbl}`);
      const { error } = await supabase.from(tbl).delete().neq('id', '___NEVER_MATCH___');
      if (error && !error.message?.includes('Could not find')) {
        throw new Error(`시연 데이터 초기화 삭제 오류: ${tbl} - ${error.message}`);
      }
    }

    const insertOrder = [
      'tenants', 'departments', 'custom_roles', 'users', 'role_permissions', 'permissions',
      'products', 'standard_options', 'vendors', 'consumables', 'consumable_lots',
      'mechanic_consumable_stocks', 'transport_companies',
      'transport_drivers',
      'customers', 'site_masters', 'customer_sites', 'customer_contacts',
      'assets',
      'contracts', 'contract_assets', 'contract_history', 'external_leases',
      'deliveries', 'outbound_inspections',
      'repairs', 'repair_consumables', 'as_route_logs',
      'consumable_logs', 'collected_parts', 'asset_inout_logs',
      'billing_invoices', 'billings', 'billing_details', 'receivables', 'payments',
      'purchase_settlements', 'purchase_settlement_items',
      'bank_initial_balances', 'bank_transactions',
      'approval_rules', 'rule_consensus', 'approval_requests', 'approval_steps',
      'equipment_manuals', 'print_stations', 'print_queue', 'label_templates',
      'delinquency_action_logs', 'todos',
      'trade_products', 'trade_purchases', 'trade_inventory_lots',
      'trade_sales_orders', 'trade_sales_order_lines', 'trade_outbounds', 'trade_billings'
    ];

    const CHUNK_SIZE = 300;
    for (const tbl of insertOrder) {
      const rows = dataset[tbl];
      if (!rows || rows.length === 0) continue;

      if (onProgress) onProgress(`시연 데이터 복원 중: ${tbl} (${rows.length}건)`);
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from(tbl).upsert(chunk, { onConflict: 'id' });
        if (error) {
          throw new Error(`시연 데이터 복원 저장 오류: ${tbl} - ${error.message}`);
        }
      }
    }

    clearLocalErpCache();
    if (onProgress) onProgress('시연 데이터 복원 완료');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to reset demo data:', err);
    return { success: false, error: err?.message || String(err) };
  }
}
