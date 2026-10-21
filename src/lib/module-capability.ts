import type { ChainConfig } from './env';
import { QueryError } from './query-result';

export type SpecialModule = 'bex' | 'oracle' | 'feepolicy';
export function moduleEnabled(chain: ChainConfig | null | undefined, module: SpecialModule): boolean {
  return chain?.features?.[module] === true;
}
export function requireModule(chain: ChainConfig, path: string): void {
  const route = /^https?:\/\//.test(path) ? new URL(path).pathname : path;
  const feature = /^\/guru\/(bex|oracle|feepolicy)\//.exec(route)?.[1] as SpecialModule | undefined;
  if (feature && !moduleEnabled(chain, feature)) throw new QueryError({ kind: 'unsupported', message: `${feature}: 이 체인의 지원 설정이 없거나 꺼져 있습니다. 공개 조회 지원을 확인한 뒤 설정해야 합니다.` });
}
