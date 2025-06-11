import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, 
  Lock, 
  Unlock, 
  Check, 
  X, 
  Music2, 
  Clock, 
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  Zap
} from 'lucide-react';
import { Button } from './shared/Button';
import { useUltraFastRequestSync } from '../hooks/useUltraFastRequestSync';
import type { SongRequest } from '../types';
import toast from 'react-hot-toast';

interface UltraFastQueueViewProps {
  onLockRequest: (id: string) => Promise<boolean>;
  onPlayRequest: (id: string) => Promise<boolean>;
  onUpdateStatus: (id: string, status: 'approved' | 'rejected' | 'played') => Promise<boolean>;
}

export function UltraFastQueueView({ 
  onLockRequest, 
  onPlayRequest, 
  onUpdateStatus 
}: UltraFastQueueViewProps) {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  
  const { 
    isLoading, 
    error, 
    connectionStatus, 
    reconnect, 
    forceRefresh 
  } = useUltraFastRequestSync(setRequests);

  // Track last update for performance monitoring
  useEffect(() => {
    setLastUpdateTime(new Date());
  }, [requests]);

  // Handle request locking with optimistic updates
  const handleLockRequest = useCallback(async (id: string) => {
    if (actionStates[id]) return;
    
    setActionStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Optimistic update
      setRequests(prev => prev.map(req => 
        req.id === id 
          ? { ...req, isLocked: !req.isLocked }
          : { ...req, isLocked: false } // Unlock others
      ));
      
      const success = await onLockRequest(id);
      
      if (!success) {
        // Revert optimistic update on failure
        forceRefresh();
        toast.error('Failed to lock request');
      } else {
        toast.success('Request locked!');
        // Force immediate refresh to ensure all clients see the update
        setTimeout(forceRefresh, 100);
      }
    } catch (error) {
      console.error('Error locking request:', error);
      forceRefresh();
      toast.error('Failed to lock request');
    } finally {
      setActionStates(prev => ({ ...prev, [id]: false }));
    }
  }, [actionStates, onLockRequest, forceRefresh]);

  // Handle marking as played
  const handlePlayRequest = useCallback(async (id: string) => {
    if (actionStates[id]) return;
    
    setActionStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Optimistic update
      setRequests(prev => prev.map(req => 
        req.id === id ? { ...req, isPlayed: true, isLocked: false } : req
      ));
      
      const success = await onPlayRequest(id);
      
      if (!success) {
        forceRefresh();
        toast.error('Failed to mark as played');
      } else {
        toast.success('Marked as played!');
        setTimeout(forceRefresh, 100);
      }
    } catch (error) {
      console.error('Error marking as played:', error);
      forceRefresh();
      toast.error('Failed to mark as played');
    } finally {
      setActionStates(prev => ({ ...prev, [id]: false }));
    }
  }, [actionStates, onPlayRequest, forceRefresh]);

  // Sort requests for optimal queue display
  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      // Locked requests first
      if (a.isLocked && !b.isLocked) return -1;
      if (!a.isLocked && b.isLocked) return 1;
      
      // Then by votes (descending)
      if (b.votes !== a.votes) return b.votes - a.votes;
      
      // Then by creation time (ascending)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [requests]);

  // Filter active requests (not played)
  const activeRequests = useMemo(() => {
    return sortedRequests.filter(req => !req.isPlayed);
  }, [sortedRequests]);

  // Get currently locked request
  const lockedRequest = useMemo(() => {
    return activeRequests.find(req => req.isLocked);
  }, [activeRequests]);

  // Connection status indicator
  const ConnectionIndicator = () => (
    <div className="flex items-center gap-2 text-sm">
      {connectionStatus === 'connected' ? (
        <>
          <Wifi className="w-4 h-4 text-green-400" />
          <span className="text-green-400">Live</span>
        </>
      ) : connectionStatus === 'connecting' ? (
        <>
          <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />
          <span className="text-yellow-400">Connecting...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-400" />
          <span className="text-red-400">Disconnected</span>
          <Button
            onClick={reconnect}
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300"
          >
            Reconnect
          </Button>
        </>
      )}
      <span className="text-gray-500">
        Last update: {lastUpdateTime.toLocaleTimeString()}
      </span>
    </div>
  );

  // Performance metrics
  const PerformanceMetrics = () => (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <div className="flex items-center gap-1">
        <Zap className="w-3 h-3" />
        <span>Ultra-Fast Mode</span>
      </div>
      <div>Requests: {activeRequests.length}</div>
      <div>Locked: {lockedRequest?.title || 'None'}</div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
        <p className="text-gray-400">Loading ultra-fast queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <X className="w-8 h-8 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-4">Error loading queue: {error.message}</p>
        <Button onClick={reconnect} className="bg-red-600 hover:bg-red-700">
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with connection status */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Queue</h2>
          <PerformanceMetrics />
        </div>
        <ConnectionIndicator />
      </div>

      {/* Currently locked/playing section */}
      {lockedRequest && (
        <div className="glass-effect rounded-lg p-6 border-2 border-yellow-400 bg-yellow-400/10">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-6 h-6 text-yellow-400" />
            <h3 className="text-xl font-semibold text-white">Currently Locked</h3>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-medium text-white">{lockedRequest.title}</h4>
              {lockedRequest.artist && (
                <p className="text-gray-300">by {lockedRequest.artist}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{lockedRequest.votes} votes</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{lockedRequest.requesters.length} requesters</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={() => handlePlayRequest(lockedRequest.id)}
                disabled={actionStates[lockedRequest.id]}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {actionStates[lockedRequest.id] ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Mark as Played
              </Button>
              
              <Button
                onClick={() => handleLockRequest(lockedRequest.id)}
                disabled={actionStates[lockedRequest.id]}
                variant="ghost"
                className="text-yellow-400 hover:text-yellow-300"
              >
                <Unlock className="w-4 h-4" />
                Unlock
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Queue list */}
      <div className="space-y-3">
        {activeRequests.map((request, index) => {
          const isLocked = request.isLocked;
          const isProcessing = actionStates[request.id];
          
          return (
            <div
              key={request.id}
              className={`glass-effect rounded-lg p-4 transition-all duration-200 ${
                isLocked 
                  ? 'border-yellow-400 bg-yellow-400/5' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Queue position */}
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-white">
                    {index + 1}
                  </div>
                  
                  {/* Song info */}
                  <div>
                    <h3 className="font-medium text-white">{request.title}</h3>
                    {request.artist && (
                      <p className="text-gray-300 text-sm">by {request.artist}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{request.votes} votes</span>
                      <span>{request.requesters.length} requesters</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {!isLocked ? (
                    <Button
                      onClick={() => handleLockRequest(request.id)}
                      disabled={isProcessing}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                      size="sm"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      Lock
                    </Button>
                  ) : null}
                  
                  <Button
                    onClick={() => handlePlayRequest(request.id)}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Play
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual refresh button */}
      <div className="text-center pt-4">
        <Button
          onClick={forceRefresh}
          variant="ghost"
          className="text-gray-400 hover:text-white"
          size="sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Force Refresh
        </Button>
      </div>
    </div>
  );
}