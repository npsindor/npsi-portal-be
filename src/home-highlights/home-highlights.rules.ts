import { ApiError } from "../common/filters/api-error.js";

export const HIGHLIGHT_SLIDERS = ["TEXT", "MEDIA"] as const;
export const HIGHLIGHT_MEDIA_TYPES = ["IMAGE", "VIDEO", "TEXT"] as const;

export interface HighlightFields {
  slider: string;
  mediaType: string;
  title: string;
  mediaUrl: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
  startDate: string | null;
  endDate: string | null;
}

// A site path ("/events", "/uploads/x.jpg") or an http(s) URL; nothing else (no javascript:, data:, //host).
export const safeUrl = (value: string): boolean => /^\/(?!\/)[^\s]*$/.test(value) || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value);

// YouTube watch / share / embed / shorts link → its video id, else null.
export const youtubeId = (url: string): string | null => {
  const match = url.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
  return match ? match[1] : null;
};

// Business rules for a slide, checked on create and on the merged result of an update.
export const checkHighlight = (slide: HighlightFields): void => {
  if (!slide.title.trim()) throw new ApiError(400, "Title is required.");
  if (slide.slider === "MEDIA" && slide.mediaType !== "TEXT") {
    if (!slide.mediaUrl)
      throw new ApiError(400, slide.mediaType === "IMAGE" ? "An image is required for an image slide." : "A video link is required for a video slide.");
    if (slide.mediaType === "VIDEO" && !youtubeId(slide.mediaUrl) && !/\.(mp4|webm)(\?.*)?$/i.test(slide.mediaUrl))
      throw new ApiError(400, "Use a YouTube link or an .mp4 / .webm video URL.");
  }
  if (slide.mediaUrl && !safeUrl(slide.mediaUrl)) throw new ApiError(400, "The media URL must start with https:// or /.");
  if (slide.linkUrl && !safeUrl(slide.linkUrl)) throw new ApiError(400, "The link must be a page on this site (/events) or start with https://.");
  if (slide.ctaLabel && !slide.linkUrl) throw new ApiError(400, "Add a link for the button text.");
  if (slide.startDate && slide.endDate && slide.startDate > slide.endDate) throw new ApiError(400, "The end date must be on or after the start date.");
};

// Shown on the homepage: active and inside its optional date window (dates are India-local YYYY-MM-DD).
export const isLive = (slide: { active: boolean; startDate: string | null; endDate: string | null }, today: string): boolean =>
  slide.active && (!slide.startDate || slide.startDate <= today) && (!slide.endDate || slide.endDate >= today);
