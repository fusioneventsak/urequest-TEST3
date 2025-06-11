// src/App.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './utils/supabase';
import { UserFrontend } from './components/UserFrontend';
import { BackendLogin } from './components/BackendLogin';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useUiSettings } from './hooks/useUiSettings';
import { useSongSync } from './hooks/useSongSync';
import { useRequestSync } from './hooks/useRequestSync';
import { useSetListSync } from './hooks/useSetListSync';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import type { Song, SongRequest, RequestFormData, SetList, User } from './types';
import { LogOut } from 'lucide-react';

// Import the backend components
import { SongLibrary } from './components/SongLibrary';
import { SetListManager } from './components/SetListManager';
import { QueueView } from './components/QueueView';
import { SettingsManager } from './components/SettingsManager';
import { LogoManager } from './components/LogoManager';
import { ColorCustomizer } from './components/ColorCustomizer';
import { LogoDebugger } from './components/LogoDebugger';
import { TickerManager } from './components/TickerManager';
import { BackendTabs } from './components/BackendTabs';
import { LandingPage } from './components/LandingPage';
import { Logo } from './components/shared/Logo';
import { KioskPage } from './components/KioskPage';

const DEFAULT_BAND_LOGO = "https://www.fusion-events.ca/wp-content/uploads/2025/03/ulr-wordmark.png";
const BACKEND_PATH = "backend";
const KIOSK_PATH = "kiosk";
const MAX_PHOTO_SIZE = 250 * 1024; // 250KB limit for database storage
const MAX_REQUEST_RETRIES = 3;

function App() {
  // Authentication state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isBackend, setIsBackend] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);
  
  // Backend tab state
  const [activeBackendTab, setActiveBackendTab] = useState<'requests' | 'setlists' | 'songs' | 'settings'>('requests');
  
  // App data state
  const [songs, setSongs] = useState<Song[]>([]);
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [setLists, setSetLists] = useState<SetList[]>([]);
  const [activeSetList, setActiveSetList] = useState<SetList | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tickerMessage, setTickerMessage] = useState<string>('');
  const [isTickerActive, setIsTickerActive] = useState(false);
  
  // Track network state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isAppActive, setIsAppActive] = useState(true);
  
  // Ref to track if component is mounted
  const mountedRef = useRef(true);
  const requestInProgressRef = useRef(false);
  const requestRetriesRef = useRef(0);
  
  // UI Settings
  const { settings, updateSettings } = useUiSettings();
  
  // Initialize data synchronization
  const { isLoading: isFetchingSongs } = useSongSync(setSongs);
  const { isLoading: isFetchingRequests, reconnect: reconnectRequests } = useFastRequestSync(setRequests);
  const { isLoading: isFetchingSetLists, refetch: refreshSetLists } = useSetListSync(setSetLists);

  // ... rest of the code remains the same ...

  return (
    <ErrorBoundary>
      <div className="app">
        {isInitializing ? (
          <LoadingSpinner />
        ) : isBackend ? (
          isAdmin ? (
            <BackendTabs
              activeTab={activeBackendTab}
              setActiveTab={setActiveBackendTab}
              onLogout={handleAdminLogout}
            />
          ) : (
            <BackendLogin onLogin={handleAdminLogin} />
          )
        ) : isKiosk ? (
          <KioskPage
            requests={requests}
            songs={songs}
            onSubmitRequest={handleSubmitRequest}
            onVoteRequest={handleVoteRequest}
            currentUser={currentUser}
            onUserUpdate={handleUserUpdate}
          />
        ) : (
          <UserFrontend
            requests={requests}
            songs={songs}
            onSubmitRequest={handleSubmitRequest}
            onVoteRequest={handleVoteRequest}
            currentUser={currentUser}
            onUserUpdate={handleUserUpdate}
          />
        )}
        
        <ConnectionStatus isOnline={isOnline} />
      </div>
    </ErrorBoundary>
  );
}

export default App;