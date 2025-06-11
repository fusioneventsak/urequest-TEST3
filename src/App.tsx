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
  // State management
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeBackendTab, setActiveBackendTab] = useState('queue');

  // Custom hooks
  const { settings, refreshSettings } = useUiSettings();
  const { songs, setSongs, refreshSongs } = useSongSync();
  const { requests, refreshRequests } = useRequestSync();
  const { setLists, refreshSetLists } = useSetListSync();

  // URL state
  const isBackend = window.location.pathname.includes(BACKEND_PATH);
  const isKiosk = window.location.pathname.includes(KIOSK_PATH);

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load user from localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }

        // Check admin status
        const adminStatus = localStorage.getItem('isAdmin') === 'true';
        setIsAdmin(adminStatus);

        // Initialize data
        await Promise.all([
          refreshSettings(),
          refreshSongs(),
          refreshRequests(),
          refreshSetLists()
        ]);
      } catch (error) {
        console.error('Error initializing app:', error);
        toast.error('Failed to initialize app');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();
  }, [refreshSettings, refreshSongs, refreshRequests, refreshSetLists]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // User management
  const handleUserUpdate = useCallback((user: User) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  }, []);

  // Admin authentication
  const handleAdminLogin = useCallback((password: string) => {
    // Simple password check - in production, use proper authentication
    if (password === 'admin123') {
      setIsAdmin(true);
      localStorage.setItem('isAdmin', 'true');
      toast.success('Admin login successful');
      return true;
    }
    toast.error('Invalid password');
    return false;
  }, []);

  const handleAdminLogout = useCallback(() => {
    setIsAdmin(false);
    localStorage.removeItem('isAdmin');
    window.location.href = '/';
  }, []);

  // Request management
  const handleSubmitRequest = useCallback(async (requestData: RequestFormData) => {
    if (!isOnline) {
      toast.error('Cannot submit request while offline. Please check your internet connection.');
      return;
    }

    if (!currentUser) {
      toast.error('Please create a profile first');
      return;
    }

    try {
      // Create the request
      const requestId = uuidv4();
      const { error: requestError } = await supabase
        .from('requests')
        .insert({
          id: requestId,
          title: requestData.title,
          artist: requestData.artist || null,
          votes: 1,
          status: 'pending',
          is_locked: false,
          is_played: false
        });

      if (requestError) throw requestError;

      // Add the requester
      const { error: requesterError } = await supabase
        .from('requesters')
        .insert({
          request_id: requestId,
          name: currentUser.name,
          photo: currentUser.photo,
          message: requestData.message || null
        });

      if (requesterError) throw requesterError;

      // Add user vote
      const { error: voteError } = await supabase
        .from('user_votes')
        .insert({
          request_id: requestId,
          user_id: currentUser.id || currentUser.name
        });

      if (voteError) throw voteError;

      toast.success('Request submitted successfully!');
      refreshRequests();
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request. Please try again.');
    }
  }, [currentUser, isOnline, refreshRequests]);

  const handleVoteRequest = useCallback(async (requestId: string) => {
    if (!isOnline) {
      toast.error('Cannot vote while offline. Please check your internet connection.');
      return;
    }

    if (!currentUser) {
      toast.error('Please create a profile first');
      return;
    }

    try {
      const userId = currentUser.id || currentUser.name;

      // Check if user already voted
      const { data: existingVote } = await supabase
        .from('user_votes')
        .select('id')
        .eq('request_id', requestId)
        .eq('user_id', userId)
        .single();

      if (existingVote) {
        toast.error('You have already voted for this request');
        return;
      }

      // Add vote
      const { error: voteError } = await supabase
        .from('user_votes')
        .insert({
          request_id: requestId,
          user_id: userId
        });

      if (voteError) throw voteError;

      // Update vote count
      const { error: updateError } = await supabase
        .rpc('increment_votes', { request_id: requestId });

      if (updateError) throw updateError;

      toast.success('Vote added!');
      refreshRequests();
    } catch (error) {
      console.error('Error voting for request:', error);
      toast.error('Failed to vote. Please try again.');
    }
  }, [currentUser, isOnline, refreshRequests]);

  // Song management
  const handleAddSong = useCallback(async (songData: Omit<Song, 'id'>) => {
    if (!isOnline) {
      toast.error('Cannot add song while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('songs')
        .insert({
          title: songData.title,
          artist: songData.artist,
          genre: songData.genre || null,
          key: songData.key || null,
          notes: songData.notes || null,
          albumArtUrl: songData.albumArtUrl || null
        });

      if (error) throw error;

      toast.success('Song added successfully');
      refreshSongs();
    } catch (error) {
      console.error('Error adding song:', error);
      toast.error('Failed to add song. Please try again.');
    }
  }, [isOnline, refreshSongs]);

  const handleUpdateSong = useCallback(async (updatedSong: Song) => {
    if (!isOnline) {
      toast.error('Cannot update song while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('songs')
        .update({
          title: updatedSong.title,
          artist: updatedSong.artist,
          genre: updatedSong.genre || null,
          key: updatedSong.key || null,
          notes: updatedSong.notes || null,
          albumArtUrl: updatedSong.albumArtUrl || null
        })
        .eq('id', updatedSong.id);

      if (error) throw error;

      toast.success('Song updated successfully');
      refreshSongs();
    } catch (error) {
      console.error('Error updating song:', error);
      toast.error('Failed to update song. Please try again.');
    }
  }, [isOnline, refreshSongs]);

  const handleDeleteSong = useCallback(async (id: string) => {
    if (!isOnline) {
      toast.error('Cannot delete song while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Song deleted successfully');
      refreshSongs();
    } catch (error) {
      console.error('Error deleting song:', error);
      toast.error('Failed to delete song. Please try again.');
    }
  }, [isOnline, refreshSongs]);

  // Set list management
  const handleCreateSetList = useCallback(async (setListData: Omit<SetList, 'id' | 'songs'>) => {
    if (!isOnline) {
      toast.error('Cannot create set list while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('set_lists')
        .insert({
          name: setListData.name,
          date: setListData.date,
          notes: setListData.notes || '',
          is_active: setListData.isActive || false
        });

      if (error) throw error;

      toast.success('Set list created successfully');
      refreshSetLists();
    } catch (error) {
      console.error('Error creating set list:', error);
      toast.error('Failed to create set list. Please try again.');
    }
  }, [isOnline, refreshSetLists]);

  const handleUpdateSetList = useCallback(async (updatedSetList: SetList) => {
    if (!isOnline) {
      toast.error('Cannot update set list while offline. Please check your internet connection.');
      return;
    }
    
    try {
      const { id, songs, ...setListData } = updatedSetList;
      
      // Convert camelCase to snake_case for database
      const dbSetListData = {
        name: setListData.name,
        date: setListData.date,
        notes: setListData.notes,
        is_active: setListData.isActive || false
      };
      
      // Update set list data
      const { error } = await supabase
        .from('set_lists')
        .update(dbSetListData)
        .eq('id', id);
        
      if (error) throw error;
      
      // Clear existing songs
      const { error: deleteError } = await supabase
        .from('set_list_songs')
        .delete()
        .eq('set_list_id', id);
        
      if (deleteError) throw deleteError;
      
      // Insert updated songs
      if (songs && songs.length > 0) {
        const songMappings = songs.map((song, index) => ({
          set_list_id: id,
          song_id: song.id,
          position: index
        }));
        
        const { error: insertError } = await supabase
          .from('set_list_songs')
          .insert(songMappings);
          
        if (insertError) throw insertError;
      }
      
      toast.success('Set list updated successfully');
      refreshSetLists();
    } catch (error) {
      console.error('Error updating set list:', error);
      
      if (error instanceof Error && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.message.includes('network'))
      ) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error('Failed to update set list. Please try again.');
      }
    }
  }, [refreshSetLists, isOnline]);

  const handleDeleteSetList = useCallback(async (id: string) => {
    if (!isOnline) {
      toast.error('Cannot delete set list while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('set_lists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Set list deleted successfully');
      refreshSetLists();
    } catch (error) {
      console.error('Error deleting set list:', error);
      toast.error('Failed to delete set list. Please try again.');
    }
  }, [isOnline, refreshSetLists]);

  // Request queue management
  const handleLockRequest = useCallback(async (id: string) => {
    if (!isOnline) {
      toast.error('Cannot update requests while offline.');
      return;
    }
    
    try {
      const startTime = Date.now();
      
      // Use the atomic lock function
      const { error } = await supabase.rpc('lock_request', { request_id: id });
      if (error) throw error;
      
      const lockTime = Date.now() - startTime;
      console.log(`⚡ Lock operation completed in ${lockTime}ms`);
      
      toast.success('Request locked as next song');
    } catch (error) {
      console.error('Error toggling request lock:', error);
      
      if (error instanceof Error && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.message.includes('network'))
      ) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error('Failed to update request. Please try again.');
      }
    }
  }, [isOnline, refreshRequests]);

  const handleMarkPlayed = useCallback(async (requestId: string) => {
    if (!isOnline) {
      toast.error('Cannot mark request as played while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('requests')
        .update({ 
          is_played: true,
          is_locked: false,
          status: 'played'
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Request marked as played');
      refreshRequests();
    } catch (error) {
      console.error('Error marking request as played:', error);
      toast.error('Failed to mark request as played. Please try again.');
    }
  }, [isOnline, refreshRequests]);

  const handleDeleteRequest = useCallback(async (requestId: string) => {
    if (!isOnline) {
      toast.error('Cannot delete request while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Request deleted');
      refreshRequests();
    } catch (error) {
      console.error('Error deleting request:', error);
      toast.error('Failed to delete request. Please try again.');
    }
  }, [isOnline, refreshRequests]);

  const handleClearQueue = useCallback(async () => {
    if (!isOnline) {
      toast.error('Cannot clear queue while offline. Please check your internet connection.');
      return;
    }

    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('is_played', false);

      if (error) throw error;

      toast.success('Queue cleared');
      refreshRequests();
    } catch (error) {
      console.error('Error clearing queue:', error);
      toast.error('Failed to clear queue. Please try again.');
    }
  }, [isOnline, refreshRequests]);

  // Render backend content based on active tab
  const renderBackendContent = () => {
    switch (activeBackendTab) {
      case 'queue':
        return (
          <QueueView
            requests={requests}
            onLockRequest={handleLockRequest}
            onMarkPlayed={handleMarkPlayed}
            onDeleteRequest={handleDeleteRequest}
            onClearQueue={handleClearQueue}
          />
        );
      case 'songs':
        return (
          <SongLibrary
            songs={songs}
            onAddSong={handleAddSong}
            onUpdateSong={handleUpdateSong}
            onDeleteSong={handleDeleteSong}
          />
        );
      case 'setlists':
        return (
          <SetListManager
            songs={songs}
            setLists={setLists}
            onCreateSetList={handleCreateSetList}
            onUpdateSetList={handleUpdateSetList}
            onDeleteSetList={handleDeleteSetList}
          />
        );
      case 'settings':
        return <SettingsManager />;
      case 'logo':
        return <LogoManager />;
      case 'colors':
        return <ColorCustomizer />;
      case 'ticker':
        return <TickerManager />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        {isInitializing ? (
          <LoadingSpinner />
        ) : isKiosk ? (
          <KioskPage
            songs={songs}
            requests={requests}
            onSubmitRequest={handleSubmitRequest}
            settings={settings}
          />
        ) : isBackend ? (
          isAdmin ? (
            <div className="backend-container">
              <BackendTabs
                activeTab={activeBackendTab}
                onTabChange={setActiveBackendTab}
                onLogout={handleAdminLogout}
              />
              {renderBackendContent()}
            </div>
          ) : (
            <BackendLogin onLogin={handleAdminLogin} />
          )
        ) : (
          <UserFrontend
            songs={songs}
            requests={requests}
            currentUser={currentUser}
            onUserUpdate={handleUserUpdate}
            onSubmitRequest={handleSubmitRequest}
            onVoteRequest={handleVoteRequest}
            settings={settings}
          />
        )}
        <ConnectionStatus isOnline={isOnline} />
      </div>
    </ErrorBoundary>
  );
}

export default App