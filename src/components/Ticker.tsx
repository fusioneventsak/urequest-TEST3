import React, { useState, useEffect } from 'react';
import type { SongRequest } from '../types';

interface TickerProps {
  requests: SongRequest[];
  customMessage?: string;
  isActive?: boolean;
}

export function Ticker({ requests, customMessage, isActive = true }: TickerProps) {
  const [currentMessage, setCurrentMessage] = useState('');

  useEffect(() => {
    if (!isActive) {
      setCurrentMessage('');
      return;
    }

    if (customMessage) {
      setCurrentMessage(customMessage);
      return;
    }

    // Find the locked request (next song)
    const lockedRequest = requests.find(r => r.isLocked && !r.isPlayed);
    
    if (lockedRequest) {
      const artistText = lockedRequest.artist ? ` by ${lockedRequest.artist}` : '';
      setCurrentMessage(`🎵 Next up: ${lockedRequest.title}${artistText}`);
    } else {
      // Show most voted pending request
      const pendingRequests = requests.filter(r => !r.isPlayed);
      if (pendingRequests.length > 0) {
        const topRequest = pendingRequests.sort((a, b) => b.votes - a.votes)[0];
        const artistText = topRequest.artist ? ` by ${topRequest.artist}` : '';
        setCurrentMessage(`🎤 Most requested: ${topRequest.title}${artistText} (${topRequest.votes} votes)`);
      } else {
        setCurrentMessage('🎶 Send in your song requests!');
      }
    }
  }, [requests, customMessage, isActive]);

  if (!isActive || !currentMessage) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 shadow-lg">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-medium animate-pulse">
              {currentMessage}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}