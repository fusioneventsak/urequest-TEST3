// src/hooks/useRequestSync.ts
import { useEffect, useCallback, useState, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { cacheService } from '../utils/cache';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import type { SongRequest } from '../types';

const REQUESTS_CACHE_KEY = 'requests:all';
const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

// Reduced refresh intervals for faster updates
const REFRESH_INTERVALS = {
  FAST: 15000,    // 15 seconds for high-priority updates
  NORMAL: 30000,  // 30 seconds for normal updates
  SLOW: 60000     // 60 seconds for background updates
};

export function useRequestSync(onUpdate: (requests: SongRequest[]) => void) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  
  const mountedRef = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchInProgressRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const lastFetchTimeRef = useRef<number>(0);
  
  // Subscription references
  const requestsSubscriptionRef = useRef<string | null>(null);
  const requestersSubscriptionRef = useRef<string | null>(null);

  // Track network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Immediately fetch when coming back online
      fetchRequests(true);
    };
    
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Optimized fetch function with better error handling and caching
  const fetchRequests = useCallback(async (bypassCache: boolean = false) => {
    if (fetchInProgressRef.current) {
      console.log('⏭️ Fetch already in progress, skipping');
      return;
    }

    // Rate limiting - don't fetch more than once every 2 seconds
    const now = Date.now();
    if (!bypassCache && (now - lastFetchTimeRef.current) < 2000) {
      console.log('⏭️ Rate limited, skipping fetch');
      return;
    }

    fetchInProgressRef.current = true;
    lastFetchTimeRef.current = now;

    try {
      // Cancel any existing request
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (error) {
          console.warn('Error aborting previous request:', error);
        }
      }
      
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      if (mountedRef.current) {
        setError(null);
        
        // Only show loading for initial fetch or after errors
        if (isLoading || error) {
          setIsLoading(true);
        }
      }

      // Check if we should use cache first
      if (!bypassCache && isOnline) {
        const cachedRequests = cacheService.get<SongRequest[]>(REQUESTS_CACHE_KEY);
        if (cachedRequests && (now - lastUpdateTime) < 5000) {
          console.log('📦 Using recent cache');
          onUpdate(cachedRequests);
          fetchInProgressRef.current = false;
          return;
        }
      }

      console.log('🔄 Fetching requests from database...');

      // Optimized query with better joins and selective fields
      const { data: requestsData, error: fetchError } = await supabase
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
          requesters!inner (
            id,
            name,
            photo,
            message,
            created_at
          )
        `)
        .eq('is_played', false)
        .order('created_at', { ascending: true })
        .abortSignal(signal);

      if (signal.aborted) return;

      if (fetchError) {
        throw fetchError;
      }

      if (mountedRef.current) {
        console.log('✅ Requests fetched successfully:', requestsData?.length);
        
        // Transform and format the data
        const formattedRequests = (requestsData || []).map(request => ({
          id: request.id,
          title: request.title,
          artist: request.artist || '',
          votes: request.votes || 0,
          status: request.status || 'pending',
          isLocked: request.is_locked || false,
          isPlayed: request.is_played || false,
          createdAt: new Date(request.created_at).toISOString(),
          requesters: (request.requesters || []).map(requester => ({
            id: requester.id,
            name: requester.name,
            photo: requester.photo,
            message: requester.message || '',
            timestamp: new Date(requester.created_at).toISOString()
          }))
        }));

        // Update cache with fresh data
        cacheService.setRequests(REQUESTS_CACHE_KEY, formattedRequests);
        
        // Update state
        onUpdate(formattedRequests);
        setLastUpdateTime(now);
        setIsLoading(false);
        retryCountRef.current = 0; // Reset retry count on success
      }
    } catch (error) {
      // Handle AbortError specifically - this is expected during component unmount
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🛑 Request gracefully aborted');
        return;
      }
      
      if (signal?.aborted) {
        console.log('🛑 Request aborted');
        return;
      }

      console.error('❌ Error fetching requests:', error);
      
      if (mountedRef.current) {
        setError(error instanceof Error ? error : new Error(String(error)));
        
        // Use cached data if available during errors
        const cachedRequests = cacheService.get<SongRequest[]>(REQUESTS_CACHE_KEY);
        if (cachedRequests) {
          console.warn('📦 Using stale cache due to fetch error');
          onUpdate(cachedRequests);
        }
        
        // Implement exponential backoff retry
        if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
          const delay = RETRY_DELAY * Math.pow(2, retryCountRef.current);
          console.log(`🔄 Retrying in ${delay}ms (attempt ${retryCountRef.current + 1}/${MAX_RETRY_ATTEMPTS})`);
          
          if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
          }
          
          fetchTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              retryCountRef.current++;
              fetchRequests(true);
            }
          }, delay);
        } else {
          setIsLoading(false);
        }
      }
    } finally {
      fetchInProgressRef.current = false;
    }
  }, [onUpdate, isLoading, error, lastUpdateTime, isOnline]);

  // Enhanced realtime update handler with smart refresh logic
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, table, new: newRecord, old: oldRecord } = payload;
    
    console.log(`🔔 Realtime update: ${table} ${eventType}`, {
      new: newRecord,
      old: oldRecord
    });

    // Smart refresh logic based on the type of change
    const isLockChange = newRecord?.is_locked !== oldRecord?.is_locked;
    const isHighPriorityChange = isLockChange || eventType === 'INSERT' || eventType === 'DELETE';
    
    if (isHighPriorityChange) {
      console.log('⚡ High priority change detected - immediate refresh');
      // Clear cache and fetch immediately for critical changes
      cacheService.del(REQUESTS_CACHE_KEY);
      fetchRequests(true);
    } else {
      console.log('📝 Normal priority change - delayed refresh');
      // Debounced refresh for normal changes
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      fetchTimeoutRef.current = setTimeout(() => {
        fetchRequests(true);
      }, 1000); // 1 second delay for normal changes
    }
  }, [fetchRequests]);

  // Setup enhanced realtime subscriptions and intervals
  useEffect(() => {
    mountedRef.current = true;
    
    const initializeSync = async () => {
      try {
        // Initialize the enhanced realtime manager
        try {
          await enhancedRealtimeManager.init();
        } catch (error) {
          console.warn('Error initializing realtime manager, falling back to polling:', error);
        }
        
        // Setup high-priority subscription for requests table
        requestsSubscriptionRef.current = enhancedRealtimeManager.createSubscription(
          'requests',
          handleRealtimeUpdate,
          { event: '*', schema: 'public', table: 'requests' },
          'high' // High priority for queue locks
        );
        
        // Setup high-priority subscription for requesters table
        requestersSubscriptionRef.current = enhancedRealtimeManager.createSubscription(
          'requesters',
          handleRealtimeUpdate,
          { event: '*', schema: 'public', table: 'requesters' },
          'high' // High priority for new requests
        );
        
        console.log('✅ Enhanced realtime subscriptions setup complete');
        
      } catch (error) {
        console.error('❌ Error setting up enhanced realtime subscriptions:', error);
        // Fallback to regular intervals
        setupFallbackPolling();
      }
    };

    const setupFallbackPolling = () => {
      console.log('🔄 Setting up fallback polling');
      refreshIntervalRef.current = setInterval(() => {
        if (mountedRef.current && isOnline) {
          fetchRequests(true);
        }
      }, REFRESH_INTERVALS.FAST); // 15-second fallback polling
    };

    const setupAdaptiveRefresh = () => {
      // Adaptive refresh interval based on recent activity
      const setupInterval = () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
        
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const interval = timeSinceLastUpdate < 60000 ? 
          REFRESH_INTERVALS.FAST :   // Fast refresh if recent activity
          REFRESH_INTERVALS.NORMAL;  // Normal refresh otherwise
        
        refreshIntervalRef.current = setInterval(() => {
          if (mountedRef.current && isOnline) {
            fetchRequests(false); // Use cache when possible
          }
        }, interval);
        
        console.log(`📡 Adaptive refresh interval set to ${interval}ms`);
      };
      
      setupInterval();
      
      // Readjust interval every 2 minutes
      const adaptiveIntervalRef = setInterval(setupInterval, 120000);
      
      return () => clearInterval(adaptiveIntervalRef);
    };

    // Initial data fetch
    fetchRequests();
    
    // Initialize enhanced realtime
    initializeSync();
    
    // Setup adaptive refresh intervals
    const cleanupAdaptive = setupAdaptiveRefresh();
    
    // Cleanup function
    return () => {
      mountedRef.current = false;
      
      // Clear timeouts and intervals
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      
      // Cleanup adaptive refresh
      cleanupAdaptive();
      
      // Abort any ongoing fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Remove enhanced realtime subscriptions
      if (requestsSubscriptionRef.current) {
        enhancedRealtimeManager.removeSubscription(requestsSubscriptionRef.current);
      }
      
      if (requestersSubscriptionRef.current) {
        enhancedRealtimeManager.removeSubscription(requestersSubscriptionRef.current);
      }
    };
  }, [fetchRequests, handleRealtimeUpdate, lastUpdateTime, isOnline]);

  // Manual reconnection function
  const reconnect = useCallback(async () => {
    console.log('🔄 Manual reconnection requested');
    setError(null);
    
    try {
      await enhancedRealtimeManager.reconnect();
      fetchRequests(true);
    } catch (error) {
      console.error('❌ Manual reconnection failed:', error);
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [fetchRequests]);

  return {
    isLoading,
    error,
    isOnline,
    lastUpdateTime,
    refetch: () => fetchRequests(true),
    reconnect
  };
}