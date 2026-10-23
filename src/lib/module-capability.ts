
import { serviceMessage } from '@/i18n/service-message';
import type { ChainConfig } from './env';
import { QueryError } from './query-result';

export type SpecialModule = 'bex' | 'oracle' | 'feepolicy';
export function moduleEnabled(chain: ChainConfig | null | undefined, module: SpecialModule): boolean {
  return chain?.features?.[module] === true;
}
export function requireModule(chain: ChainConfig, path: string): void {
  const route = /^https?:\/\//.test(path) ? new URL(path).pathname : path;
  const feature = /^\/guru\/(bex|oracle|feepolicy)\//.exec(route)?.[1] as SpecialModule | undefined;
  if (feature && !moduleEnabled(chain, feature)) throw new QueryError({ kind: 'unsupported', ...serviceMessage("support_is_not_configured_or_is_disabled_for_this_chain", { value0: String(feature) }) });
}
