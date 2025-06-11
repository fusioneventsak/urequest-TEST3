// src/components/QueueView.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { LoadingSpinner } from './shared/LoadingSpinner';
import { Button } from './shared/Button';
import { 
  Play, 
  Lock, 
  Unlock, 
  Trash2, 
  Users, 
  Clock, 
  Music, 
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { SongRequest } from '../types';
import { useUiSettings } from '../hooks/useUiSettings';

interface QueueViewProps {
  requests: SongRequest[];
  onLockRequest: (id: string) => Promise<void>;
  onMarkPlayed: (id: string) => Promise<void>;
  onResetQueue: () => Promise<void>;
  isLoading?: boolean;
}

type SortOption = 'votes' | 'time' | 'requesters';

export function QueueView({ 
  requests, 
  onLockRequest, 
  onMarkPlayed, 
  onResetQueue,
  isLoading = false 
}: QueueViewProps) {
  const [sortBy, setSortBy] = useState<SortOption>('votes');
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [showPlayedRequests, setShowPlayedRequests] = useState(false);
  const { settings } = useUiSettings();
  
  // Get theme colors from settings
  const accentColor = settings?.frontend_accent_color || '#ff00ff';
  const secondaryColor = settings?.frontend_secondary_accent || '#9d00ff';

  // Filter and sort requests
  const { pendingRequests, playedRequests } = useMemo(() => {
    const pending = requests.filter(r => !r.isPlayed);
    const played = requests.filter(r => r.isPlayed);

    const sortRequests = (reqs: SongRequest[]) => {
      return [...reqs].sort((a, b) => {
        // Always put locked requests at the top
        if (a.isLocked && !b.isLocked) return -1;
        if (!a.isLocked && b.isLocked) return 1;
        
        switch (sortBy) {
          case 'votes':
            if (a.votes !== b.votes) return b.votes - a.votes;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'time':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'requesters':
            const aCount = a.requesters?.length || 0;
            const bCount = b.requesters?.length || 0;
            if (aCount !== bCount) return bCount - aCount;
            return b.votes - a.votes;
          default:
            return 0;
        }
      });
    };

    return {
      pendingRequests: sortRequests(pending),
      playedRequests: sortRequests(played)
    };
  }, [requests, sortBy]);

  const lockedRequest = pendingRequests.find(r => r.isLocked);

  const handleAction = useCallback(async (id: string, action: () => Promise<void>) => {
    setActionLoading(prev => new Set([...prev, id]));
    try {
      await action();
    } catch (error) {
      console.error('Action failed:', error);
      toast.error('Action failed. Please try again.');
    } finally {
      setActionLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  }, []);

  const handleDeleteRequest = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this request?')) return;
    
    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      toast.success('Request deleted');
    } catch (error) {
      console.error('Error deleting request:', error);
      toast.error('Failed to delete request');
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const requestTime = new Date(date);
    const diffMs = now.getTime() - requestTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const RequestCard = ({ request }: { request: SongRequest }) => {
    const isExpanded = expandedRequests.has(request.id);
    const isActionLoading = actionLoading.has(request.id);
    const requesterCount = request.requesters?.length || 0;

    return (
      <div className={`
        glass-effect rounded-lg transition-all duration-200
        ${request.isLocked ? `border-2 border-${accentColor} bg-${accentColor}/10` : 'border border-neon-purple/20'}
        ${request.isPlayed ? 'opacity-60' : ''}
      `}
      style={{
        borderColor: request.isLocked ? accentColor : 'rgba(157, 0, 255, 0.2)',
        backgroundColor: request.isLocked ? `${accentColor}10` : 'rgba(26, 11, 46, 0.7)'
      }}>
        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Music className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <h3 className="font-semibold text-white truncate text-sm">
                  {request.title}
                </h3>
                {request.isLocked && (
                  <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                )}
              </div>
              {request.artist && (
                <p className="text-xs text-gray-300 truncate">
                  by {request.artist}
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-2 ml-3">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Users className="w-3 h-3" />
                <span>{requesterCount}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span className="font-medium">{request.votes}</span>
                <span>votes</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimeAgo(request.createdAt)}</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              request.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
              request.status === 'approved' ? 'bg-green-900/30 text-green-400' :
              'bg-gray-800/30 text-gray-400'
            }`}>
              {request.status}
            </span>
          </div>

          {/* Actions */}
          {!request.isPlayed && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => handleAction(request.id, () => onLockRequest(request.id))}
                disabled={isActionLoading}
                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium flex items-center justify-center transition-colors ${
                  request.isLocked 
                    ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50' 
                    : 'bg-neon-purple/20 text-neon-pink hover:bg-neon-purple/30'
                }`}
                style={{
                  backgroundColor: request.isLocked ? 'rgba(234, 179, 8, 0.3)' : 'rgba(157, 0, 255, 0.2)',
                  color: request.isLocked ? '#facc15' : accentColor
                }}
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : request.isLocked ? (
                  <>
                    <Unlock className="w-3 h-3 mr-1" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 mr-1" />
                    Lock as Next
                  </>
                )}
              </button>
              
              <button
                onClick={() => handleAction(request.id, () => onMarkPlayed(request.id))}
                disabled={isActionLoading}
                className="flex-1 px-2 py-1 bg-green-900/30 text-green-400 hover:bg-green-900/50 rounded-md text-xs font-medium flex items-center justify-center transition-colors"
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <Play className="w-3 h-3 mr-1" />
                    Mark Played
                  </>
                )}
              </button>
              
              <button
                onClick={() => handleAction(request.id, () => handleDeleteRequest(request.id))}
                disabled={isActionLoading}
                className="px-2 py-1 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-md text-xs font-medium flex items-center justify-center transition-colors"
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            </div>
          )}

          {/* Requesters toggle */}
          {requesterCount > 0 && (
            <button
              onClick={() => toggleExpanded(request.id)}
              className="flex items-center gap-1 text-xs text-neon-pink hover:text-white transition-colors"
              style={{ color: accentColor }}
            >
              <MessageSquare className="w-3 h-3" />
              <span>
                {requesterCount === 1 ? '1 requester' : `${requesterCount} requesters`}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Expanded requesters */}
          {isExpanded && request.requesters && request.requesters.length > 0 && (
            <div className="mt-2 pt-2 border-t border-neon-purple/20">
              <div className="space-y-2">
                {request.requesters.map((requester, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <img
                      src={requester.photo}
                      alt={requester.name}
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-neon-purple/30"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `data:image/svg+xml;base64,${btoa(`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="24" height="24">
                            <rect width="100" height="100" fill="#1a0b2e" />
                            <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
                                  fill="#9d00ff" text-anchor="middle" dominant-baseline="central">
                              ${requester.name.charAt(0).toUpperCase()}
                            </text>
                          </svg>
                        `)}`;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-white">
                        {requester.name}
                      </p>
                      {requester.message && (
                        <p className="text-xs text-gray-300 mt-1 bg-neon-purple/10 p-1 rounded">
                          "{requester.message}"
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTimeAgo(requester.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white neon-text">Request Queue</h2>
          <p className="text-gray-400 text-sm">
            {pendingRequests.length} pending • {playedRequests.length} played
          </p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2 py-1 bg-neon-purple/10 border border-neon-purple/20 rounded-md text-xs text-white focus:outline-none focus:border-neon-pink"
          >
            <option value="votes">Sort by Votes</option>
            <option value="time">Sort by Time</option>
            <option value="requesters">Sort by Requesters</option>
          </select>
          
          <button
            onClick={() => onResetQueue()}
            disabled={pendingRequests.length === 0}
            className="px-2 py-1 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-md text-xs font-medium flex items-center transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset Queue
          </button>
        </div>
      </div>

      {/* Locked request highlight */}
      {lockedRequest && (
        <div className="glass-effect rounded-lg p-3 border-2 border-yellow-400 bg-yellow-900/20">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-yellow-400" />
            <h3 className="font-semibold text-yellow-400 text-sm">Next Song</h3>
          </div>
          <p className="text-white text-sm">
            <span className="font-medium">{lockedRequest.title}</span>
            {lockedRequest.artist && <span className="text-gray-300"> by {lockedRequest.artist}</span>}
          </p>
          {lockedRequest.requesters && lockedRequest.requesters.length > 0 && (
            <div className="flex items-center mt-1 gap-1">
              <span className="text-xs text-gray-400">Requested by:</span>
              <div className="flex -space-x-1">
                {lockedRequest.requesters.slice(0, 3).map((requester, idx) => (
                  <img 
                    key={idx}
                    src={requester.photo} 
                    alt={requester.name}
                    className="w-4 h-4 rounded-full border border-yellow-400/50"
                    title={requester.name}
                  />
                ))}
              </div>
              {lockedRequest.requesters.length > 3 && (
                <span className="text-xs text-gray-400">+{lockedRequest.requesters.length - 3}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending requests */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">
          Pending Requests ({pendingRequests.length})
        </h3>
        
        {pendingRequests.length === 0 ? (
          <div className="text-center py-6 glass-effect rounded-lg">
            <Music className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No pending requests</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingRequests.map(request => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>

      {/* Played requests */}
      {playedRequests.length > 0 && (
        <div>
          <button
            onClick={() => setShowPlayedRequests(!showPlayedRequests)}
            className="flex items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white transition-colors mb-2"
          >
            <span>Played Requests ({playedRequests.length})</span>
            {showPlayedRequests ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          
          {showPlayedRequests && (
            <div className="space-y-2">
              {playedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}