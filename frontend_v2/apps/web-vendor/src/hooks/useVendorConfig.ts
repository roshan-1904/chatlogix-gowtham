import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@chatlogix/auth';
import { apiClient } from '../lib/api';

export interface VendorConfig {
  id: string;
  businessName: string;
  plan: string;
  status: string;
  walletBalance: number;
  category: string | null;
  catalogImportEnabled: boolean;
  ai: Record<string, unknown>;
}

export function useVendorConfig() {
  const { user } = useAuth();
  const vendorId = user?.vendorId;
  return useQuery({
    queryKey: ['vendor', vendorId, 'config'],
    queryFn: () => apiClient.get<VendorConfig>(`/vendors/${vendorId}/config`),
    enabled: !!vendorId,
    staleTime: 5 * 60 * 1000 // 5 min — config rarely changes mid-session
  });
}

/**
 * Returns `undefined` while the vendor config is loading, then `true`/`false`.
 * Callers should render a neutral state until this resolves so the
 * "not enabled" message doesn't flash during the first fetch.
 */
export function useCatalogImportEnabled(): boolean | undefined {
  const { data, isLoading } = useVendorConfig();
  if (isLoading && !data) return undefined;
  return !!data?.catalogImportEnabled;
}
