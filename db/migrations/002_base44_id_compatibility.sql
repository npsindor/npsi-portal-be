DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'announcements', 'applications', 'events', 'event_registrations',
    'families', 'family_members', 'feedback', 'notifications', 'rules',
    'samitis', 'samiti_members', 'students', 'student_applications',
    'transactions', 'transfer_requests', 'users'
  ] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN id TYPE TEXT USING id::text', table_name);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS event_registrations ALTER COLUMN event_id TYPE TEXT USING event_id::text;
ALTER TABLE IF EXISTS transactions ALTER COLUMN event_id TYPE TEXT USING event_id::text;
ALTER TABLE IF EXISTS samiti_members ALTER COLUMN samiti_id TYPE TEXT USING samiti_id::text;