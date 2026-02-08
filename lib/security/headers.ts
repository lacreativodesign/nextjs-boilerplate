import { NextResponse } from "next/server";

// Security headers to apply to all responses
export const securityHeaders = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // Enable XSS protection (legacy browsers)
  "X-XSS-Protection": "1; mode=block",

  // Referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Permissions policy (disable unused browser features)
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",

  // Strict Transport Security (HTTPS only)
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  // Content Security Policy (adjust for your needs)
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseio.com https://*.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.cloudfunctions.net; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com;",
};

// Helper to apply headers to a NextResponse
export function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;
  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return response;
}

// Helper to create headers object for API routes
export function getSecurityHeaders(): Record<string, string> {
  return { ...securityHeaders };
}
