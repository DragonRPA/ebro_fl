import { SupabaseClient } from '@supabase/supabase-js';
import {
  createPrefixedSupabaseClient,
  DRAGONRPA_HUB_SUPABASE,
  resolvePrefixedTableName,
} from '../lib/supabasePrefixProxy';

export const DEFAULT_TENANT_ID = 'tenant-ebro-fl';

let activeFlTenantId: string = DEFAULT_TENANT_ID;

export function getActiveFlTenantId(): string {
  return activeFlTenantId;
}

export function setActiveFlTenantId(tenantId: string): void {
  const next = typeof tenantId === 'string' ? tenantId.trim() : '';
  activeFlTenantId = next || DEFAULT_TENANT_ID;
}

function stampFlTenantRow(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row;
  }
  const cloned: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  delete cloned.tenantId;
  cloned.tenant_id = getActiveFlTenantId();
  return cloned;
}

function wrapFlTableBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === 'select') {
        return (...args: unknown[]) => {
          const selectFn = Reflect.get(target, 'select', target) as (...a: unknown[]) => {
            eq: (col: string, val: unknown) => unknown;
          };
          const res = selectFn.apply(target, args);
          return res.eq('tenant_id', getActiveFlTenantId());
        };
      }
      if (prop === 'insert') {
        return (values: unknown, ...rest: unknown[]) => {
          const stamped = Array.isArray(values)
            ? values.map(stampFlTenantRow)
            : stampFlTenantRow(values);
          const insertFn = Reflect.get(target, 'insert', target) as (...a: unknown[]) => unknown;
          return insertFn.apply(target, [stamped, ...rest]);
        };
      }
      if (prop === 'upsert') {
        return (values: unknown, ...rest: unknown[]) => {
          const stamped = Array.isArray(values)
            ? values.map(stampFlTenantRow)
            : stampFlTenantRow(values);
          const upsertFn = Reflect.get(target, 'upsert', target) as (...a: unknown[]) => unknown;
          return upsertFn.apply(target, [stamped, ...rest]);
        };
      }
      if (prop === 'update') {
        return (values: unknown, ...rest: unknown[]) => {
          let cleaned = values;
          if (values && typeof values === 'object' && !Array.isArray(values)) {
            const cloned = { ...(values as Record<string, unknown>) };
            delete cloned.tenantId;
            delete cloned.tenant_id;
            cleaned = cloned;
          }
          const updateFn = Reflect.get(target, 'update', target) as (...a: unknown[]) => {
            eq: (col: string, val: unknown) => unknown;
          };
          const res = updateFn.apply(target, [cleaned, ...rest]);
          return res.eq('tenant_id', getActiveFlTenantId());
        };
      }
      if (prop === 'delete') {
        return (...args: unknown[]) => {
          const deleteFn = Reflect.get(target, 'delete', target) as (...a: unknown[]) => {
            eq: (col: string, val: unknown) => unknown;
          };
          const res = deleteFn.apply(target, args);
          return res.eq('tenant_id', getActiveFlTenantId());
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createTenantIsolatedFlClient(rawClient: SupabaseClient): SupabaseClient {
  const origFrom = rawClient.from.bind(rawClient);
  (rawClient as unknown as { from: (relation: string) => unknown }).from = (relation: string) => {
    const resolved = resolvePrefixedTableName(relation, 'fl_');
    const builder = origFrom(relation);
    if (!resolved.startsWith('fl_') || resolved.startsWith('fl_backup_')) {
      return builder;
    }
    return wrapFlTableBuilder(builder as unknown as object);
  };
  return rawClient;
}

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DRAGONRPA_HUB_SUPABASE.url;
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DRAGONRPA_HUB_SUPABASE.anonKey;

// FL 운영 도메인 DB 클라이언트 (모든 테이블명 자동 fl_ 접두 + active tenant_id 행 격리 게이트웨이)
export const flSupabase = createTenantIsolatedFlClient(
  createPrefixedSupabaseClient(supabaseUrl, supabaseAnonKey, 'fl_')
);

// 전사 공용 센터 DB 클라이언트 (core_tenants, core_manual_annotations)
export const centralSupabase = createPrefixedSupabaseClient(
  DRAGONRPA_HUB_SUPABASE.url,
  DRAGONRPA_HUB_SUPABASE.anonKey,
  'core_'
);

type ErrorModalHandler = (message: string) => void;
let globalErrorModalHandler: ErrorModalHandler | null = null;

export function registerErrorModalHandler(handler: ErrorModalHandler): void {
  globalErrorModalHandler = handler;
}

export function showErrorModal(message: string): void {
  if (globalErrorModalHandler) {
    globalErrorModalHandler(message);
  } else {
    console.error('[eBroFL Error]', message);
  }
}

export interface DbQueryResult<T = unknown> {
  data: T;
  error: { message?: string; code?: string; details?: string } | null;
}

export async function selectAllFlRows(
  table: string,
  options?: { orderCol?: string; ascending?: boolean; pageSize?: number }
): Promise<DbQueryResult<Record<string, unknown>[]>> {
  const pageSize = Math.max(100, options?.pageSize || 1000);
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    let query = flSupabase.from(table).select('*');
    if (options?.orderCol) {
      query = query.order(options.orderCol, { ascending: options.ascending ?? true });
      if (options.orderCol !== 'id') {
        query = query.order('id', { ascending: true });
      }
    } else {
      query = query.order('id', { ascending: true });
    }
    const res = await query.range(offset, offset + pageSize - 1);
    if (res.error) {
      return { data: rows, error: res.error };
    }
    const batch = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return { data: rows, error: null };
}

// 무음 실패 원천 차단: 모든 쓰기 작업은 결과를 검증하고 실패 시 즉시 예외 + 모달 표출
export async function execDbMutation<T>(
  actionLabel: string,
  op: () => PromiseLike<DbQueryResult<T>>
): Promise<T> {
  const res = await op();
  if (res.error) {
    const errMessage = `[${actionLabel}] 저장 실패: ${res.error.message || res.error.details || '데이터베이스 오류'}`;
    showErrorModal(errMessage);
    throw new Error(errMessage);
  }
  return res.data;
}

export function snakeToCamelRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[camelKey] = v;
  }
  return out as T;
}

export function camelToSnakeRow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const snakeKey = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (snakeKey === 'tenant_id' && (v === DEFAULT_TENANT_ID || !v)) {
      out.tenant_id = getActiveFlTenantId();
    } else {
      out[snakeKey] = v;
    }
  }
  return out;
}

export function newId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}
