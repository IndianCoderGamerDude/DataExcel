/**
 * Security utility for input sanitization and data encryption.
 */

/**
 * Sanitizes input strings to prevent injection-style attacks.
 * While we don't use a SQL database, this prevents malformed data 
 * from breaking our logic or downstream systems.
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  // Basic sanitization: remove common SQL injection patterns and script tags
  return input
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
    .replace(/['";\\]/g, (match) => `\\${match}`)
    .trim();
}

/**
 * Encrypts a string using a simple XOR-based approach for local storage.
 * Note: For production-grade security, use the Web Crypto API.
 */
const SECRET_KEY = "AI_OPS_MASTER_SECRET";

export function encryptData(data: string): string {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    result.push(String.fromCharCode(data.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length)));
  }
  return btoa(result.join(""));
}

export function decryptData(encrypted: string): string {
  const data = atob(encrypted);
  const result = [];
  for (let i = 0; i < data.length; i++) {
    result.push(String.fromCharCode(data.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length)));
  }
  return result.join("");
}
