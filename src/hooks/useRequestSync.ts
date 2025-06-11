import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { cacheService } from '../utils/cache';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import type { SongRequest } from '../types';

const REQUESTS_CACHE_KEY = 'requests:all';

export function useRequestSync() {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRequests = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!bypassCache) {
        const cachedRequests = cacheService.get<SongRequest[]>(REQUESTS_CACHE_KEY);
        if (cachedRequests) {
          setRequests(cachedRequests);
          setIsLoading(false);
          return;
        }
      }

      const { data, error: fetchError } = await supabase
        .from('requests')
        .select(`
          *,
          requesters (
            id,
            name,
            photo,
            message,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formattedRequests = data.map(request => ({
        id: request.id,
        title: request.title,
        artist: request.artist || '',
        votes: request.votes || 0,
        status: request.status || 'pending',
        isLocked: request.is_locked || false,
        isPlayed: request.is_played || false,
        createdAt: request.created_at, // Keep as string for consistency with DB
        requesters: (request.requesters || []).map(requester => ({
          id: requester.id,
          name: requester.name,
          photo: requester.photo,
          message: requester.message || '',
          timestamp: requester.created_at // Keep as string for consistency with DB
        }))
      }));
      
      cacheService.setRequests(REQUESTS_CACHE_KEY, formattedRequests);
      setRequests(formattedRequests);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();

    const subscription = enhancedRealtimeManager.createSubscription(
      'requests',
      () => fetchRequests(true)
    );
    const requestersSubscription = enhancedRealtimeManager.createSubscription(
      'requesters',
      () => fetchRequests(true)
    );

    return () => {
      enhancedRealtimeManager.removeSubscription(subscription);
      enhancedRealtimeManager.removeSubscription(requestersSubscription);
    };
  }, [fetchRequests]);

  const refreshRequests = useCallback(() => {
    fetchRequests(true);
  }, [fetchRequests]);

  return { requests, isLoading, error, refreshRequests };
}