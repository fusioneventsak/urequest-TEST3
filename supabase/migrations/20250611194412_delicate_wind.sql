/*
  # Ultra-Fast Queue Operations
  
  1. New Functions
    - `clear_request_queue_ultra_fast` - Atomic queue clearing with vote cleanup
    - `ultra_fast_reset_queue` - Queue reset with logging and error handling
    - `submit_request_with_requester` - Atomic request submission
  
  2. Performance Improvements
    - Atomic database operations to eliminate race conditions
    - Single-query operations to reduce network round trips
    - Optimized indexes for faster lookups
    
  3. Security
    - All functions use SECURITY DEFINER with explicit search_path
    - Proper error handling and transaction management
*/

-- Create atomic ultra-fast queue clearing function
CREATE OR REPLACE FUNCTION clear_request_queue_ultra_fast()
RETURNS TABLE(cleared_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleared_requests INTEGER;
BEGIN
  -- Get count of requests being cleared
  SELECT COUNT(*) INTO cleared_requests
  FROM requests
  WHERE is_played = false;
  
  -- Atomic clear operation - mark all as played and unlock
  UPDATE requests 
  SET is_played = true,
      is_locked = false,
      votes = 0
  WHERE is_played = false;
  
  -- Clear all vote records in one operation
  DELETE FROM user_votes 
  WHERE request_id IN (
    SELECT id FROM requests WHERE is_played = true
  );
  
  -- Return the count for logging/feedback
  RETURN QUERY SELECT cleared_requests;
END;
$$;

-- Create function for ultra-fast queue reset with logging
CREATE OR REPLACE FUNCTION ultra_fast_reset_queue(
  p_set_list_id UUID DEFAULT NULL,
  p_reset_type TEXT DEFAULT 'manual'
)
RETURNS TABLE(
  success BOOLEAN,
  cleared_count INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleared_requests INTEGER;
  error_msg TEXT;
BEGIN
  -- Call the ultra-fast clear function
  SELECT * INTO cleared_requests FROM clear_request_queue_ultra_fast();
  
  -- Log the reset operation
  INSERT INTO queue_reset_logs (set_list_id, reset_type, requests_cleared)
  VALUES (p_set_list_id, p_reset_type, cleared_requests);
  
  -- Return success result
  RETURN QUERY SELECT 
    true as success,
    cleared_requests as cleared_count,
    CASE 
      WHEN cleared_requests = 0 THEN 'No requests to clear'
      WHEN cleared_requests = 1 THEN '1 request cleared'
      ELSE cleared_requests || ' requests cleared'
    END as message;
    
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT 
      false as success,
      0 as cleared_count,
      'Error: ' || error_msg as message;
END;
$$;

-- Create function for ultra-fast request submission
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
  requester_id UUID;
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
    INSERT INTO requests (id, title, artist, votes, status, is_locked, is_played, created_at)
    VALUES (request_id, song_title, song_artist, 0, 'pending', false, false, created_at);
    
    -- Insert requester
    INSERT INTO requesters (id, request_id, name, photo, message, created_at)
    VALUES (gen_random_uuid(), request_id, requester_name, requester_photo, requester_message, created_at);
  END IF;
END;
$$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_requests_pending 
ON requests(is_played) 
WHERE is_played = false;

CREATE INDEX IF NOT EXISTS idx_requests_title_artist_not_played 
ON requests(title, artist) 
WHERE is_played = false;

CREATE INDEX IF NOT EXISTS idx_user_votes_request_user 
ON user_votes(request_id, user_id);