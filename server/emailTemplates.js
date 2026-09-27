const ORG_NAME = "निमाड़ पाटीदार संगठन, इंदौर";
const TAGLINE = "एकता • सहयोग • सम्मान • पारदर्शिता";

// Every value interpolated into these HTML emails ultimately comes from a
// public, unauthenticated form (registration name/city/phone/etc.) — escape
// it before embedding, otherwise a submitted name like `<img src=x onerror=...>`
// lands as live markup in the recipient's inbox.
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const wrap = (bodyHtml) => `
<div style="background:#F7F9FC;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E6C86E55;">
    <div style="background:#102A43;padding:24px;text-align:center;">
      <div style="color:#D4AF37;font-size:20px;font-weight:bold;">${ORG_NAME}</div>
      <div style="color:#E6C86E;font-size:12px;margin-top:4px;">${TAGLINE}</div>
    </div>
    <div style="padding:28px 24px;color:#102A43;font-size:15px;line-height:1.8;">
      ${bodyHtml}
    </div>
    <div style="background:#F7F9FC;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">
      ${ORG_NAME} • ${TAGLINE}
    </div>
  </div>
</div>`;

export const memberWelcomeEmail = ({ name, loginUrl }) => {
  const subject = `${name}, ${ORG_NAME} में आपका स्वागत है`;
  const html = wrap(`
    <p>आदरणीय ${esc(name)} जी,</p>
    <p>हमें अत्यंत हर्ष है कि आपने ${ORG_NAME} की सदस्यता के लिए अपना पंजीकरण कराया है।</p>
    <p>${ORG_NAME} में आपका हार्दिक स्वागत एवं अभिनंदन है। 🙏</p>
    <p>आपका पंजीकरण सफलतापूर्वक प्राप्त हो गया है। अब आप अपने खाते में Login करके अपनी Family Profile को पूरा कर सकते हैं तथा अपने परिवार के सदस्यों को जोड़ सकते हैं।</p>
    <p><strong>आगे क्या करें?</strong></p>
    <ol style="padding-left:20px;">
      <li>अपने registered mobile/email से Login करें।</li>
      <li>अपनी Family Profile की जानकारी देखें एवं आवश्यक जानकारी पूरी करें।</li>
      <li>अपने परिवार के सदस्यों को जोड़ें।</li>
      <li>भविष्य में संगठन से संबंधित कार्यक्रम, सूचनाएँ एवं अन्य सुविधाएँ आपके खाते के माध्यम से उपलब्ध रहेंगी।</li>
    </ol>
    <p style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}" style="background:#D4AF37;color:#102A43;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px;display:inline-block;">LOGIN TO YOUR ACCOUNT</a>
    </p>
    <p>आपके जुड़ने से हमारा संगठन और अधिक मजबूत एवं संगठित होगा। हम आपके सहयोग, सहभागिता और मार्गदर्शन के लिए हृदय से आभार व्यक्त करते हैं।</p>
    <p>सादर,<br/>${ORG_NAME}<br/>${TAGLINE}</p>
  `);
  const text = `आदरणीय ${name} जी,\n\n${ORG_NAME} की सदस्यता के लिए आपका पंजीकरण सफलतापूर्वक प्राप्त हो गया है।\n\nLogin: ${loginUrl}\n\nसादर,\n${ORG_NAME}`;
  return { subject, html, text };
};

export const memberInviteEmail = ({ name, setPasswordUrl, username, password, loginUrl }) => {
  const subject = `${name}, आपका पंजीकरण स्वीकृत हुआ — ${ORG_NAME}`;
  const displayUsername = username || "email or mobile";
  const displayPassword = password || "NPS@1234";
  const html = wrap(`
    <p>आदरणीय ${esc(name)} जी,</p>
    <p>हमें यह बताते हुए हर्ष है कि आपका परिवार पंजीकरण आवेदन स्वीकृत कर दिया गया है। ${ORG_NAME} में आपका हार्दिक स्वागत है। 🙏</p>
    <p><strong>Login Username:</strong> ${esc(displayUsername)}</p>
    <p><strong>Temporary Password:</strong> ${esc(displayPassword)}</p>
    <p>सदस्य पोर्टल में Login करने के लिए नीचे दिए गए बटन पर क्लिक करें:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${loginUrl || setPasswordUrl}" style="background:#D4AF37;color:#102A43;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px;display:inline-block;">Login</a>
    </p>
    <p>यदि आप चाहें, तो Login के बाद अपने Password को Change कर सकते हैं।</p>
    <p>यह temporary password आपके first login के बाद बदलना Recommended है।</p>
    <p>सादर,<br/>${ORG_NAME}<br/>${TAGLINE}</p>
  `);
  const text = `आदरणीय ${name} जी,\n\nआपका परिवार पंजीकरण आवेदन स्वीकृत कर दिया गया है।\nLogin Username: ${displayUsername}\nTemporary Password: ${displayPassword}\nLogin URL: ${loginUrl || setPasswordUrl}\n\nकृपया Login के बाद Password बदलें।\n\nसादर,\n${ORG_NAME}`;
  return { subject, html, text };
};

export const adminNewApplicationEmail = ({ name, email, phone, applicationId, familyName, city, registeredAt }) => {
  const subject = `नया परिवार पंजीकरण आवेदन: ${name} (${applicationId})`;
  const html = wrap(`
    <p>नमस्ते,</p>
    <p>पोर्टल के माध्यम से एक नया परिवार पंजीकरण आवेदन प्राप्त हुआ है।</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#6b7280;">आवेदन क्रमांक</td><td style="padding:6px 0;font-weight:bold;">${esc(applicationId)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">परिवार प्रमुख</td><td style="padding:6px 0;font-weight:bold;">${esc(name)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">परिवार का नाम</td><td style="padding:6px 0;font-weight:bold;">${esc(familyName) || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">मोबाइल नंबर</td><td style="padding:6px 0;font-weight:bold;">${esc(phone) || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">ईमेल</td><td style="padding:6px 0;font-weight:bold;">${esc(email) || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">शहर</td><td style="padding:6px 0;font-weight:bold;">${esc(city) || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">पंजीकरण समय</td><td style="padding:6px 0;font-weight:bold;">${esc(registeredAt)}</td></tr>
    </table>
    <p>कृपया Admin Panel → Applications में जाकर आवेदन की समीक्षा करें।</p>
  `);
  const text = `नया परिवार पंजीकरण आवेदन\nआवेदन क्रमांक: ${applicationId}\nपरिवार प्रमुख: ${name}\nपरिवार का नाम: ${familyName || "—"}\nमोबाइल नंबर: ${phone || "—"}\nईमेल: ${email || "—"}\nशहर: ${city || "—"}\nपंजीकरण समय: ${registeredAt}`;
  return { subject, html, text };
};

export const adminNewRegistrationEmail = ({ name, email, phone, registeredAt }) => {
  const subject = `नया सदस्य पंजीकरण: ${name} (${email})`;
  const html = wrap(`
    <p>नमस्ते,</p>
    <p>पोर्टल के माध्यम से एक नए सदस्य ने पंजीकरण किया है।</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#6b7280;">नाम</td><td style="padding:6px 0;font-weight:bold;">${esc(name)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">ईमेल</td><td style="padding:6px 0;font-weight:bold;">${esc(email)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">मोबाइल नंबर</td><td style="padding:6px 0;font-weight:bold;">${esc(phone) || "—"}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">पंजीकरण समय</td><td style="padding:6px 0;font-weight:bold;">${esc(registeredAt)}</td></tr>
    </table>
    <p>कृपया Admin Panel में जाकर सदस्य विवरण की समीक्षा करें।</p>
  `);
  const text = `नया सदस्य पंजीकरण\nनाम: ${name}\nईमेल: ${email}\nमोबाइल नंबर: ${phone || "—"}\nपंजीकरण समय: ${registeredAt}`;
  return { subject, html, text };
};
