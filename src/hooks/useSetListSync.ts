import { useEffect, useCallback, useState, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { cacheService } from '../utils/cache';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import type { SetList } from '../types';

const SET_LISTS_CACHE_KEY = 'setLists:all';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

export function useSetListSync() {
  const [setLists, setSetLists] = useState<SetList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const setListsSubscriptionRef = useRef<string | null>(null);
  const setListSongsSubscriptionRef = useRef<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInProgressRef = useRef(false);

  // Fetch set lists with simple error handling
  const fetchSetLists = useCallback(async (bypassCache = false) => {
    // Don't allow concurrent fetches
    if (fetchInProgressRef.current) {
      console.log('Fetch already in progress, skipping');
      return;
    }
    
    fetchInProgressRef.current = true;
    
    try {
      if (!mountedRef.current) return;
      
      setIsLoading(true);
      setError(null);

      // Check cache first unless bypassing
      if (!bypassCache) {
        const cachedSetLists = cacheService.get<SetList[]>(SET_LISTS_CACHE_KEY);
        if (cachedSetLists?.length > 0) {
          console.log('Using cached set lists');
          if (mountedRef.current) {
            setSetLists(cachedSetLists);
            setIsLoading(false);
          }
          return;
        }
      }

      // Fetch set lists with songs
      console.log('Fetching set lists with songs...');
      const { data: setListsData, error: setListsError } = await supabase
        .from('set_lists')
        .select(`
          *,
          set_list_songs (
            position,
            song:songs(*)
          )
        `)
        .order('created_at', { ascending: false });

      if (setListsError) throw setListsError;

      if (setListsData && mountedRef.current) {
        const formattedSetLists = setListsData.map(setList => ({
          id: setList.id,
          name: setList.name || 'Unnamed Set List',
          date: new Date(setList.date),
          notes: setList.notes || '',
          isActive: setList.is_active || false,
          songs: setList.set_list_songs
            ? setList.set_list_songs
              .sort((a: any, b: any) => a.position - b.position)
              .map((item: any) => item.song)
              .filter(Boolean)
            : []
        }));

        cacheService.setSetLists(SET_LISTS_CACHE_KEY, formattedSetLists);
        setSetLists(formattedSetLists);
        retryCountRef.current = 0;
      }
    } catch (error) {
      console.error('Error fetching set lists:', error);
      
      if (mountedRef.current) {
        setError(error instanceof Error ? error : new Error(String(error)));
        
        // Use cached data if available
        const cachedSetLists = cacheService.get<SetList[]>(SET_LISTS_CACHE_KEY);
        if (cachedSetLists) {
          console.warn('Using stale cache due to fetch error');
          setSetLists(cachedSetLists);
        }
        
        // Retry with exponential backoff
        if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
          const delay = RETRY_DELAY * Math.pow(2, retryCountRef.current);
          console.log(`Retrying in ${delay}ms (attempt ${retryCountRef.current + 1}/${MAX_RETRY_ATTEMPTS})`);
          
          if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
          }
          
          fetchTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              retryCountRef.current++;
              fetchSetLists(true);
            }
          }, delay);
        }
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      fetchInProgressRef.current = false;
    }
  }, []);

  // Setup realtime subscriptions
  useEffect(() => {
    mountedRef.current = true;
    
    // Initialize enhancedRealtimeManager
    try {
      enhancedRealtimeManager.init().catch(error => {
        console.warn('Error initializing realtime manager, falling back to polling:', error);
      });
    } catch (error) {
      console.warn('Error initializing realtime manager, falling back to polling:', error);
    }
    
    // Setup subscriptions
    const setupSubscriptions = () => {
      try {
        // Subscribe to set_lists table
        const setListsSub = enhancedRealtimeManager.createSubscription(
          'set_lists',
          (payload) => {
            console.log('Set lists changed:', payload.eventType);
            fetchSetLists(true);
          }
        );
        
        // Subscribe to set_list_songs table
        const setListSongsSub = enhancedRealtimeManager.createSubscription(
          'set_list_songs',
          (payload) => {
            console.log('Set list songs changed:', payload.eventType);
            fetchSetLists(true);
          }
        );
        
        setListsSubscriptionRef.current = setListsSub;
        setListSongsSubscriptionRef.current = setListSongsSub;
      } catch (error) {
        console.error('Error setting up realtime subscriptions:', error);
      }
    };
    
    // Initial fetch and subscription setup
    fetchSetLists();
    setupSubscriptions();
    
    // Setup periodic refresh
    const refreshInterval = setInterval(() => {
      if (mountedRef.current) {
        fetchSetLists(true);
      }
    }, 300000); // Refresh every 5 minutes
    
    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      
      // Clear any pending timeouts
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      // Clear refresh interval
      clearInterval(refreshInterval);
      
      // Remove subscriptions
      if (setListsSubscriptionRef.current) {
        enhancedRealtimeManager.removeSubscription(setListsSubscriptionRef.current);
      }
      
      if (setListSongsSubscriptionRef.current) {
        enhancedRealtimeManager.removeSubscription(setListSongsSubscriptionRef.current);
      }
    };
  }, [fetchSetLists]);

  return { 
    setLists,
    isLoading, 
    error, 
    refreshSetLists: () => fetchSetLists(true) 
  };
}