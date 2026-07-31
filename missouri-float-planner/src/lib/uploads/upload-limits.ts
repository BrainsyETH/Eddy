/** Maximum file payload accepted by POST /api/upload. */
export const COMMUNITY_UPLOAD_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

/** Source files above this are rejected before browser-side compression. */
export const COMMUNITY_UPLOAD_INPUT_MAX_BYTES = 10 * 1024 * 1024;
