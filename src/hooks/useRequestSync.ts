// src/hooks/useRequestSync.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { SongRequest } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

const FETCH_INTERVAL = 30000; // 30 seconds
const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export function useRequestSync(onUpdate: (requests: SongRequest[]) => void) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  
  // Refs for cleanup and state tracking
  const mountedRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();
  const lastDataRef = useRef<SongRequest[]>([]);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCountRef = useRef(0);
  
  // Constants for retry logic
  const MAX_RETRIES = 5;
  const INITIAL_RETRY_DELAY = 1000;
  
  // Enhanced fetch function with retry logic
  const fetchRequests = useCallback(async (isRetry = false) => {
    if (!mountedRef.current) return;
    
    try {
      // Create new abort controller
      abortControllerRef.current = new AbortController();
      
      // Get requests with requesters
      const { data: requests, error: requestError } = await supabase
        .from('requests')
        .select(`
          id,
          title,
          artist,
          votes,
          status,
          is_locked,
          is_played,
          created_at,
          requesters (
            id,
            name,
            photo,
            message,
            created_at
          )
        `)
        .order('created_at', { ascending: false });
        
      if (requestError) throw requestError;
      
      if (!mountedRef.current) return;
      
      // Transform data
      const transformedRequests = requests.map(request => ({
        id: request.id,
        title: request.title,
        artist: request.artist || '',
        votes: request.votes,
        status: request.status,
        isLocked: request.is_locked,
        isPlayed: request.is_played,
        createdAt: request.created_at,
        requesters: request.requesters.map(requester => ({
          id: requester.id,
          name: requester.name,
          photo: requester.photo,
          message: requester.message,
          createdAt: requester.created_at
        }))
      }));
      
      // Update state if mounted
      if (mountedRef.current) {
        lastDataRef.current = transformedRequests;
        onUpdate(transformedRequests);
        setLastFetchTime(Date.now());
        setError(null);
        setIsLoading(false);
        retryCountRef.current = 0;
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      
      if (!mountedRef.current) return;
      
      setError(error instanceof Error ? error : new Error('Failed to fetch requests'));
      
      // Implement retry logic
      if (retryCountRef.current < MAX_RETRIES && !isRetry) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        
        console.log(`Retrying fetch in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
        
        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            fetchRequests(true);
          }
        }, delay);
      } else {
        setIsLoading(false);
      }
    }
  }, [onUpdate]);

  // Set up realtime subscription
  const setupRealtimeSubscription = useCallback(() => {
    if (channelRef.current) return;
    
    try {
      // Subscribe to requests table
      channelRef.current = supabase
        .channel('requests-channel')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'requests'
        }, () => {
          // Fetch fresh data on any change
          if (mountedRef.current) {
            fetchRequests();
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Realtime subscription active');
          } else {
            console.log('❌ Realtime subscription status:', status);
          }
        });
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
      setError(error instanceof Error ? error : new Error('Failed to set up realtime subscription'));
    }
  }, [fetchRequests]);

  // Initialize data and subscriptions
  useEffect(() => {
    mountedRef.current = true;
    
    // Initial fetch
    fetchRequests();
    
    // Set up polling interval
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        // Only fetch if data is stale
        const timeSinceLastFetch = Date.now() - lastFetchTime;
        if (timeSinceLastFetch > STALE_THRESHOLD) {
          fetchRequests();
        }
      }
    }, FETCH_INTERVAL);
    
    // Set up realtime subscription
    setupRealtimeSubscription();
    
    // Cleanup function
    return () => {
      mountedRef.current = false;
      
      // Clear intervals and timeouts
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      // Abort any ongoing fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('Component unmounted');
      }
      
      // Remove enhanced realtime subscriptions
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [fetchRequests, setupRealtimeSubscription, lastFetchTime]);

  // Reconnection handler
  const reconnect = useCallback(() => {
    console.log('🔄 Attempting to reconnect...');
    
    // Reset error state
    setError(null);
    
    // Remove existing subscription
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    
    // Set up new subscription
    setupRealtimeSubscription();
    
    // Fetch fresh data
    fetchRequests();
  }, [fetchRequests, setupRealtimeSubscription]);

  return {
    isLoading,
    error,
    reconnect,
    lastData: lastDataRef.current
  };
}