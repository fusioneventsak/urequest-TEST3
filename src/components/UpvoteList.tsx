import React, { useState, useMemo } from 'react';
import { ChevronUp, Star } from 'lucide-react';
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

  if (upvoteableRequests.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-900 min-h-screen">
        <Star className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Requests to Vote On</h3>
        <p className="text-gray-400">
          Be the first to request a song, or wait for others to make requests!
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {upvoteableRequests.map((request) => {
          const isVoting = votingStates[request.id];
          const hasRequesters = request.requesters && request.requesters.length > 0;

          return (
            <div key={request.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  {/* Song Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {request.title}
                    </h3>
                    {request.artist && (
                      <p className="text-gray-300 text-sm truncate">
                        by {request.artist}
                      </p>
                    )}
                  </div>

                  {/* Vote Button */}
                  <div className="flex-shrink-0">
                    <Button
                      onClick={() => handleVote(request.id)}
                      disabled={!currentUser || isVoting || !isOnline}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 min-w-[80px] rounded disabled:opacity-50 disabled:cursor-not-allowed"
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

                {/* Avatars and Vote Count Section */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatars */}
                    {hasRequesters && (
                      <div className="flex -space-x-2">
                        {request.requesters.slice(0, 4).map((requester, index) => (
                          <div key={index} className="relative">
                            <img
                              src={requester.photo}
                              alt={requester.name}
                              className="w-8 h-8 rounded-full border-2 border-gray-700 object-cover bg-gray-800"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = `data:image/svg+xml;base64,${btoa(`
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
                                    <rect width="100" height="100" fill="#374151" />
                                    <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
                                          fill="#9ca3af" text-anchor="middle" dominant-baseline="central">
                                      ${requester.name.charAt(0).toUpperCase()}
                                    </text>
                                  </svg>
                                `)}`;
                              }}
                            />
                          </div>
                        ))}
                        {request.requesters.length > 4 && (
                          <div className="w-8 h-8 rounded-full border-2 border-gray-700 bg-gray-800 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-400">
                              +{request.requesters.length - 4}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Vote Count Text */}
                    <div className="text-sm text-gray-400">
                      {request.votes} {request.votes === 1 ? 'vote' : 'votes'}
                      {hasRequesters && (
                        <span className="ml-2">
                          • {request.requesters.length} {request.requesters.length === 1 ? 'person' : 'people'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Messages */}
      {!currentUser && (
        <div className="max-w-2xl mx-auto mt-6">
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 backdrop-blur-sm">
            <p className="text-yellow-300 text-sm">
              <strong>Note:</strong> You need to create a profile to vote for requests.
            </p>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="max-w-2xl mx-auto mt-6">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 backdrop-blur-sm">
            <p className="text-red-300 text-sm">
              <strong>Offline:</strong> You cannot vote while offline. Please check your internet connection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}