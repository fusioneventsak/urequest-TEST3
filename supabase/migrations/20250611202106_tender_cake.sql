/*
  # Ultra-Fast Queue Operations
  
  1. New Functions
    - `clear_queue_ultra_fast` - Atomic queue clearing with vote cleanup
    - `submit_request_ultra_fast` - Optimized request submission with deduplication
  
  2. Performance Improvements
    - Single transaction for queue operations
    - Atomic updates to prevent race conditions
    - Optimized indexes for faster lookups
*/

-- Create atomic ultra-fast queue clearing function
CREATE OR REPLACE FUNCTION clear_queue_ultra_fast()
RETURNS TABLE(cleared_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cleared_requests INTEGER;
BEGIN
  SELECT COUNT(*) INTO cleared_requests FROM requests WHERE is_played = false;
  UPDATE requests SET is_played = true, is_locked = false, votes = 0 WHERE is_played = false;
  DELETE FROM user_votes WHERE request_id IN (SELECT id FROM requests WHERE is_played = true);
  RETURN QUERY SELECT cleared_requests;
END;
$$;

-- Enhanced request submission function (already exists but ensure it's optimized)
CREATE OR REPLACE FUNCTION submit_request_ultra_fast(
  p_title TEXT,
  p_artist TEXT, 
  p_requester_name TEXT,
  p_requester_photo TEXT,
  p_requester_message TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  
AS $$
DECLARE
  existing_id UUID;
  new_request_id UUID;
BEGIN
  -- Check for existing request
  SELECT id INTO existing_id FROM requests 
  WHERE title = p_title AND (artist = p_artist OR (artist IS NULL AND p_artist = '')) 
  AND is_played = false LIMIT 1;
  
  IF existing_id IS NOT NULL THEN
    -- Add to existing request
    INSERT INTO requesters (id, request_id, name, photo, message, created_at)
    VALUES (gen_random_uuid(), existing_id, p_requester_name, p_requester_photo, p_requester_message, NOW());
    RETURN existing_id;
  ELSE
    -- Create new request
    new_request_id := gen_random_uuid();
    INSERT INTO requests (id, title, artist, votes, status, created_at)
    VALUES (new_request_id, p_title, p_artist, 1, 'pending', NOW());
    INSERT INTO requesters (id, request_id, name, photo, message, created_at) 
    VALUES (gen_random_uuid(), new_request_id, p_requester_name, p_requester_photo, p_requester_message, NOW());
    RETURN new_request_id;
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