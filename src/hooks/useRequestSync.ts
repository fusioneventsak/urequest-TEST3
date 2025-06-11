import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { cacheService } from '../utils/cache';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import type { SongRequest } from '../types';
import { backOff } from 'exponential-backoff';

const REQUESTS_CACHE_KEY = 'requests:all';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // Base delay in milliseconds

// Configure retry options
const RETRY_OPTIONS = {
  numOfAttempts: MAX_RETRY_ATTEMPTS,
  startingDelay: RETRY_DELAY,
  timeMultiple: 2,
  maxDelay: 5000,
  retry: (error: any) => {
    // Only retry on network errors
    return error instanceof TypeError && 
           (error.message.includes('Failed to fetch') || 
            error.message.includes('NetworkError') ||
            error.message.includes('network'));
  }
};

export function useRequestSync() {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const retryCountRef = useRef(0);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRequests = useCallback(async (bypassCache = false, retryAttempt = 0) => {
    setIsLoading(true);
    setError(null);
    
    // Create a fresh abort controller for this request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('New request started');
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      if (!bypassCache && retryAttempt === 0) {
        const cachedRequests = cacheService.get<SongRequest[]>(REQUESTS_CACHE_KEY);
        if (cachedRequests) {
          setRequests(cachedRequests);
          setIsLoading(false);
          return;
        }
      }

      // Use exponential backoff for the fetch operation
      const { data, error: fetchError } = await backOff(() => 
        supabase
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
          .order('created_at', { ascending: false })
          .abortSignal(signal),
        RETRY_OPTIONS
      );

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
      retryCountRef.current = 0; // Reset retry count on success
      
      // Clear any pending retry timeout
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    } catch (err) {
      console.error(`Error fetching requests (attempt ${retryAttempt + 1}):`, err);
      
      // Check if this is a network error and we haven't exceeded max retries
      const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
      
      if (isNetworkError && retryAttempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY * Math.pow(2, retryAttempt); // Exponential backoff
        console.log(`Retrying in ${delay}ms... (attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        fetchTimeoutRef.current = setTimeout(() => {
          fetchRequests(bypassCache, retryAttempt + 1);
        }, delay);
        
        return; // Don't set error state yet, we're retrying
      }
      
      // If we've exhausted retries or it's not a network error, set the error
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      
      // Clean up abort controller
      setTimeout(() => {
        if (abortControllerRef.current && abortControllerRef.current.signal === signal) {
          abortControllerRef.current = null;
        }
      }, 0);
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
      // Clean up timeout on unmount
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('Component unmounted');
      }
      
      enhancedRealtimeManager.removeSubscription(subscription);
      enhancedRealtimeManager.removeSubscription(requestersSubscription);
    };
  }, [fetchRequests]);

  const refreshRequests = useCallback(() => {
    // Clear any pending retry timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    // Abort any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('Manual refresh');
    }
    retryCountRef.current = 0;
    fetchRequests(true);
  }, [fetchRequests]);

  return { requests, isLoading, error, refreshRequests };
}