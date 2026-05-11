import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { useAuth } from '@chatlogix/auth';
import type { DashboardStats, DateRangePreset } from '../../types/dashboard';

export function useDashboardStats() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get date range from URL params or default to 'thisMonth'
  const dateRangePreset = (searchParams.get('dateRange') as DateRangePreset) || 'thisMonth';
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Use ref to track abort controller and prevent memory leaks
  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user?.vendorId) {
      setIsLoading(false);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);
      
      // Build query params
      const params = new URLSearchParams({ dateRange: dateRangePreset });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      
      const data = await apiClient.get<DashboardStats>(
        `/vendors/${user.vendorId}/dashboard-stats?${params.toString()}`,
        { signal: abortControllerRef.current.signal }
      );
      
      setStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      setError(err instanceof Error ? err.message : 'Failed to load dashboard stats');
      console.error('Dashboard stats error:', err);
      
      // Keep previous stats on error (show stale data with refresh indicator)
    } finally {
      setIsLoading(false);
    }
  }, [user?.vendorId, dateRangePreset, startDate, endDate]);

  useEffect(() => {
    // Initial fetch
    fetchStats();
    
    // Refresh every 30 seconds
    intervalIdRef.current = setInterval(fetchStats, 30000);
    
    // Cleanup
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current?.abort();
      }
    };
  }, [fetchStats]);

  const refetch = useCallback(async () => {
    if (!user?.vendorId) return;
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ dateRange: dateRangePreset });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      
      const data = await apiClient.get<DashboardStats>(
        `/vendors/${user.vendorId}/dashboard-stats?${params.toString()}`,
        { signal: controller.signal }
      );
      
      setStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.vendorId, dateRangePreset, startDate, endDate]);

  const setDateRange = useCallback((preset: DateRangePreset, customStart?: string, customEnd?: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('dateRange', preset);
    
    if (preset === 'custom' && customStart && customEnd) {
      newParams.set('startDate', customStart);
      newParams.set('endDate', customEnd);
    } else {
      newParams.delete('startDate');
      newParams.delete('endDate');
    }
    
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  return { 
    stats, 
    isLoading, 
    error, 
    lastUpdated,
    refetch,
    dateRangePreset,
    startDate,
    endDate,
    setDateRange
  };
}

