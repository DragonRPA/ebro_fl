import { normalizeAgentTenantCode } from '../services/agentTransportCore';
import type { TenantR2Config } from '../types/domain';

export interface ActiveR2TenantContext {
  tenantId: string;
  tenantCode: string;
  r2Config?: TenantR2Config;
}

let activeR2Context: ActiveR2TenantContext = {
  tenantId: 'ebro-fl',
  tenantCode: 'EBRO_FL',
};

export function setR2TenantContext(ctx: {
  tenantId?: string;
  tenantCode?: string;
  r2Config?: TenantR2Config;
}): void {
  activeR2Context = {
    tenantId: ctx.tenantId || activeR2Context.tenantId || 'ebro-fl',
    tenantCode: normalizeAgentTenantCode(ctx.tenantCode || activeR2Context.tenantCode || 'EBRO_FL'),
    r2Config: ctx.r2Config,
  };
}

export function getR2TenantContext(): ActiveR2TenantContext {
  return activeR2Context;
}
