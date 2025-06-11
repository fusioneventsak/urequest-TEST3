import React, { useState } from 'react';
import { X, Music } from 'lucide-react';
import type { Song, RequestFormData } from '../types';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RequestFormData) => void;
  selectedSong?: Song;
  currentUser: { name: string; photo: string } | null;
}

export function RequestModal({
  isOpen,
  onClose,
  onSubmit,
  selectedSong,
  currentUser
}: RequestModalProps) {
  const [formData, setFormData] = useState<RequestFormData>({
    title: selectedSong?.title || '',
    artist: selectedSong?.artist || '',
    requestedBy: currentUser?.name || '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      return;
    }

    onSubmit({
      ...formData,
      userPhoto: currentUser?.photo
    });
    
    // Reset form
    setFormData({
      title: '',
      artist: '',
      requestedBy: currentUser?.name || '',
      message: ''
    });
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Music className="w-5 h-5" />
            Request a Song
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Song Title *
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter song title"
              required
            />
          </div>

          <div>
            <label htmlFor="artist" className="block text-sm font-medium text-gray-700 mb-1">
              Artist
            </label>
            <input
              type="text"
              id="artist"
              value={formData.artist}
              onChange={(e) => setFormData(prev => ({ ...prev, artist: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter artist name"
            />
          </div>

          <div>
            <label htmlFor="requestedBy" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name *
            </label>
            <input
              type="text"
              id="requestedBy"
              value={formData.requestedBy}
              onChange={(e) => setFormData(prev => ({ ...prev, requestedBy: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your name"
              required
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message (optional)
            </label>
            <textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add a message with your request"
              rows={3}
              maxLength={100}
            />
            <div className="text-xs text-gray-500 mt-1">
              {formData.message.length}/100 characters
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}