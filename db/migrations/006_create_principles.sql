CREATE TABLE IF NOT EXISTS principles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  section_number INTEGER,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  content_en TEXT NOT NULL,
  content_hi TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DELETE FROM principles;

INSERT INTO principles (section_number, title_en, title_hi, content_en, content_hi, status) VALUES
(1, 'Unity and Brotherhood', '🤝 एकता एवं भाईचारा', 'Bringing all families and members together as one community.', 'सभी परिवारों और सदस्यों को एक सूत्र में जोड़ना।', 'Active'),
(2, 'Equality and Respect', 'समानता एवं सम्मान', 'Giving every person equal respect without discrimination.', 'हर व्यक्ति को बिना भेदभाव समान सम्मान देना।', 'Active'),
(3, 'Community Welfare First', 'समाजहित सर्वोपरि', 'Keeping the welfare of society above personal, family, or factional interests.', 'व्यक्तिगत, पारिवारिक और गुटीय हितों से ऊपर समाजहित रखना।', 'Active'),
(4, 'Collective Leadership', 'सामूहिक नेतृत्व', 'Respecting every viewpoint and ensuring participation from all sections in decisions.', 'निर्णय में सभी वर्गों की भागीदारी और विचारों का सम्मान।', 'Active'),
(5, 'Cooperation and Service', 'सहयोग एवं सेवा', 'Supporting one another in times of need.', 'जरूरत के समय एक-दूसरे का सहयोग करना।', 'Active'),
(6, 'Transparency and Accountability', 'पारदर्शिता एवं जवाबदेही', 'Maintaining clarity in organizational work and financial management.', 'संगठन के कार्यों और वित्तीय व्यवस्था में स्पष्टता रखना।', 'Active'),
(7, 'Youth and Women Participation', 'युवा एवं महिला सहभागिता', 'Promoting active roles and leadership opportunities for the new generation and women.', 'नई पीढ़ी और महिलाओं को सक्रिय भूमिका एवं नेतृत्व के अवसर देना।', 'Active'),
(8, 'Education and Opportunity', 'शिक्षा एवं अवसर', 'Promoting opportunities in education, careers, employment, business, and skills.', 'शिक्षा, करियर, रोजगार, व्यवसाय और कौशल के अवसरों को बढ़ावा देना।', 'Active'),
(9, 'Dialogue and Coordination', 'संवाद एवं समन्वय', 'Resolving differences through dialogue and mutual understanding.', 'मतभेदों को संवाद और आपसी समझ से सुलझाना।', 'Active'),
(10, 'Progress, Advancement, and Welfare', 'प्रगति, उन्नति एवं कल्याण', 'Working toward collective progress, the advancement of every family, and social welfare.', 'समाज की सामूहिक प्रगति, प्रत्येक परिवार की उन्नति और सामाजिक कल्याण को लक्ष्य बनाना।', 'Active');

CREATE INDEX IF NOT EXISTS principles_section_idx ON principles (section_number);
