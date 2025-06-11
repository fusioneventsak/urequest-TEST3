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

  // Filter and sort requests
  const { pendingRequests, playedRequests } = useMemo(() => {
    const pending = requests.filter(r => !r.isPlayed);
    const played = requests.filter(r => r.isPlayed);

    const sortRequests = (reqs: SongRequest[]) => {
      return [...reqs].sort((a, b) => {
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
        bg-white rounded-lg border-2 transition-all duration-200
        ${request.isLocked ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 hover:border-gray-300'}
        ${request.isPlayed ? 'opacity-60' : ''}
      `}>
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Music className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <h3 className="font-semibold text-gray-900 truncate">
                  {request.title}
                </h3>
                {request.isLocked && (
                  <Lock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                )}
              </div>
              {request.artist && (
                <p className="text-sm text-gray-600 truncate">
                  by {request.artist}
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Users className="w-4 h-4" />
                <span>{requesterCount}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <span className="font-medium">{request.votes}</span>
                <span>votes</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimeAgo(request.createdAt)}</span>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              request.status === 'approved' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {request.status}
            </span>
          </div>

          {/* Actions */}
          {!request.isPlayed && (
            <div className="flex gap-2 mb-3">
              <Button
                variant={request.isLocked ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => handleAction(request.id, () => onLockRequest(request.id))}
                disabled={isActionLoading}
                className="flex-1"
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : request.isLocked ? (
                  <>
                    <Unlock className="w-4 h-4 mr-1" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-1" />
                    Lock as Next
                  </>
                )}
              </Button>
              
              <Button
                variant="success"
                size="sm"
                onClick={() => handleAction(request.id, () => onMarkPlayed(request.id))}
                disabled={isActionLoading}
                className="flex-1"
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Mark Played
                  </>
                )}
              </Button>
              
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleAction(request.id, () => handleDeleteRequest(request.id))}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}

          {/* Requesters toggle */}
          {requesterCount > 0 && (
            <button
              onClick={() => toggleExpanded(request.id)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>
                {requesterCount === 1 ? '1 requester' : `${requesterCount} requesters`}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Expanded requesters */}
          {isExpanded && request.requesters && request.requesters.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="space-y-2">
                {request.requesters.map((requester, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <img
                      src={requester.photo}
                      alt={requester.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `data:image/svg+xml;base64,${btoa(`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
                            <rect width="100" height="100" fill="#e5e7eb" />
                            <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
                                  fill="#6b7280" text-anchor="middle" dominant-baseline="central">
                              ${requester.name.charAt(0).toUpperCase()}
                            </text>
                          </svg>
                        `)}`;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">
                        {requester.name}
                      </p>
                      {requester.message && (
                        <p className="text-sm text-gray-600 mt-1">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Request Queue</h2>
          <p className="text-gray-600 mt-1">
            {pendingRequests.length} pending • {playedRequests.length} played
          </p>
        </div>
        
        <div className="flex gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="votes">Sort by Votes</option>
            <option value="time">Sort by Time</option>
            <option value="requesters">Sort by Requesters</option>
          </select>
          
          <Button
            variant="danger"
            onClick={onResetQueue}
            disabled={pendingRequests.length === 0}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Queue
          </Button>
        </div>
      </div>

      {/* Locked request highlight */}
      {lockedRequest && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-5 h-5 text-yellow-600" />
            <h3 className="font-semibold text-yellow-800">Next Song</h3>
          </div>
          <p className="text-yellow-700">
            <span className="font-medium">{lockedRequest.title}</span>
            {lockedRequest.artist && <span> by {lockedRequest.artist}</span>}
          </p>
        </div>
      )}

      {/* Pending requests */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Pending Requests ({pendingRequests.length})
        </h3>
        
        {pendingRequests.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Music className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No pending requests</p>
            <p className="text-sm text-gray-500 mt-1">
              Requests will appear here as they come in
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors mb-4"
          >
            <span>Played Requests ({playedRequests.length})</span>
            {showPlayedRequests ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
          
          {showPlayedRequests && (
            <div className="space-y-4">
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