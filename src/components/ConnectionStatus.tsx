import React, { useCallback } from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useConnectionHealth } from '../hooks/useConnectionHealth';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  showAlways?: boolean;
}

export function ConnectionStatus({ className = '', showDetails = false, showAlways = false }: ConnectionStatusProps) {
  const { status, reconnectAttempts, reconnect } = useConnectionHealth();

  // Wrap the reconnect function to handle the click event
  const handleReconnect = useCallback(() => {
    reconnect();
  }, [reconnect]);
  
  // Don't show connection status on the request page or when connection is good
  if (!showAlways || status === 'good') {
    return null;
  }
  
  return (
    <div className={`flex items-center ${className}`}>
      {status === 'disconnected' && (
        <button
          onClick={handleReconnect}
          className="flex items-center text-red-400 text-xs bg-red-400/10 px-2 py-1 rounded-md"
          title="Connection lost. Click to reconnect."
        >
          <WifiOff className="w-3 h-3 mr-1" />
          <span>Disconnected</span>
          <RefreshCw className="w-3 h-3 ml-2" />
        </button>
      )}
      
      {showDetails && reconnectAttempts > 0 && (
        <span className="ml-2 text-xs text-gray-400">
          ({reconnectAttempts} reconnect attempts)
        </span>
      )}
    </div>
  );
}