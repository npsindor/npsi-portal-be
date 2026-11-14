import { ApiError } from "../common/filters/api-error.js";
import { safeUrl } from "../home-highlights/home-highlights.rules.js";

// Community Services page sections.
export const COMMUNITY_SECTIONS = ["BLOOD_DONATION", "EMERGENCY_HELP", "SOCIAL_WELFARE"] as const;

export interface CommunityPostFields {
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
  contactPhone: string | null;
}

// Phone numbers and helplines: digits with optional +, spaces and dashes (100, 108, +91 98765-43210).
export const validPhone = (value: string): boolean => /^\+?\d[\d\s-]{1,18}$/.test(value) && value.replace(/\D/g, "").length >= 3;

export const checkCommunityPost = (post: CommunityPostFields): void => {
  if (!post.title.trim()) throw new ApiError(400, "Title is required.");
  if (post.imageUrl && !safeUrl(post.imageUrl)) throw new ApiError(400, "The image URL must start with https:// or /.");
  if (post.linkUrl && !safeUrl(post.linkUrl)) throw new ApiError(400, "The link must be a page on this site (/events) or start with https://.");
  if (post.ctaLabel && !post.linkUrl) throw new ApiError(400, "Add a link for the button text.");
  if (post.contactPhone && !validPhone(post.contactPhone)) throw new ApiError(400, "Enter a valid phone or helpline number.");
};
