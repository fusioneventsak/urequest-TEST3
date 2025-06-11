import { useState, useEffect } from 'react';
import { enhancedRealtimeManager } from '../utils/realtimeManager';

/**
 * Hook to track and manage Supabase realtime connection status
 */
export function useRealtimeConnection() {
  const [connectionStatus, setConnectionStatus] = useState<string>(
    enhancedRealtimeManager.getConnectionStatus()
  );
  const [error, setError] = useState<Error | null>(null);
  const [lastReconnectTime, setLastReconnectTime] = useState<Date | null>(null);

  useEffect(() => {
    
    // Register listener for connection status updates
    const handleConnectionChange = (status: string, err?: Error) => {
      setConnectionStatus(status);
      
      if (err) {
        setError(err);
      } else if (status === 'connected') {
        setError(null);
      }
      
      if (status === 'connecting') {
        setLastReconnectTime(new Date());
      }
    };
    
    enhancedRealtimeManager.addConnectionListener(handleConnectionChange);
    
    // Cleanup on unmount
    return () => {
      enhancedRealtimeManager.removeConnectionListener(handleConnectionChange);
    };
  }, []);
  
  // Function to manually trigger reconnection
  const reconnect = () => {
    enhancedRealtimeManager.reconnect();
    setLastReconnectTime(new Date());
  };
  
  return {
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    hasError: connectionStatus === 'error',
    error,
    lastReconnectTime,
    reconnect
  };
}