/*
  # Fix Set List Issues

  1. Changes
    - Drop all existing activation triggers and functions
    - Drop and recreate foreign key constraints with proper cascade
    - Add proper RLS policies for all operations
    - Fix activation logic to handle edge cases
    - Add proper indexes for performance
*/

-- First clean up any orphaned records
DELETE FROM set_list_songs
WHERE set_list_id NOT IN (SELECT id FROM set_lists);

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS handle_set_list_activation_trigger ON set_lists;
DROP FUNCTION IF EXISTS handle_set_list_activation();

-- Drop and recreate foreign keys with cascade delete
ALTER TABLE set_list_songs 
DROP CONSTRAINT IF EXISTS set_list_songs_set_list_id_fkey;

ALTER TABLE set_list_songs
ADD CONSTRAINT set_list_songs_set_list_id_fkey 
FOREIGN KEY (set_list_id) 
REFERENCES set_lists(id) 
ON DELETE CASCADE;

-- Drop existing policies
DROP POLICY IF EXISTS "Public delete access to set_lists" ON set_lists;
DROP POLICY IF EXISTS "Public delete access to set_list_songs" ON set_list_songs;
DROP POLICY IF EXISTS "Public read access to set_lists" ON set_lists;
DROP POLICY IF EXISTS "Public insert access to set_lists" ON set_lists;
DROP POLICY IF EXISTS "Public update access to set_lists" ON set_lists;

-- Create comprehensive RLS policies
CREATE POLICY "Public read access to set_lists"
  ON set_lists
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public insert access to set_lists"
  ON set_lists
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public update access to set_lists"
  ON set_lists
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public delete access to set_lists"
  ON set_lists
  FOR DELETE
  TO public
  USING (true);

-- Create simple but effective activation function
CREATE OR REPLACE FUNCTION handle_set_list_activation()
RETURNS TRIGGER AS $$
BEGIN
    -- If activating a set list
    IF NEW.is_active = true THEN
        -- Deactivate all other set lists
        UPDATE set_lists 
        SET is_active = false 
        WHERE id != NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger with proper timing
CREATE TRIGGER handle_set_list_activation_trigger
    BEFORE UPDATE ON set_lists
    FOR EACH ROW
    WHEN (NEW.is_active IS DISTINCT FROM OLD.is_active)
    EXECUTE FUNCTION handle_set_list_activation();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_set_lists_active 
    ON set_lists(is_active) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_set_list_songs_set_list_id 
    ON set_list_songs(set_list_id);