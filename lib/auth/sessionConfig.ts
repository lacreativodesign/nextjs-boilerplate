export const SESSION_CONFIG = {
  maxAge: 5 * 24 * 60 * 60 * 1000, // 5 days default
  idleTimeout: 30 * 60 * 1000, // 30 minutes inactivity
  rememberMeMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days with "remember me"
  maxConcurrentSessions: 3, // Max active sessions per user
};
