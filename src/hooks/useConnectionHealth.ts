import { useState, useEffect, useRef, useCallback } from 'react';
import { enhancedRealtimeManager } from '../utils/realtimeManager';
import { toast } from 'react-hot-toast';

/**
 * Custom hook to monitor connection health and auto-reconnect when needed
 */
export function useConnectionHealth() {
  const [status, setStatus] = useState<'good' | 'disconnected'>('good');
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const statusRef = useRef<string>('good');
  
  // Update the ref whenever the state changes
  useEffect(() => {
    lastUpdateTimeRef.current = lastUpdateTime;
    statusRef.current = status;
  }, [lastUpdateTime]);
  
  // Register data update
  const registerUpdate = () => {
    const now = Date.now();
    setLastUpdateTime(now);
    lastUpdateTimeRef.current = now;
    setStatus('good');
  };
  
  // Monitor connection health
  useEffect(() => {
    const healthCheck = setInterval(() => {
      const now = Date.now();
      const lastUpdate = lastUpdateTimeRef.current;
      
      // Auto-reconnect if no updates for 30 seconds
      if (now - lastUpdate > 30000 && !isReconnecting) {
        console.warn('No updates received for 30 seconds, attempting reconnection');
        setIsReconnecting(true);
        enhancedRealtimeManager.reconnect()
          .then(() => {
            setIsReconnecting(false);
            if (statusRef.current === 'disconnected') {
            }
          })
          .catch(() => {
            setIsReconnecting(false);
          });
        setReconnectAttempts(prev => prev + 1);
      } else {
        setStatus('good');
      }
    }, 10000); // Check less frequently to reduce overhead
    
    // Listen for connection state changes
    const handleConnectionChange = (state: string) => {
      if (state === 'connected') {
        setStatus('good');
        if (statusRef.current === 'disconnected') {
        }
      } else if (state === 'disconnected') {
        setStatus('disconnected');
      } else if (state === 'error') {
        setStatus('disconnected');
      }
    };
    
    enhancedRealtimeManager.addConnectionListener(handleConnectionChange);
    
    return () => {
      clearInterval(healthCheck);
      enhancedRealtimeManager.removeConnectionListener(handleConnectionChange);
    };
  }, []);
  
  const manualReconnect = useCallback(async () => {
    if (isReconnecting) return;
    
    setIsReconnecting(true);
    
    try {
      await enhancedRealtimeManager.reconnect();
      setStatus('good');
    } catch (error) {
      console.error('Manual reconnection failed:', error);
    } finally {
      setIsReconnecting(false);
    }
  }, [isReconnecting]);
  
  return {
    status,
    lastUpdateTime,
    reconnectAttempts,
    registerUpdate,
    reconnect: manualReconnect,
    isReconnecting
  };
}