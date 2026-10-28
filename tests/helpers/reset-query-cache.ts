import { afterEach } from 'vitest';
import { invalidateQueryReads } from '@/services/clients';
import { clearLiveTransactionCache } from '@/services/guru/live-history.service';
afterEach(() => { invalidateQueryReads(); clearLiveTransactionCache(); });
