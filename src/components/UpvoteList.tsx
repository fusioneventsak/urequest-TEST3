import React, { useState, useMemo } from 'react';
import { ChevronUp, Users, MessageCircle, Clock, Trophy, Star } from 'lucide-react';
import { Button } from './shared/Button';
import type { SongRequest, User } from '../types';

interface UpvoteListProps {
  requests: SongRequest[];
  currentUser: User | null;
  onVoteRequest: (id: string) => Promise<boolean>;
  isOnline: boolean;
}

export function UpvoteList({ requests, currentUser, onVoteRequest, isOnline }: UpvoteListProps) {
  const [votingStates, setVotingStates] = useState<Record<string, boolean>>({});
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  // Filter and sort requests for upvoting
  const upvoteableRequests = useMemo(() => {
    return requests
      .filter(request => !request.isPlayed && !request.isLocked)
      .sort((a, b) => {
        // Sort by votes (descending), then by creation time (ascending)
        if (b.votes !== a.votes) {
          return b.votes - a.votes;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [requests]);

  const handleVote = async (requestId: string) => {
    if (!currentUser) {
      return;
    }

    if (votingStates[requestId]) {
      return; // Already voting
    }

    setVotingStates(prev => ({ ...prev, [requestId]: true }));
    
    try {
      await onVoteRequest(requestId);
    } finally {
      setVotingStates(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => ({
      ...prev,
      [requestId]: !prev[requestId]
    }));
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const requestTime = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - requestTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (upvoteableRequests.length === 0) {
    return (
      <div className="text-center py-12">
        <Star className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Requests to Vote On</h3>
        <p className="text-gray-500">
          Be the first to request a song, or wait for others to make requests!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Vote for Requests</h2>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Trophy className="w-4 h-4" />
          <span>{upvoteableRequests.length} requests</span>
        </div>
      </div>

      <div className="space-y-3">
        {upvoteableRequests.map((request) => {
          const isExpanded = expandedRequests[request.id];
          const isVoting = votingStates[request.id];
          const hasRequesters = request.requesters && request.requesters.length > 0;
          const requesterCount = request.requesters?.length || 0;

          return (
            <div
              key={request.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-lg leading-tight">
                          {request.title}
                        </h3>
                        {request.artist && (
                          <p className="text-gray-600 mt-1">by {request.artist}</p>
                        )}
                        
                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <ChevronUp className="w-4 h-4" />
                            <span className="font-medium">{request.votes}</span>
                            <span>votes</span>
                          </div>
                          
                          {hasRequesters && (
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{requesterCount}</span>
                              <span>{requesterCount === 1 ? 'person' : 'people'}</span>
                            </div>
                          )}
                          
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{formatTimeAgo(request.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasRequesters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(request.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span className="ml-1">{requesterCount}</span>
                      </Button>
                    )}
                    
                    <Button
                      onClick={() => handleVote(request.id)}
                      disabled={!currentUser || isVoting || !isOnline}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 min-w-[80px]"
                      size="sm"
                    >
                      {isVoting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Voting...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <ChevronUp className="w-4 h-4" />
                          <span>Vote</span>
                        </div>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded requesters section */}
                {isExpanded && hasRequesters && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Requested by:
                    </h4>
                    <div className="space-y-3">
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
                            <p className="text-sm font-medium text-gray-900">
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
        })}
      </div>

      {!currentUser && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <p className="text-yellow-800 text-sm">
            <strong>Note:</strong> You need to create a profile to vote for requests.
          </p>
        </div>
      )}

      {!isOnline && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
          <p className="text-red-800 text-sm">
            <strong>Offline:</strong> You cannot vote while offline. Please check your internet connection.
          </p>
        </div>
      )}
    </div>
  );
}