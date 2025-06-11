// src/utils/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { backOff } from 'exponential-backoff';

// Validate environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Configure retry options
const RETRY_OPTIONS = {
  numOfAttempts: 3,
  startingDelay: 1000,
  timeMultiple: 2,
  maxDelay: 10000,
  retry: (error: any) => {
    // Only retry on network errors or 5xx server errors
    const isNetworkError = error.message?.includes('Failed to fetch') || 
                          error.message?.includes('NetworkError') ||
                          error.message?.includes('network');
    const isServerError = error.status >= 500 && error.status < 600;
    return isNetworkError || isServerError;
  }
};

// Custom fetch function with retry logic
const fetchWithRetry = async (url: string, options: RequestInit) => {
  try {
    return await backOff(() => fetch(url, options), RETRY_OPTIONS);
  } catch (error) {
    console.error('Fetch failed after retries:', error);
    throw error;
  }
};

// Create Supabase client with improved configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false // Prevent auto-detection of auth params in URL
  },
  global: {
    headers: {
      'X-Client-Info': 'song-request-app/1.0.2',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // Increased from 5 to improve realtime responsiveness
    },
    reconnect: true, // Enable automatic reconnection
    timeout: 30000, // Increase timeout to 30 seconds
  },
  db: {
    schema: 'public'
  },
  // Add request timeouts to prevent hanging requests
  fetch: async (url, options) => {
    const controller = new AbortController();
    const { signal } = controller;
    
    // Set a timeout to abort the request after 15 seconds
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);
    
    try {
      // Use our custom fetch with retry logic
      const response = await fetchWithRetry(url, { ...options, signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
});

// Helper function to handle Supabase errors
export function handleSupabaseError(error: any): never {
  console.error('Supabase error:', error);
  const errorMessage = error?.message || error?.error_description || 'Database operation failed';
  throw new Error(errorMessage);
}

// Execute a database operation with proper error handling
export async function executeDbOperation<T>(
  operationKey: string,
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  try {
    // Check if the operation is already aborted
    if (signal?.aborted) {
      const abortError = new Error('Operation aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    // Check network status
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Instead of throwing immediately, try the operation anyway
      // It might work on flaky connections where navigator.onLine is unreliable
      console.warn('Network appears to be offline, but trying operation anyway');
    }

    // Add timeout protection
    const operationPromise = operation();
    
    if (signal) {
      // Create a race between the operation and the abort signal
      const abortPromise = new Promise<T>((_, reject) => {
        const abortHandler = () => {
          const abortError = new Error('Operation aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        };
        
        // Use addEventListener with once option to prevent memory leaks
        signal.addEventListener('abort', abortHandler, { once: true });
      });
      
      // Use Promise.race to handle whichever resolves/rejects first
      return await Promise.race([operationPromise, abortPromise]);
    } else {
      return await operationPromise;
    }
  } catch (error: any) {
    // Handle AbortError silently - this is expected when component unmounts
    if (error.name === 'AbortError' || error.message?.includes('aborted') || 
        error.message?.includes('Component unmounted')) {
      console.log(`Request aborted for ${operationKey}`);
      return { data: null, error: null } as unknown as T;
    }

    // Handle component unmount silently
    if (error.message?.includes('Component unmounted')) {
      console.log(`Operation cancelled - component unmounted: ${operationKey}`);
      return { data: null, error: null } as unknown as T;
    }

    // Handle timeout errors
    if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
      console.error(`Operation timed out: ${operationKey}`);
      throw new Error(`Operation timed out: ${operationKey}`);
    }

    // Handle network errors
    if (error.message?.includes('network') || 
        error.name === 'NetworkError' || 
        error.message?.includes('fetch') || 
        (typeof navigator !== 'undefined' && !navigator.onLine)) {
      console.error(`Network error during operation: ${operationKey}`);
      // Throw a more specific error that can be handled by the UI
      const networkError = new Error(`Network error: ${error.message || 'Failed to connect to server'}`);
      networkError.name = 'NetworkError';
      throw networkError;
    }

    // Log the error with context
    console.error(`DB operation "${operationKey}" failed:`, {
      error,
      name: error.name,
      message: error.message,
      stack: error.stack,
      context: operationKey,
      url: error.requestUrl || 'unknown'
    });

    // Throw a properly formatted error
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`DB operation "${operationKey}" failed: ${String(error)}`);
    }
  }
}

// Format request data for consistent handling
export function formatRequestData(request: any) {
  return {
    ...request,
    requesters: request.requesters?.map((requester: any) => ({
      ...requester,
      timestamp: new Date(requester.created_at)
    })) || []
  };
}

// Format set list data for consistent handling
export function formatSetListData(setList: any) {
  return {
    ...setList,
    date: new Date(setList.date),
    songs: setList.set_list_songs
      ?.sort((a: any, b: any) => a.position - b.position)
      .map((item: any) => item.song) || []
  };
}