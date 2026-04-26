import { VfetchClient } from './client';
import { VfetchConfig } from './types';

export * from './types';

export function createClient(config: VfetchConfig): VfetchClient {
  return new VfetchClient(config);
}
