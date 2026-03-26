import { useState, useCallback, useEffect } from 'react';
import { ApiResult } from '../types';

/**
 * Custom hook for fetching data from API
 * @param fetcher Function that returns a promise of ApiResult
 * @param deps Optional dependency array to trigger refetch
 * @returns Object with data, error, loading state and refetch function
 */
export function useApi<T>(
  fetcher: () => Promise<ApiResult<T>>,
  deps?: any[]
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();

      if ('data' in result && result.data !== undefined) {
        setData(result.data);
        setError(null);
      } else if ('error' in result && result.error) {
        setData(null);
        setError(result.error.message);
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    fetch();
  }, deps ? [...deps] : [fetch]);

  const refetch = useCallback(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    error,
    loading,
    refetch,
  };
}
