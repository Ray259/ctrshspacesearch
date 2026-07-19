import type { AiSearchResponse } from '../../../../shared/types';

export interface AiSearchStrategy {
  search(query: string, onUpdate?: (intent: string) => void): Promise<AiSearchResponse>;
}
