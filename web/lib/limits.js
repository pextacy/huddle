// UI-side copies of domain limits (mirrors src/domain/entries.js). Kept small and dependency-free
// so client components don't reach across the package boundary into the backend's src/.

/** Max length of a comment body — mirrors COMMENT_MAX in src/domain/entries.js. */
export const COMMENT_MAX = 500
