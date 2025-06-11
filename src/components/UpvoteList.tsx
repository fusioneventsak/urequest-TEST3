import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ThumbsUp, Clock, Star, User, Lock, MoreVertical, Trash2, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import type { SongRequest, Song, User as UserType, SetList, RequestFormData } from '../types';

const MAX_PHOTO_SIZE = 250 * 1024; // 250KB limit for database storage
const MAX_REQUEST_RETRIES = 3;

interface UpvoteListProps {
  requests: SongRequest[];
  songs: Song[];
  currentUser: UserType;
  onSubmitRequest: (data: RequestFormData) => Promise<boolean>;
  onVoteRequest: (id: string) => Promise<boolean>;
  onUpdateUser: (user: UserType, photoFile?: File) => void;
  activeSetList: SetList | null;
  setLists: SetList[];
  refreshSetLists: () => void;
  isOnline: boolean;
  reconnectRequests: () => void;
}

export function UpvoteList({
  requests,
  songs,
  currentUser,
  onSubmitRequest,
  onVoteRequest,
  onUpdateUser,
  activeSetList,
  setLists,
  refreshSetLists,
  isOnline,
  reconnectRequests
}: UpvoteListProps) {
  // Ref to track if component is mounted
  const mountedRef = useRef(true);
  const requestInProgressRef = useRef(false);
  const requestRetriesRef = useRef(0);

  // Enhanced photo compression function with aggressive compression for database storage
  const compressPhoto = useCallback((
    file: File,
    maxSizeKB: number = 200
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate dimensions to maintain aspect ratio while reducing size
          const maxDimension = 400; // Smaller max dimension for better compression
          let { width, height } = img;
          
          if (width > height) {
            if (width > maxDimension) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Start with moderate compression
          let quality = 0.8;
          let result = canvas.toDataURL('image/jpeg', quality);
          
          // Iteratively compress until under size limit
          while ((result.length * 3) / 4 / 1024 > maxSizeKB && quality > 0.05) {
            quality -= 0.05;
            result = canvas.toDataURL('image/jpeg', quality);
          }

          // Final check - if still too large, try extreme compression
          if ((result.length * 3) / 4 / 1024 > maxSizeKB && quality > 0.05) {
            quality = Math.max(0.1, quality - 0.3);
            result = canvas.toDataURL('image/jpeg', quality);
          }

          // Warn about high compression if quality is very low
          if (quality <= 0.2) {
            console.warn(`High compression applied (quality: ${quality.toFixed(2)}) to fit ${maxSizeKB}KB limit`);
          }

          // Log compression details
          const originalSizeKB = file.size / 1024;
          const finalSizeKB = (result.length * 3) / 4 / 1024;
          const compressionRatio = ((originalSizeKB - finalSizeKB) / originalSizeKB * 100).toFixed(1);
          
          console.log(`Photo compressed: ${Math.round(originalSizeKB)}KB → ${Math.round(finalSizeKB)}KB (${compressionRatio}% reduction)`);

          // Final size check with hard limit
          if (finalSizeKB > maxSizeKB * 1.1) { // Allow 10% tolerance
            reject(new Error(`Unable to compress image below ${maxSizeKB}KB limit. Current size: ${Math.round(finalSizeKB)}KB. Please use a smaller image or reduce image dimensions before uploading.`));
            return;
          }

          resolve(result);
        } catch (error) {
          reject(new Error('Failed to compress image'));
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      
      // Don't show errors for aborted requests or unmounted components
      const errorMessage = event.reason?.message || String(event.reason);
      if (errorMessage.includes('aborted') || 
          errorMessage.includes('Component unmounted') ||
          errorMessage.includes('channel closed')) {
        // Silently handle these errors
        event.preventDefault();
        return;
      }
      
      // Show toast for network errors
      if (errorMessage.includes('Failed to fetch') || 
          errorMessage.includes('NetworkError') || 
          errorMessage.includes('network')) {
        toast.error('Network connection issue. Please check your internet connection.');
        event.preventDefault();
        return;
      }
      
      // Show generic error for other unhandled errors
      toast.error('An error occurred. Please try again later.');
      event.preventDefault();
    };

    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network connection restored');
      setIsOnline(true);
      
      // Attempt to reconnect and refresh data
      reconnectRequests();
      refreshSetLists();
      
      toast.success('Network connection restored');
    };

    const handleOffline = () => {
      console.log('🌐 Network connection lost');
      setIsOnline(false);
      toast.error('Network connection lost. You can still view cached content.');
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reconnectRequests, refreshSetLists]);

  // Enhanced user update function with photo validation and compression
  const handleUserUpdate = useCallback(async (user: UserType, photoFile?: File) => {
    try {
      let finalUser = { ...user };

      // Handle photo upload if provided
      if (photoFile) {
        try {
          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
          if (!allowedTypes.includes(photoFile.type)) {
            throw new Error('Please select a JPEG, PNG, or WebP image file');
          }

          // Check file size (10MB limit before compression)
          if (photoFile.size > 10 * 1024 * 1024) {
            throw new Error('Image file is too large. Please select an image smaller than 10MB');
          }

          // Compress the photo to 200KB limit for database storage
          const compressedPhoto = await compressPhoto(photoFile, 200);
          finalUser.photo = compressedPhoto;

          toast.success('📱 Photo uploaded and optimized for database storage!');
        } catch (photoError) {
          console.error('Photo processing error:', photoError);
          toast.error(photoError instanceof Error ? photoError.message : 'Failed to process photo');
          return;
        }
      }

      // Validate final user data
      if (!finalUser.name.trim()) {
        toast.error('Please enter your name');
        return;
      }

      // Enhanced photo size validation for database storage
      if (finalUser.photo && finalUser.photo.startsWith('data:')) {
        const base64Length = finalUser.photo.length - (finalUser.photo.indexOf(',') + 1);
        const sizeKB = (base64Length * 3) / 4 / 1024;
        
        // 250KB limit for database storage
        if (sizeKB > 250) {
          toast.error(`Profile photo is too large (${Math.round(sizeKB)}KB). Maximum size is 250KB for database storage.`);
          return;
        }
      }

      // Update user state and save to localStorage
      setCurrentUser(finalUser);
      
      try {
        localStorage.setItem('currentUser', JSON.stringify(finalUser));
      } catch (e) {
        console.error('Error saving user to localStorage:', e);
        // Still proceed even if localStorage fails
        toast.warning('Profile updated but could not be saved locally');
      }
      
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update profile. Please try again.');
    }
  }, [compressPhoto]);

  // Handle logo click
  const onLogoClick = useCallback(() => {
    // Empty function to handle logo clicks
  }, []);

  // Generate default avatar
  const generateDefaultAvatar = (name: string): string => {
    // Generate a simple SVG with the user's initials
    const initials = name.split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    
    // Random pastel background color
    const hue = Math.floor(Math.random() * 360);
    const bgColor = `hsl(${hue}, 70%, 80%)`;
    const textColor = '#333';
      
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
        <rect width="100" height="100" fill="${bgColor}" />
        <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
              fill="${textColor}" text-anchor="middle" dominant-baseline="central">${initials}</text>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  // Handle song request submission with retry logic and enhanced photo support
  const handleSubmitRequest = useCallback(async (data: RequestFormData): Promise<boolean> => {
    if (requestInProgressRef.current) {
      console.log('Request already in progress, please wait...');
      toast.error('A request is already being processed. Please wait a moment and try again.');
      return false;
    }
    
    requestInProgressRef.current = true;
    
    try {
      console.log('Submitting request:', data);
      
      // Enhanced photo size validation for database storage
      if (data.userPhoto && data.userPhoto.startsWith('data:')) {
        const base64Length = data.userPhoto.length - (data.userPhoto.indexOf(',') + 1);
        const sizeKB = (base64Length * 3) / 4 / 1024;
        
        // 250KB limit for database storage
        if (sizeKB > 250) {
          throw new Error(`Your profile photo is too large (${Math.round(sizeKB)}KB). Maximum size is 250KB for database storage.`);
        }
      }

      // Create the request record
      const requestData = {
        id: uuidv4(),
        title: data.title,
        artist: data.artist || null,
        votes: 0,
        user_name: data.userName,
        user_photo: data.userPhoto || null,
        notes: data.notes || null,
        is_played: false,
        is_locked: false,
        created_at: new Date().toISOString(),
        set_list_id: activeSetList?.id || null
      };

      const { error } = await supabase
        .from('requests')
        .insert(requestData);

      if (error) throw error;

      // Update current user if provided
      if (data.userName && data.userName !== currentUser?.name) {
        const updatedUser = {
          id: currentUser?.id || data.userName,
          name: data.userName,
          photo: data.userPhoto || currentUser?.photo || null
        };
        
        setCurrentUser(updatedUser);
        
        try {
          localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        } catch (e) {
          console.error('Error saving user to localStorage:', e);
        }
      }

      // Reset retry count on success
      requestRetriesRef.current = 0;
      
      toast.success('🎵 Song request submitted successfully!');
      return true;
    } catch (error) {
      console.error('Error submitting request:', error);
      
      // If we get channel closed errors, attempt to reconnect
      if (error instanceof Error && 
          (error.message.includes('channel') || 
           error.message.includes('Failed to fetch') || 
           error.message.includes('NetworkError'))) {
        
        reconnectRequests();
        
        // Try to retry the request automatically
        if (requestRetriesRef.current < MAX_REQUEST_RETRIES) {
          requestRetriesRef.current++;
          
          const delay = Math.pow(2, requestRetriesRef.current) * 1000; // Exponential backoff
          console.log(`Automatically retrying request in ${delay/1000} seconds (attempt ${requestRetriesRef.current}/${MAX_REQUEST_RETRIES})...`);
          
          setTimeout(() => {
            if (mountedRef.current) {
              requestInProgressRef.current = false;
              handleSubmitRequest(data).catch(console.error);
            }
          }, delay);
          
          return false;
        }
      }
      
      if (error instanceof Error) {
        const errorMsg = error.message.includes('rate limit') 
          ? 'Too many requests. Please try again later.'
          : error.message || 'Failed to submit request. Please try again.';
        toast.error(errorMsg);
      } else {
        toast.error('Failed to submit request. Please try again.');
      }
      
      // Reset retry count on giving up
      requestRetriesRef.current = 0;
      
      return false;
    } finally {
      requestInProgressRef.current = false;
    }
  }, [reconnectRequests, generateDefaultAvatar]);

  // Handle request vote with error handling
  const handleVoteRequest = useCallback(async (id: string): Promise<boolean> => {
    if (!isOnline) {
      toast.error('Cannot vote while offline. Please check your internet connection.');
      return false;
    }
    
    try {
      if (!currentUser || !currentUser.id) {
        throw new Error('You must be logged in to vote');
      }

      // Check if user already voted
      const { data: existingVote, error: checkError } = await supabase
        .from('user_votes')
        .select('id')
        .eq('request_id', id)
        .eq('user_id', currentUser.id || currentUser.name)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') { // Not found is ok
        throw checkError;
      }

      if (existingVote) {
        toast.error('You have already voted for this request');
        return false;
      }

      // Get current votes
      const { data, error: getError } = await supabase
        .from('requests')
        .select('votes')
        .eq('id', id)
        .single();
        
      if (getError) throw getError;
      
      // Update votes count
      const currentVotes = data?.votes || 0;
      const { error: updateError } = await supabase
        .from('requests')
        .update({ votes: currentVotes + 1 })
        .eq('id', id);
        
      if (updateError) throw updateError;
      
      // Record vote to prevent duplicates
      const { error: voteError } = await supabase
        .from('user_votes')
        .insert({
          request_id: id,
          user_id: currentUser.id || currentUser.name,
          created_at: new Date().toISOString()
        });
        
      if (voteError) throw voteError;
        
      toast.success('Vote added!');
      return true;
    } catch (error) {
      console.error('Error voting for request:', error);
      
      if (error instanceof Error && error.message.includes('already voted')) {
        toast.error(error.message);
      } else if (error instanceof Error && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.message.includes('network'))
      ) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error('Failed to vote for this request. Please try again.');
      }
      
      return false;
    }
  }, [currentUser, isOnline]);

  // Handle locking a request (marking it as next)
  const handleLockRequest = useCallback(async (id: string) => {
    if (!isOnline) {
      toast.error('Cannot update requests while offline. Please check your connection and try again.');
      return;
    }
    
    try {
      // First unlock any currently locked requests
      const { error: unlockError } = await supabase
        .from('requests')
        .update({ is_locked: false })
        .eq('is_locked', true)
        .eq('is_played', false);
        
      if (unlockError) throw unlockError;
      
      // Lock the selected request
      const { error: lockError } = await supabase
        .from('requests')
        .update({ is_locked: true })
        .eq('id', id);
        
      if (lockError) throw lockError;
      
      toast.success('Request marked as next to play');
    } catch (error) {
      console.error('Error locking request:', error);
      
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
  }, [isOnline]);

  // Handle resetting the request queue
  const handleResetQueue = useCallback(async () => {
    if (!isOnline) {
      toast.error('Cannot reset queue while offline. Please check your internet connection.');
      return;
    }
    
    try {
      // Count requests to be cleared
      const pendingRequests = requests.filter(r => !r.isPlayed).length;
      
      // Reset all pending requests
      const { error } = await supabase
        .from('requests')
        .update({ 
          is_played: true,
          is_locked: false,
          votes: 0
        })
        .eq('is_played', false);
        
      if (error) throw error;
      
      // Log the reset
      const { error: logError } = await supabase
        .from('queue_reset_logs')
        .insert({
          set_list_id: activeSetList?.id,
          reset_type: 'manual',
          requests_cleared: pendingRequests
        });
        
      if (logError) console.error('Error logging queue reset:', logError);

      // Clear rate limits with proper WHERE clause
      const { error: votesError } = await supabase
        .from('user_votes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
        
      if (votesError) console.error('Error clearing vote limits:', votesError);
      
      toast.success('Request queue cleared and rate limits reset');
    } catch (error) {
      console.error('Error resetting queue:', error);
      
      if (error instanceof Error && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.message.includes('network'))
      ) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error('Failed to clear queue. Please try again.');
      }
    }
  }, [requests, activeSetList, isOnline]);

  // Handle adding a new song
  const handleAddSong = useCallback((song: Omit<Song, 'id'>) => {
    setSongs(prev => [...prev, { ...song, id: uuidv4() }]);
  }, []);

  // Handle updating a song
  const handleUpdateSong = useCallback((updatedSong: Song) => {
    setSongs(prev => prev.map(song => 
      song.id === updatedSong.id ? updatedSong : song
    ));
  }, []);

  // Handle deleting a song
  const handleDeleteSong = useCallback((id: string) => {
    setSongs(prev => prev.filter(song => song.id !== id));
  }, []);

  // Handle creating a new set list - FIXED: Complete the console.error statement
  const handleCreateSetList = useCallback(async (newSetList: Omit<SetList, 'id'>) => {
    if (!isOnline) {
      toast.error('Cannot create set list while offline. Please check your internet connection.');
      return;
    }
    
    try {
      // Extract songs from the set list to handle separately
      const { songs, ...setListData } = newSetList;
      
      // Convert camelCase to snake_case for database
      const dbSetListData = {
        name: setListData.name,
        date: setListData.date,
        notes: setListData.notes,
        is_active: setListData.isActive || false
      };
      
      // Insert the set list
      const { data, error } = await supabase
        .from('set_lists')
        .insert(dbSetListData)
        .select();
        
      if (error) throw error;
      
      if (data && songs && songs.length > 0) {
        // Insert songs with positions
        const songMappings = songs.map((song, index) => ({
          set_list_id: data[0].id,
          song_id: song.id,
          position: index
        }));
        
        const { error: songError } = await supabase
          .from('set_list_songs')
          .insert(songMappings);
          
        if (songError) throw songError;
      }
      
      toast.success('Set list created successfully');
      refreshSetLists(); // Refresh to get latest data
    } catch (error) {
      console.error('Error creating set list:', error);
      toast.error('Failed to create set list. Please try again.');
    }
  }, [isOnline, refreshSetLists]);

  // Filter requests to show only pending ones, sorted by votes
  const sortedRequests = useMemo(() => {
    return requests
      .filter(r => !r.isPlayed)
      .sort((a, b) => {
        // Locked requests first
        if (a.isLocked && !b.isLocked) return -1;
        if (!a.isLocked && b.isLocked) return 1;
        
        // Then by votes (descending)
        if (b.votes !== a.votes) return b.votes - a.votes;
        
        // Then by creation time (oldest first)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [requests]);

  const lockedRequest = sortedRequests.find(r => r.isLocked);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ThumbsUp className="w-5 h-5" />
            Request Queue
            {sortedRequests.length > 0 && (
              <span className="bg-purple-500/30 text-purple-200 text-sm px-2 py-1 rounded-full">
                {sortedRequests.length}
              </span>
            )}
          </h2>
          
          {/* Connection status indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm text-white/70">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Current song playing (locked request) */}
      {lockedRequest && (
        <div className="bg-gradient-to-r from-purple-600/30 to-pink-600/30 border-b border-white/20 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Play className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-medium text-sm">NOW PLAYING</span>
              </div>
              <h3 className="font-bold text-white">{lockedRequest.title}</h3>
              {lockedRequest.artist && (
                <p className="text-white/70 text-sm">by {lockedRequest.artist}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lockedRequest.userPhoto ? (
                <img 
                  src={lockedRequest.userPhoto} 
                  alt={lockedRequest.userName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white/70" />
                </div>
              )}
              <span className="text-white/70 text-sm">{lockedRequest.userName}</span>
            </div>
          </div>
        </div>
      )}

      {/* Request list */}
      <div className="flex-1 overflow-y-auto">
        {sortedRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 p-8">
            <ThumbsUp className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-medium mb-2">No requests yet</h3>
            <p className="text-center">
              Song requests will appear here once submitted
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {sortedRequests.map((request, index) => (
              <div 
                key={request.id}
                className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 border transition-all hover:bg-white/15 ${
                  request.isLocked 
                    ? 'border-yellow-400/50 bg-yellow-400/10' 
                    : 'border-white/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Position number */}
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {index + 1}
                  </div>

                  {/* Song info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-white truncate">{request.title}</h4>
                      {request.isLocked && (
                        <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                    
                    {request.artist && (
                      <p className="text-white/70 text-sm mb-2">by {request.artist}</p>
                    )}

                    {request.notes && (
                      <p className="text-white/60 text-sm mb-2 italic">"{request.notes}"</p>
                    )}

                    {/* User info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {request.userPhoto ? (
                          <img 
                            src={request.userPhoto} 
                            alt={request.userName}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                            <User className="w-3 h-3 text-white/70" />
                          </div>
                        )}
                        <span className="text-white/70 text-sm">{request.userName}</span>
                        <span className="text-white/50 text-xs">
                          {new Date(request.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Vote count and button */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleVoteRequest(request.id)}
                          disabled={!isOnline}
                          className="flex items-center gap-1 bg-purple-500/20 text-purple-200 px-3 py-1 rounded-full text-sm transition-colors hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>{request.votes}</span>
                        </button>
                      </div>
                    </div>
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