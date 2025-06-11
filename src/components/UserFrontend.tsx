// src/components/UserFrontend.tsx
import { useState } from 'react';
import { SongList } from './SongList';
import { UpvoteList } from './UpvoteList';
import { RequestModal } from './RequestModal';
import { LandingPage } from './LandingPage';
import { Ticker } from './Ticker';
import { ConnectionStatus } from './ConnectionStatus';
import { useUiSettings } from '../hooks/useUiSettings';
import type { Song, SongRequest, User, SetList, RequestFormData } from '../types';

interface UserFrontendProps {
  songs: Song[];
  requests: SongRequest[];
  activeSetList: SetList | null;
  currentUser: User;
  onSubmitRequest: (data: RequestFormData) => Promise<boolean>;
  onVoteRequest: (id: string) => Promise<boolean>;
  onUpdateUser: (user: User, photoFile?: File) => void;
  logoUrl: string;
  isAdmin: boolean;
  onLogoClick: () => void;
  onBackendAccess: () => void;
}

export function UserFrontend({
  songs,
  requests,
  activeSetList,
  currentUser,
  onSubmitRequest,
  onVoteRequest,
  onUpdateUser,
  logoUrl,
  isAdmin,
  onLogoClick,
  onBackendAccess
}: UserFrontendProps) {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const { settings } = useUiSettings();

  return (
    <div className="min-h-screen bg-darker-purple">
      <header className="border-b border-purple-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <img 
                src={logoUrl} 
                alt="Band Logo"
                className="h-12 w-auto cursor-pointer"
                onClick={onLogoClick}
              />
              <h1 className="ml-4 text-2xl font-bold neon-text">
                Song Request System
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <ConnectionStatus />
              
              {isAdmin && (
                <button 
                  onClick={onBackendAccess}
                  className="neon-button"
                >
                  Backend Access
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section>
            <h2 className="text-xl font-semibold neon-text mb-4">Available Songs</h2>
            <SongList 
              songs={songs}
              onSongSelect={(song) => {
                setSelectedSong(song);
                setIsRequestModalOpen(true);
              }}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold neon-text mb-4">Current Requests</h2>
            <UpvoteList 
              requests={requests}
              currentUser={currentUser}
              onVoteRequest={onVoteRequest}
            />
          </section>
        </div>
      </main>

      <RequestModal 
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        song={selectedSong}
        currentUser={currentUser}
        onSubmit={onSubmitRequest}
      />

      <Ticker 
        requests={requests}
        settings={settings}
      />
    </div>
  );
}