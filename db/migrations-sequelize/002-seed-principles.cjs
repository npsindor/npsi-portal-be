const crypto = require("node:crypto");

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert("principles", [
      ["Unity and Brotherhood", "एकता एवं भाईचारा", "Bringing all families and members together as one community.", "सभी परिवारों और सदस्यों को एक सूत्र में जोड़ना।"],
      ["Equality and Respect", "समानता एवं सम्मान", "Giving every person equal respect without discrimination.", "हर व्यक्ति को बिना भेदभाव समान सम्मान देना।"],
      ["Community Welfare First", "समाजहित सर्वोपरि", "Keeping the welfare of society above personal interests.", "व्यक्तिगत हितों से ऊपर समाजहित रखना।"],
      ["Collective Leadership", "सामूहिक नेतृत्व", "Ensuring participation from all sections in decisions.", "निर्णय में सभी वर्गों की भागीदारी।"],
      ["Cooperation and Service", "सहयोग एवं सेवा", "Supporting one another in times of need.", "जरूरत के समय एक-दूसरे का सहयोग करना।"],
      ["Transparency and Accountability", "पारदर्शिता एवं जवाबदेही", "Maintaining clarity in organizational work and finances.", "संगठन के कार्यों और वित्त में स्पष्टता रखना।"],
      ["Youth and Women Participation", "युवा एवं महिला सहभागिता", "Promoting active roles and leadership opportunities.", "सक्रिय भूमिका और नेतृत्व के अवसर देना।"],
      ["Education and Opportunity", "शिक्षा एवं अवसर", "Promoting education, careers, employment, and skills.", "शिक्षा, करियर, रोजगार और कौशल को बढ़ावा देना।"],
      ["Dialogue and Coordination", "संवाद एवं समन्वय", "Resolving differences through dialogue and understanding.", "मतभेदों को संवाद और आपसी समझ से सुलझाना।"],
      ["Progress and Welfare", "प्रगति एवं कल्याण", "Working toward collective progress and social welfare.", "सामूहिक प्रगति और सामाजिक कल्याण के लिए कार्य करना।"],
    ].map(([title_en, title_hi, content_en, content_hi], index) => ({ id: crypto.randomUUID(), section_number: index + 1, title_en, title_hi, content_en, content_hi, status: "Active", created_at: now, updated_at: now })));
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("principles", null, {});
  },
};