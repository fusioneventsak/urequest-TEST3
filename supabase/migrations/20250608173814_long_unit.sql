/*
  # Add Realtime Connection Tracking and Performance Improvements
  
  1. New Tables
    - `realtime_connection_logs` to track connection status and errors
    
  2. New Functions
    - `log_realtime_connection` to record connection events
    - `cleanup_old_connection_logs` to prevent table bloat
    - `trigger_cleanup_old_connection_logs` to automate cleanup
    
  3. Performance Improvements
    - Add indexes for common query patterns
    - Add constraints to ensure data integrity
*/

-- Create enum for realtime connection status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'realtime_connection_status') THEN
    CREATE TYPE realtime_connection_status AS ENUM ('connected', 'disconnected', 'error');
  END IF;
END $$;

-- Create a table to track realtime connection status
CREATE TABLE IF NOT EXISTS realtime_connection_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status realtime_connection_status NOT NULL,
    client_id text NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS on the logs table
ALTER TABLE realtime_connection_logs ENABLE ROW LEVEL SECURITY;

-- Add policy for connection logs
CREATE POLICY "Allow public to insert connection logs"
    ON realtime_connection_logs
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_realtime_connection_logs_created_at 
    ON realtime_connection_logs(created_at DESC);

-- Add function to log connection status
CREATE OR REPLACE FUNCTION log_realtime_connection(
    p_status realtime_connection_status,
    p_client_id text,
    p_error_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    log_id uuid;
BEGIN
    INSERT INTO realtime_connection_logs (status, client_id, error_message)
    VALUES (p_status, p_client_id, p_error_message)
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- Add function to clean up old connection logs
CREATE OR REPLACE FUNCTION cleanup_old_connection_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Keep only the last 1000 logs
    DELETE FROM realtime_connection_logs
    WHERE id NOT IN (
        SELECT id FROM realtime_connection_logs
        ORDER BY created_at DESC
        LIMIT 1000
    );
END;
$$;

-- Add trigger to clean up old logs periodically
CREATE OR REPLACE FUNCTION trigger_cleanup_old_connection_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Run cleanup every 100 inserts
    IF (SELECT count(*) FROM realtime_connection_logs) > 1100 THEN
        PERFORM cleanup_old_connection_logs();
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger for periodic cleanup
DROP TRIGGER IF EXISTS cleanup_connection_logs_trigger ON realtime_connection_logs;
CREATE TRIGGER cleanup_connection_logs_trigger
    AFTER INSERT ON realtime_connection_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_cleanup_old_connection_logs();

-- Add function to handle channel errors
CREATE OR REPLACE FUNCTION handle_channel_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log the error
    PERFORM log_realtime_connection('error', NEW.client_id, NEW.error_message);
    RETURN NEW;
END;
$$;

-- Add indexes to improve query performance for common operations
CREATE INDEX IF NOT EXISTS idx_requests_title_artist_not_played 
    ON requests(title, artist) 
    WHERE is_played = false;

CREATE INDEX IF NOT EXISTS idx_requesters_request_id_name 
    ON requesters(request_id, name);

-- Add constraints to ensure data integrity
-- First check if constraints already exist
DO $$
BEGIN
    -- Check for request_title_not_empty constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'request_title_not_empty'
    ) THEN
        ALTER TABLE requests 
        ADD CONSTRAINT request_title_not_empty 
        CHECK (trim(title) <> '');
    END IF;

    -- Check for requester_name_not_empty constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'requester_name_not_empty'
    ) THEN
        ALTER TABLE requesters 
        ADD CONSTRAINT requester_name_not_empty 
        CHECK (trim(name) <> '');
    END IF;

    -- Check for requester_photo_not_empty constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'requester_photo_not_empty'
    ) THEN
        ALTER TABLE requesters 
        ADD CONSTRAINT requester_photo_not_empty 
        CHECK (photo IS NOT NULL AND photo <> '');
    END IF;
END $$;