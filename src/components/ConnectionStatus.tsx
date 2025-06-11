import React from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useConnectionHealth } from '../hooks/useConnectionHealth';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  showAlways?: boolean;
}

export function ConnectionStatus({ className = '', showDetails = false, showAlways = false }: ConnectionStatusProps) {
  const { status, reconnectAttempts, reconnect } = useConnectionHealth();
  
  if (status === 'good' && !showDetails && !showAlways) {
    return null; // Don't show anything when connection is good
  }
  
  return (
    <div className={`flex items-center ${className}`}>
      {status === 'good' && (
        <div className="flex items-center text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded-md">
          <Wifi className="w-3 h-3 mr-1" />
          <span>Connected</span>
        </div>
      )}
      
      {status === 'poor' && (
        <button 
          onClick={reconnect}
          className="flex items-center text-yellow-400 text-xs bg-yellow-400/10 px-2 py-1 rounded-md"
          title="Connection quality is poor. Click to reconnect."
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          <span>Weak Connection</span>
          <RefreshCw className="w-3 h-3 ml-2" />
        </button>
      )}
      
      {status === 'disconnected' && (
        <button
          onClick={reconnect}
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