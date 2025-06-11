import React, { useState, useMemo } from 'react';
import { Clock, Users, Lock, Play, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { SongRequest } from '../types';

interface QueueViewProps {
  requests: SongRequest[];
  onLockRequest: (id: string) => void;
  onMarkPlayed: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onClearQueue: () => void;
}

export function QueueView({
  requests,
  onLockRequest,
  onMarkPlayed,
  onDeleteRequest,
  onClearQueue
}: QueueViewProps) {
  const [sortBy, setSortBy] = useState<'votes' | 'time' | 'requesters'>('votes');
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  const pendingRequests = useMemo(() => {
    const pending = requests.filter(r => !r.isPlayed);
    
    return pending.sort((a, b) => {
      if (a.isLocked && !b.isLocked) return -1;
      if (!a.isLocked && b.isLocked) return 1;
      
      switch (sortBy) {
        case 'votes':
          return b.votes - a.votes;
        case 'time':
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'requesters':
          return b.requesters.length - a.requesters.length;
        default:
          return 0;
      }
    });
  }, [requests, sortBy]);

  const toggleExpanded = (requestId: string) => {
    const newExpanded = new Set(expandedRequests);
    if (newExpanded.has(requestId)) {
      newExpanded.delete(requestId);
    } else {
      newExpanded.add(requestId);
    }
    setExpandedRequests(newExpanded);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Request Queue</h1>
        <div className="flex gap-4">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'votes' | 'time' | 'requesters')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="votes">Sort by Votes</option>
            <option value="time">Sort by Time</option>
            <option value="requesters">Sort by Requesters</option>
          </select>
          <button
            onClick={onClearQueue}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Clear Queue
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {pendingRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">No pending requests</p>
            <p className="text-sm">Requests will appear here as they come in</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {pendingRequests.map((request) => (
              <div key={request.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {request.isLocked && (
                        <Lock className="w-5 h-5 text-yellow-600" />
                      )}
                      <h3 className="text-lg font-semibold text-gray-900">
                        {request.title}
                      </h3>
                      {request.artist && (
                        <span className="text-gray-600">by {request.artist}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {request.requesters.length} requester{request.requesters.length !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatTime(request.createdAt)}
                      </div>
                      <div className="font-medium">
                        {request.votes} vote{request.votes !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {request.requesters.length > 0 && (
                      <button
                        onClick={() => toggleExpanded(request.id)}
                        className="mt-2 flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                      >
                        {expandedRequests.has(request.id) ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide requesters
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Show requesters
                          </>
                        )}
                      </button>
                    )}

                    {expandedRequests.has(request.id) && (
                      <div className="mt-3 space-y-2">
                        {request.requesters.map((requester) => (
                          <div key={requester.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                            <img
                              src={requester.photo}
                              alt={requester.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm">{requester.name}</div>
                              {requester.message && (
                                <div className="text-xs text-gray-600">{requester.message}</div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatTime(requester.timestamp)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => onLockRequest(request.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        request.isLocked
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={request.isLocked ? 'Unlock request' : 'Lock as next'}
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => onMarkPlayed(request.id)}
                      className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                      title="Mark as played"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => onDeleteRequest(request.id)}
                      className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      title="Delete request"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}