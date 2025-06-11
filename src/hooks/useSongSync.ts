import { useEffect, useCallback, useState, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { cacheService } from '../utils/cache';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import type { Song } from '../types';

const SONGS_CACHE_KEY = 'songs:all';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

export function useSongSync() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const subscriptionRef = useRef<string | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInProgressRef = useRef(false);

  // Fetch songs with simple error handling
  const fetchSongs = useCallback(async (bypassCache = false) => {
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
        const cachedSongs = cacheService.get<Song[]>(SONGS_CACHE_KEY);
        if (cachedSongs?.length > 0) {
          console.log('Using cached songs');
          if (mountedRef.current) {
            setSongs(cachedSongs);
            setIsLoading(false);
          }
          return;
        }
      }

      // Fetch songs
      console.log('Fetching songs...');
      const { data: songsData, error: songsError } = await supabase
        .from('songs')
        .select('*')
        .order('title');

      if (songsError) throw songsError;

      if (songsData && mountedRef.current) {
        cacheService.setSongs(SONGS_CACHE_KEY, songsData);
        setSongs(songsData);
        retryCountRef.current = 0;
      }
    } catch (error) {
      console.error('Error fetching songs:', error);
      
      if (mountedRef.current) {
        setError(error instanceof Error ? error : new Error(String(error)));
        
        // Use cached data if available
        const cachedSongs = cacheService.get<Song[]>(SONGS_CACHE_KEY);
        if (cachedSongs) {
          console.warn('Using stale cache due to fetch error');
          setSongs(cachedSongs);
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
              fetchSongs(true);
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

  // Setup realtime subscription
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
    
    // Setup subscription
    const setupSubscription = () => {
      try {
        const subscription = enhancedRealtimeManager.createSubscription(
          'songs',
          (payload) => {
            console.log('Songs changed:', payload.eventType);
            fetchSongs(true);
          }
        );
        
        subscriptionRef.current = subscription;
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
      }
    };
    
    // Initial fetch and subscription setup
    fetchSongs();
    setupSubscription();
    
    // Setup periodic refresh
    const refreshInterval = setInterval(() => {
      if (mountedRef.current) {
        fetchSongs(true);
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
      
      // Remove subscription
      if (subscriptionRef.current) {
        enhancedRealtimeManager.removeSubscription(subscriptionRef.current);
      }
    };
  }, [fetchSongs]);

  const refreshSongs = useCallback(() => {
    fetchSongs(true);
  }, [fetchSongs]);

  return { 
    songs,
    setSongs,
    isLoading, 
    error, 
    refreshSongs
  };
}