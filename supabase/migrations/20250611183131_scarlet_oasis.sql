/*
  # Add Atomic Database Functions for Faster Realtime Operations
  
  1. New Functions
    - `lock_request` - Atomic function to lock a request and unlock all others
    - `unlock_request` - Atomic function to unlock a specific request
    - `add_vote` - Atomic function to add a vote with duplicate checking
    - `submit_request_with_requester` - Atomic function to create request and requester in one transaction
  
  2. Performance
    - Reduces network round trips
    - Eliminates race conditions
    - Improves concurrency handling
    - Reduces client-side processing
*/

-- Create a function for atomic lock operations
CREATE OR REPLACE FUNCTION lock_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First unlock all requests
  UPDATE requests 
  SET is_locked = false 
  WHERE is_locked = true;
  
  -- Then lock the specified request
  UPDATE requests 
  SET is_locked = true 
  WHERE id = request_id;
END;
$$;

-- Create a function to unlock a request
CREATE OR REPLACE FUNCTION unlock_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simply unlock the specified request
  UPDATE requests 
  SET is_locked = false 
  WHERE id = request_id;
END;
$$;

-- Create a function for atomic vote operations
CREATE OR REPLACE FUNCTION add_vote(p_request_id UUID, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vote_exists BOOLEAN;
BEGIN
  -- Check if vote already exists
  SELECT EXISTS(
    SELECT 1 FROM user_votes 
    WHERE request_id = p_request_id AND user_id = p_user_id
  ) INTO vote_exists;
  
  IF vote_exists THEN
    RETURN FALSE; -- Already voted
  END IF;
  
  -- Insert vote and increment counter atomically
  INSERT INTO user_votes (request_id, user_id, created_at) 
  VALUES (p_request_id, p_user_id, NOW());
  
  UPDATE requests 
  SET votes = votes + 1 
  WHERE id = p_request_id;
  
  RETURN TRUE; -- Success
END;
$$;

-- Create a function for fast request submission
CREATE OR REPLACE FUNCTION submit_request_with_requester(
  request_id UUID,
  song_title TEXT,
  song_artist TEXT,
  requester_name TEXT,
  requester_photo TEXT,
  requester_message TEXT,
  created_at TIMESTAMPTZ
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_request_id UUID;
BEGIN
  -- Check if request already exists
  SELECT id INTO existing_request_id
  FROM requests
  WHERE title = song_title 
    AND (artist = song_artist OR (artist IS NULL AND song_artist = ''))
    AND is_played = false
  LIMIT 1;
  
  -- If request exists, use that ID
  IF existing_request_id IS NOT NULL THEN
    -- Add requester to existing request
    INSERT INTO requesters (id, request_id, name, photo, message, created_at)
    VALUES (gen_random_uuid(), existing_request_id, requester_name, requester_photo, requester_message, created_at);
  ELSE
    -- Insert new request
    INSERT INTO requests (id, title, artist, votes, status, created_at)
    VALUES (request_id, song_title, song_artist, 1, 'pending', created_at);
    
    -- Insert requester
    INSERT INTO requesters (id, request_id, name, photo, message, created_at)
    VALUES (gen_random_uuid(), request_id, requester_name, requester_photo, requester_message, created_at);
  END IF;
END;
$$;

-- Add index for faster lock queries if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_requests_is_locked 
ON requests(is_locked) 
WHERE is_locked = true;

-- Add index for faster vote lookups
CREATE INDEX IF NOT EXISTS idx_user_votes_lookup 
ON user_votes (request_id, user_id);

-- Add index for faster queue sorting by priority
CREATE INDEX IF NOT EXISTS idx_requests_priority 
ON requests (votes DESC, created_at ASC) 
WHERE is_played = false;