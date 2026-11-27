import { ApiError } from "../common/filters/api-error.js";
import { safeUrl, youtubeId } from "../home-highlights/home-highlights.rules.js";

// Public menu pages whose content admins manage. Sections are page-specific keys ("hero", "objectives", ...).
export const BLOCK_PAGES = [
  "home",
  "about",
  "careers",
  "events",
  "community-services",
  "news",
  "sagun",
  "transportation",
  "medical",
  "room-hunting",
  "feedback",
  "contact",
  "terms",
  "privacy",
] as const;
export const BLOCK_ROLES = ["INTRO", "ITEM"] as const;
export const BLOCK_MEDIA_TYPES = ["NONE", "IMAGE", "VIDEO"] as const;
export const SECTION_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PageBlockFields {
  role: string;
  title: string | null;
  body: string | null;
  mediaType: string;
  mediaUrl: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
}

export const checkPageBlock = (block: PageBlockFields): void => {
  if (block.role === "ITEM" && !block.title?.trim() && !block.body?.trim() && block.mediaType === "NONE")
    throw new ApiError(400, "Add a title, text, image or video.");
  if (block.mediaType !== "NONE" && !block.mediaUrl) throw new ApiError(400, block.mediaType === "IMAGE" ? "Add an image." : "Add a video link.");
  if (block.mediaUrl && !safeUrl(block.mediaUrl)) throw new ApiError(400, "The media URL must start with https:// or /.");
  if (block.mediaType === "VIDEO" && block.mediaUrl && !youtubeId(block.mediaUrl) && !/\.(mp4|webm)(\?.*)?$/i.test(block.mediaUrl))
    throw new ApiError(400, "Use a YouTube link or an .mp4 / .webm video URL.");
  if (block.linkUrl && !safeUrl(block.linkUrl)) throw new ApiError(400, "The link must be a page on this site (/events) or start with https://.");
  if (block.ctaLabel && !block.linkUrl) throw new ApiError(400, "Add a link for the button text.");
};
