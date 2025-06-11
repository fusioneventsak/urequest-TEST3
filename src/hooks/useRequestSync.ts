import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { SongRequest } from '../types';

export function useRequestSync() {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const subscriptionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
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

      if (error) throw error;

      if (mountedRef.current) {
        const formattedRequests: SongRequest[] = (data || []).map(request => ({
          id: request.id,
          title: request.title,
          artist: request.artist || '',
          votes: request.votes || 0,
          status: request.status || 'pending',
          isLocked: request.is_locked || false,
          isPlayed: request.is_played || false,
          createdAt: new Date(request.created_at),
          requesters: (request.requesters || []).map((requester: any) => ({
            id: requester.id,
            name: requester.name,
            photo: requester.photo,
            message: requester.message || '',
            timestamp: new Date(requester.created_at)
          }))
        }));

        setRequests(formattedRequests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshRequests = useCallback(() => {
    fetchRequests();
  }, [fetchRequests]);

  const reconnect = useCallback(() => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    // Set up new subscription
    subscriptionRef.current = supabase
      .channel('requests_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'requests' },
        () => {
          if (mountedRef.current) {
            fetchRequests();
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'requesters' },
        () => {
          if (mountedRef.current) {
            fetchRequests();
          }
        }
      )
      .subscribe();
  }, [fetchRequests]);

  useEffect(() => {
    mountedRef.current = true;
    fetchRequests();
    reconnect();

    return () => {
      mountedRef.current = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [fetchRequests, reconnect]);

  return {
    requests,
    isLoading,
    refreshRequests,
    reconnect
  };
}