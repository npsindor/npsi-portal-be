BEGIN;

UPDATE principles
SET section_number = section_number + 1,
    updated_at = NOW();

INSERT INTO principles (section_number, title_en, title_hi, content_en, content_hi, status)
VALUES (
  1,
  'Digital Organization and Technology',
  'डिजिटल संगठन एवं तकनीक',
  'Connecting the community through a Digital Platform, Family ID, Member ID, Website, and Mobile App, while making information, services, opportunities, and social activities organized and accessible.',
  'समाज को Digital Platform, Family ID, Member ID, Website और Mobile App के माध्यम से जोड़ना तथा सूचना, सेवाओं, अवसरों और सामाजिक गतिविधियों को व्यवस्थित एवं सुलभ बनाना।',
  'Active'
);

COMMIT;
