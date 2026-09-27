BEGIN;

DELETE FROM rules;

INSERT INTO rules (section_number, title_en, title_hi, content_en, content_hi, status) VALUES
(1, 'Respectful Conduct Is Mandatory', 'सम्मानजनक व्यवहार अनिवार्य', 'No insulting or personal remarks toward any member are permitted.', 'किसी सदस्य के प्रति अपमानजनक या व्यक्तिगत टिप्पणी नहीं।', 'Active'),
(2, 'Do Not Turn Differences into Conflict', 'मतभेद को मनभेद न बनाएं', 'When there is disagreement, express your view respectfully.', 'असहमति हो तो सम्मानपूर्वक अपनी बात रखें।', 'Active'),
(3, 'Avoid Factionalism', 'गुटबाजी से बचें', 'No faction will be formed around any particular person, family, or region within the organization.', 'संगठन में किसी व्यक्ति, परिवार या क्षेत्र विशेष का गुट नहीं बनाया जाएगा।', 'Active'),
(4, 'Keep Personal Disputes Outside the Organization', 'व्यक्तिगत विवाद संगठन में नहीं', 'Private disputes should be resolved through appropriate dialogue rather than in public groups.', 'निजी विवादों का समाधान सार्वजनिक ग्रुप के बजाय उचित संवाद से किया जाए।', 'Active'),
(5, 'Stay Away from Political Promotion', 'राजनीतिक प्रचार से दूरी', 'The official organization platform must not be used for political promotion or support for any party or person.', 'संगठन के आधिकारिक मंच का उपयोग राजनीतिक प्रचार या किसी दल/व्यक्ति के समर्थन के लिए नहीं।', 'Active'),
(6, 'No Rumors or False Information', 'अफवाह और गलत जानकारी नहीं', 'Unverified information must not be shared.', 'बिना पुष्टि की जानकारी साझा नहीं की जाएगी।', 'Active'),
(7, 'Respect Every Suggestion', 'सुझाव का सम्मान', 'Every member will have an opportunity to express their views.', 'हर सदस्य को अपनी बात रखने का अवसर मिलेगा।', 'Active'),
(8, 'Respect Collective Decisions', 'सामूहिक निर्णय का सम्मान', 'Collective decisions determined by the organization will be respected.', 'संगठन द्वारा निर्धारित सामूहिक निर्णयों का सम्मान किया जाएगा।', 'Active'),
(9, 'Financial Transparency', 'आर्थिक पारदर्शिता', 'Proper records of all organizational income and expenditure will be maintained.', 'संगठन के सभी आय-व्यय का उचित रिकॉर्ड रखा जाएगा।', 'Active'),
(10, 'No Fundraising Without Permission', 'बिना अनुमति धन संग्रह नहीं', 'Authorized permission is required before collecting financial contributions or donations in the name of the organization.', 'संगठन के नाम पर आर्थिक सहयोग/चंदा लेने से पहले अधिकृत अनुमति आवश्यक होगी।', 'Active'),
(11, 'Privacy', 'गोपनीयता', 'Private information of members and families must not be shared without consent.', 'सदस्य एवं परिवार की निजी जानकारी बिना सहमति के साझा नहीं की जाएगी।', 'Active'),
(12, 'Digital Discipline', 'डिजिटल अनुशासन', 'WhatsApp, the website, or the app should be used only to share useful information related to the organization and community welfare.', 'WhatsApp, Website या App पर केवल संगठन एवं समाजहित से संबंधित उपयोगी जानकारी साझा की जाए।', 'Active'),
(13, 'A Position Is a Responsibility', 'पद नहीं, जिम्मेदारी', 'No position will be a means of personal prestige or special privilege.', 'कोई भी पद व्यक्तिगत प्रतिष्ठा या विशेष अधिकार का माध्यम नहीं होगा।', 'Active'),
(14, 'Equal Opportunity for Everyone', 'सभी के लिए समान अवसर', 'Youth, women, seniors, and all other members should receive opportunities for responsibility according to their abilities.', 'युवा, महिला, वरिष्ठ और अन्य सभी सदस्यों को उनकी क्षमता के अनुसार जिम्मेदारी का अवसर।', 'Active'),
(15, 'Protect Organizational Property', 'संगठन की संपत्ति का संरक्षण', 'Organizational documents, data, funds, and resources must be used only for organizational purposes.', 'संगठन के दस्तावेज, डेटा, धन और संसाधनों का उपयोग केवल संगठन के उद्देश्य के लिए किया जाएगा।', 'Active');

COMMIT;
