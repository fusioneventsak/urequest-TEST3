import React, { useState, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useUiSettings } from '../hooks/useUiSettings';
import type { SongRequest, User } from '../types';

interface UpvoteListProps {
  requests: SongRequest[];
  currentUser: User | null;
  onVoteRequest: (id: string) => Promise<boolean>;
  isOnline: boolean;
}

export function UpvoteList({ requests, currentUser, onVoteRequest, isOnline }: UpvoteListProps) {
  const [votingStates, setVotingStates] = useState<Record<string, boolean>>({});
  const { settings } = useUiSettings();

  // Get accent colors from settings
  const accentColor = settings?.frontend_accent_color || '#ff00ff';
  const secondaryAccent = settings?.frontend_secondary_accent || '#9d00ff';

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
      <div className="text-center py-12 bg-darker-purple min-h-screen">
        <Star className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Requests to Vote On</h3>
        <p className="text-gray-400">
          Be the first to request a song, or wait for others to make requests!
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-darker-purple p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {upvoteableRequests.map((request) => {
          const isVoting = votingStates[request.id];
          const hasRequesters = request.requesters && request.requesters.length > 0;

          return (
            <div key={request.id} className="glass-effect rounded-lg p-4 border-2" style={{ borderColor: `${accentColor}40` }}>
              <div className="flex items-center justify-between">
                {/* Song Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">
                    {request.title}
                  </h3>
                  {request.artist && (
                    <p className="text-gray-300 truncate">
                      by {request.artist}
                    </p>
                  )}
                </div>

                {/* Vote Button */}
                <div className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleVote(request.id)}
                    disabled={!currentUser || isVoting || !isOnline}
                    className="px-6 py-3 rounded-lg font-semibold border-2 cursor-pointer"
                    style={{
                      backgroundColor: accentColor,
                      borderColor: accentColor,
                      color: 'white',
                      opacity: (!currentUser || isVoting || !isOnline) ? 0.5 : 1,
                      pointerEvents: (!currentUser || isVoting || !isOnline) ? 'none' : 'auto'
                    }}
                  >
                    {isVoting ? (
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
                        />
                        <span>Voting...</span>
                      </div>
                    ) : (
                      <span>UPVOTE</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Avatars and People Count Section */}
              <div className="mt-4 flex items-center gap-3">
                {/* Avatars */}
                {hasRequesters && (
                  <div className="flex -space-x-2">
                    {request.requesters.slice(0, 4).map((requester, index) => (
                      <div key={index} className="relative">
                        <img
                          src={requester.photo}
                          alt={requester.name}
                          className="w-8 h-8 rounded-full object-cover"
                          style={{
                            border: `2px solid ${accentColor}80`
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = `data:image/svg+xml;base64,${btoa(`
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
                                <rect width="100" height="100" fill="#1a0b2e" />
                                <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
                                      fill="${secondaryAccent}" text-anchor="middle" dominant-baseline="central">
                                  ${requester.name.charAt(0).toUpperCase()}
                                </text>
                              </svg>
                            `)}`;
                          }}
                        />
                      </div>
                    ))}
                    {request.requesters.length > 4 && (
                      <div 
                        className="w-8 h-8 rounded-full bg-dark-purple flex items-center justify-center"
                        style={{
                          border: `2px solid ${accentColor}80`
                        }}
                      >
                        <span 
                          className="text-xs font-medium"
                          style={{ color: secondaryAccent }}
                        >
                          +{request.requesters.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* People Count Text */}
                <div className="text-sm text-gray-400">
                  {hasRequesters && (
                    <span>
                      {request.requesters.length} {request.requesters.length === 1 ? 'person' : 'people'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}