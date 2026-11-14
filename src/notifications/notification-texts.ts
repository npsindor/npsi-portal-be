import { randomId } from "../common/utils/crypto.js";
import type { Prisma } from "../generated/prisma/client.js";

// Notifications the server sends as part of a workflow (approvals, sign-ups,
// event registrations, transfers), in the language of the person acting.
// Texts match what the frontend used to write.
export const LANGS = ["en", "hi"] as const;
export type Lang = (typeof LANGS)[number];

type Template = { type: string; title: string; message: string };
const TEMPLATES: Record<Lang, Record<string, Template>> = {
  en: {
    applicationSubmitted: {
      type: "Registration",
      title: "Application Submitted",
      message: "Your family registration application {applicationId} has been submitted and is pending verification.",
    },
    applicationApproved: {
      type: "Approval",
      title: "Application Approved!",
      message: "Your family registration has been approved. Your Family ID is {familyId}. You can now log in to the member portal.",
    },
    applicationCorrection: { type: "Correction", title: "Correction Required", message: "Your application needs correction: {remarks}" },
    applicationRejected: { type: "Correction", title: "Application Rejected", message: "Your application has been rejected: {remarks}" },
    studentApplicationSubmitted: {
      type: "Registration",
      title: "Student Application Submitted",
      message: "Your student registration application {applicationId} has been submitted and is pending verification.",
    },
    studentApproved: {
      type: "Approval",
      title: "Student Registration Approved!",
      message: "Your student registration has been approved. Your Student Member ID is {studentId}. You can now log in to the member portal.",
    },
    studentCorrection: { type: "Correction", title: "Correction Required", message: "Your student application needs correction: {remarks}" },
    studentRejected: { type: "Correction", title: "Student Application Rejected", message: "Your student application has been rejected: {remarks}" },
    transferRequested: { type: "Approval", title: "New Transfer Request", message: "A transfer request ({requestId}) is pending your review." },
    transferApproved: { type: "Approval", title: "Transfer Approved", message: "Your transfer to {familyName} is approved. Member ID: {membershipId}." },
    transferMoved: { type: "Approval", title: "Transfer Approved", message: "Your membership was moved from {fromFamilyId} to {toFamilyName}." },
    eventRegistered: { type: "Event", title: "Event Registration Confirmed", message: "You have been registered for {eventTitle}." },
    paymentVerified: { type: "Payment", title: "Payment Verified", message: "Your payment of ₹{amount} for application {applicationId} has been verified." },
    paymentRejected: {
      type: "Payment",
      title: "Payment Not Accepted",
      message: "Your payment for application {applicationId} could not be verified: {remarks}. Please upload a correct payment screenshot.",
    },
    paymentRefunded: { type: "Payment", title: "Payment Refunded", message: "₹{amount} for application {applicationId} has been refunded. Reason: {remarks}" },
    paymentRefundRequested: { type: "Payment", title: "Refund Update", message: "The refund for application {applicationId} is {status}. Reason: {remarks}" },
    paymentRefundRejected: { type: "Payment", title: "Refund Not Approved", message: "The refund for application {applicationId} was not approved: {remarks}" },
    registrationResubmitted: {
      type: "Registration",
      title: "Application Resubmitted",
      message: "Your application {applicationId} has been resubmitted for verification.",
    },
  },
  hi: {
    applicationSubmitted: {
      type: "Registration",
      title: "आवेदन जमा हुआ",
      message: "आपका परिवार रजिस्ट्रेशन आवेदन {applicationId} जमा हो गया है और सत्यापन हेतु लंबित है।",
    },
    applicationApproved: {
      type: "Approval",
      title: "आवेदन स्वीकृत!",
      message: "आपका परिवार रजिस्ट्रेशन स्वीकृत हो गया है। आपका परिवार आईडी है {familyId}. अब आप सदस्य पोर्टल में लॉगिन कर सकते हैं।",
    },
    applicationCorrection: { type: "Correction", title: "सुधार आवश्यक", message: "आपके आवेदन में सुधार आवश्यक है: {remarks}" },
    applicationRejected: { type: "Correction", title: "आवेदन अस्वीकृत", message: "आपका आवेदन अस्वीकृत किया गया है: {remarks}" },
    studentApplicationSubmitted: {
      type: "Registration",
      title: "स्टूडेंट आवेदन जमा हुआ",
      message: "आपका स्टूडेंट रजिस्ट्रेशन आवेदन {applicationId} जमा हो गया है और सत्यापन हेतु लंबित है।",
    },
    studentApproved: {
      type: "Approval",
      title: "स्टूडेंट रजिस्ट्रेशन स्वीकृत!",
      message: "आपकी स्टूडेंट रजिस्ट्रेशन स्वीकृत हो गई है। आपका स्टूडेंट मेंबर आईडी है {studentId}. अब आप सदस्य पोर्टल में लॉगिन कर सकते हैं।",
    },
    studentCorrection: { type: "Correction", title: "सुधार आवश्यक", message: "आपके स्टूडेंट आवेदन में सुधार आवश्यक है: {remarks}" },
    studentRejected: { type: "Correction", title: "स्टूडेंट आवेदन अस्वीकृत", message: "आपका स्टूडेंट आवेदन अस्वीकृत किया गया है: {remarks}" },
    transferRequested: { type: "Approval", title: "नया ट्रांसफर अनुरोध", message: "एक ट्रांसफर अनुरोध ({requestId}) आपकी समीक्षा हेतु लंबित है।" },
    transferApproved: { type: "Approval", title: "ट्रांसफर स्वीकृत", message: "{familyName} में आपका ट्रांसफर स्वीकृत हो गया। सदस्य आईडी: {membershipId}।" },
    transferMoved: { type: "Approval", title: "ट्रांसफर स्वीकृत", message: "आपकी सदस्यता {fromFamilyId} से {toFamilyName} में स्थानांतरित हो गई।" },
    eventRegistered: { type: "Event", title: "कार्यक्रम रजिस्ट्रेशन की पुष्टि", message: "आपको इस कार्यक्रम के लिए रजिस्टर किया गया है: {eventTitle}." },
    paymentVerified: { type: "Payment", title: "भुगतान सत्यापित", message: "आवेदन {applicationId} हेतु आपका ₹{amount} का भुगतान सत्यापित हो गया है।" },
    paymentRejected: {
      type: "Payment",
      title: "भुगतान स्वीकार नहीं हुआ",
      message: "आवेदन {applicationId} का भुगतान सत्यापित नहीं हो सका: {remarks}. कृपया सही भुगतान स्क्रीनशॉट अपलोड करें।",
    },
    paymentRefunded: { type: "Payment", title: "भुगतान वापस किया गया", message: "आवेदन {applicationId} के ₹{amount} वापस कर दिए गए हैं। कारण: {remarks}" },
    paymentRefundRequested: { type: "Payment", title: "रिफंड की जानकारी", message: "आवेदन {applicationId} का रिफंड {status} है। कारण: {remarks}" },
    paymentRefundRejected: { type: "Payment", title: "रिफंड स्वीकृत नहीं", message: "आवेदन {applicationId} का रिफंड स्वीकृत नहीं हुआ: {remarks}" },
    registrationResubmitted: { type: "Registration", title: "आवेदन पुनः जमा हुआ", message: "आपका आवेदन {applicationId} सत्यापन हेतु पुनः जमा हो गया है।" },
  },
};

export type NotificationKey = keyof (typeof TEMPLATES)["en"];

export const notificationText = (key: NotificationKey, vars: Record<string, string | null | undefined>, lang: Lang = "en") => {
  const template = TEMPLATES[lang][key];
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? "");
  return { type: template.type, title: fill(template.title), message: fill(template.message) };
};

// A notification row for `recipientFamilyId` (a family, application or student display id).
export const workflowNotification = (
  key: NotificationKey,
  recipientFamilyId: string,
  vars: Record<string, string | null | undefined>,
  lang: Lang = "en",
): Prisma.NotificationUncheckedCreateInput => ({ id: randomId(), ...notificationText(key, vars, lang), recipientFamilyId, date: new Date() });

// A notification for one account (an applicant before their family / student record exists, or after).
export const userNotification = (
  key: NotificationKey,
  recipientUserId: string,
  vars: Record<string, string | null | undefined>,
  lang: Lang = "en",
): Prisma.NotificationUncheckedCreateInput => ({ id: randomId(), ...notificationText(key, vars, lang), recipientUserId, date: new Date() });

export const asLang = (value: unknown): Lang => (value === "hi" ? "hi" : "en");
