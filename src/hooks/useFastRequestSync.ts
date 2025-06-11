import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { SongRequest } from '../types';

const INITIAL_FETCH_TIMEOUT = 5000; // 5 seconds max for initial load
const REALTIME_DEBOUNCE = 100; // 100ms debounce for real-time updates

export function useFastRequestSync(onUpdate: (requests: SongRequest[]) => void) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const channelRef = useRef<any>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const lastFetchRef = useRef<number>(0);

  // Fast debounced fetch function
  const debouncedFetch = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      const now = Date.now();
      // Prevent fetching more than once per 500ms
      if (now - lastFetchRef.current < 500) return;
      
      lastFetchRef.current = now;
      
      try {
        const { data, error } = await supabase
          .from('requests')
          .select(`
            id, title, artist, votes, status, is_locked, is_played, created_at,
            requesters (id, name, photo, message, created_at)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!mountedRef.current) return;

        const transformedRequests = data.map(request => ({
          id: request.id,
          title: request.title,
          artist: request.artist || '',
          votes: request.votes,
          status: request.status,
          isLocked: request.is_locked,
          isPlayed: request.is_played,
          createdAt: new Date(request.created_at),
          requesters: request.requesters.map(r => ({
            id: r.id,
            name: r.name,
            photo: r.photo,
            message: r.message,
            timestamp: new Date(r.created_at)
          }))
        }));

        onUpdate(transformedRequests);
        setError(null);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching requests:', error);
        if (mountedRef.current) {
          setError(error instanceof Error ? error : new Error('Failed to fetch requests'));
          setIsLoading(false);
        }
      }
    }, REALTIME_DEBOUNCE);
  }, [onUpdate]);

  // Initial fetch
  const fetchRequests = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), INITIAL_FETCH_TIMEOUT);

      const { data, error } = await supabase
        .from('requests')
        .select(`
          id, title, artist, votes, status, is_locked, is_played, created_at,
          requesters (id, name, photo, message, created_at)
        `)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);
      
      if (error) throw error;
      if (!mountedRef.current) return;

      const transformedRequests = data.map(request => ({
        id: request.id,
        title: request.title,
        artist: request.artist || '',
        votes: request.votes,
        status: request.status,
        isLocked: request.is_locked,
        isPlayed: request.is_played,
        createdAt: new Date(request.created_at),
        requesters: request.requesters.map(r => ({
          id: r.id,
          name: r.name,
          photo: r.photo,
          message: r.message,
          timestamp: new Date(r.created_at)
        }))
      }));

      onUpdate(transformedRequests);
      setIsLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error in initial fetch:', error);
      if (mountedRef.current) {
        setError(error instanceof Error ? error : new Error('Failed to fetch requests'));
        setIsLoading(false);
      }
    }
  }, [onUpdate]);

  // Set up real-time subscription with minimal latency
  useEffect(() => {
    mountedRef.current = true;
    
    // Initial fetch
    fetchRequests();

    // Set up real-time subscription
    channelRef.current = supabase
      .channel('fast-requests-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'requests'
      }, () => {
        // Immediate update with minimal debounce
        debouncedFetch();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public', 
        table: 'requesters'
      }, () => {
        // Also listen to requester changes for vote updates
        debouncedFetch();
      })
      .subscribe((status) => {
        console.log('Fast subscription status:', status);
      });

    return () => {
      mountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [fetchRequests, debouncedFetch]);

  const reconnect = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }
    fetchRequests();
    
    // Re-setup subscription
    channelRef.current = supabase
      .channel('fast-requests-channel-reconnect')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requesters' }, debouncedFetch)
      .subscribe();
  }, [fetchRequests, debouncedFetch]);

  return { isLoading, error, reconnect };
}