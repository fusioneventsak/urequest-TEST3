// src/hooks/useUltraFastRequestSync.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { SongRequest } from '../types';

/**
 * Ultra-fast request sync hook optimized for immediate updates
 * Specifically designed for critical updates like song locking
 */
export function useUltraFastRequestSync(onUpdate: (requests: SongRequest[]) => void) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  
  const mountedRef = useRef(true);
  const channelRef = useRef<any>(null);
  const lastDataRef = useRef<SongRequest[]>([]);
  const fetchInProgressRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout>();

  // Ultra-fast fetch with minimal overhead
  const fetchRequests = useCallback(async (source = 'manual') => {
    if (!mountedRef.current || fetchInProgressRef.current) return;
    
    fetchInProgressRef.current = true;
    
    try {
      console.log(`🚀 Ultra-fast fetch triggered by: ${source}`);
      
      const startTime = Date.now();
      
      // Use the same query structure as the original hooks
      const { data: requests, error } = await supabase
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

      const fetchTime = Date.now() - startTime;
      console.log(`⚡ Fetch completed in ${fetchTime}ms`);

      if (error) throw error;
      if (!mountedRef.current) return;

      // Transform data to match existing SongRequest interface
      const transformedRequests = requests.map(request => ({
        id: request.id,
        title: request.title,
        artist: request.artist || '',
        votes: request.votes || 0,
        status: request.status,
        isLocked: request.is_locked || false,
        isPlayed: request.is_played || false,
        createdAt: new Date(request.created_at),
        requesters: request.requesters.map(requester => ({
          id: requester.id,
          name: requester.name,
          photo: requester.photo,
          message: requester.message,
          timestamp: new Date(requester.created_at)
        }))
      }));
      
      // Check if data actually changed to prevent unnecessary re-renders
      const dataChanged = JSON.stringify(transformedRequests) !== JSON.stringify(lastDataRef.current);
      
      if (dataChanged) {
        lastDataRef.current = transformedRequests;
        onUpdate(transformedRequests);
        console.log('📊 Data updated:', transformedRequests.length, 'requests');
      }
      
      setError(null);
      setIsLoading(false);
      
    } catch (error) {
      console.error('❌ Ultra-fast fetch error:', error);
      if (mountedRef.current) {
        setError(error instanceof Error ? error : new Error('Failed to fetch requests'));
      }
    } finally {
      fetchInProgressRef.current = false;
    }
  }, [onUpdate]);

  // Immediate real-time handler (no debouncing for critical updates)
  const handleRealtimeEvent = useCallback((payload: any) => {
    console.log('🔥 IMMEDIATE real-time event:', payload.eventType, payload.table);
    
    // For critical events like locking, fetch immediately
    if (payload.new?.is_locked !== payload.old?.is_locked || 
        payload.new?.is_played !== payload.old?.is_played) {
      console.log('🚨 CRITICAL UPDATE: Lock/Play status changed');
      fetchRequests('realtime-critical');
    } else {
      // For other events, still fetch quickly but with minimal delay
      setTimeout(() => fetchRequests('realtime-normal'), 50);
    }
  }, [fetchRequests]);

  // Setup ultra-fast realtime subscription
  const setupRealtimeSubscription = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    console.log('🔌 Setting up ultra-fast realtime subscription');
    
    channelRef.current = supabase
      .channel('ultra-fast-requests', {
        config: {
          broadcast: { self: true },
          presence: { key: 'ultra-fast-sync' }
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'requests'
      }, handleRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'requesters'
      }, (payload) => {
        console.log('👥 Requester change:', payload.eventType);
        fetchRequests('realtime-requesters');
      })
      .subscribe((status, error) => {
        console.log('📡 Subscription status:', status);
        if (error) {
          console.error('❌ Subscription error:', error);
          setConnectionStatus('disconnected');
          // Auto-reconnect after 1 second
          setTimeout(setupRealtimeSubscription, 1000);
        } else if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          console.log('✅ Ultra-fast realtime connected');
        } else {
          setConnectionStatus('connecting');
        }
      });

  }, [handleRealtimeEvent]);

  // Monitor connection health
  const monitorConnection = useCallback(() => {
    connectionCheckIntervalRef.current = setInterval(() => {
      if (channelRef.current) {
        const state = channelRef.current.state;
        if (state === 'closed' || state === 'errored') {
          console.log('💔 Connection lost, reconnecting...');
          setConnectionStatus('disconnected');
          setupRealtimeSubscription();
        }
      }
    }, 5000); // Check every 5 seconds
  }, [setupRealtimeSubscription]);

  // Reconnect function for manual retries
  const reconnect = useCallback(() => {
    console.log('🔄 Manual reconnect triggered');
    setConnectionStatus('connecting');
    setupRealtimeSubscription();
    fetchRequests('manual-reconnect');
  }, [setupRealtimeSubscription, fetchRequests]);

  // Initialize everything
  useEffect(() => {
    mountedRef.current = true;
    
    // Immediate initial fetch
    fetchRequests('initial');
    
    // Setup realtime subscription
    setupRealtimeSubscription();
    
    // Start connection monitoring
    monitorConnection();

    return () => {
      mountedRef.current = false;
      
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
    };
  }, [fetchRequests, setupRealtimeSubscription, monitorConnection]);

  // Handle visibility changes for immediate sync when app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        console.log('👀 App became visible, syncing immediately');
        fetchRequests('visibility-change');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchRequests]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 App came online, reconnecting');
      reconnect();
    };

    const handleOffline = () => {
      console.log('📴 App went offline');
      setConnectionStatus('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reconnect]);

  return { 
    isLoading, 
    error, 
    connectionStatus,
    reconnect,
    // Force refresh function for critical moments
    forceRefresh: () => fetchRequests('force-refresh')
  };
}