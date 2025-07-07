import rateLimit from 'express-rate-limit';

// General API rate limiter (e.g., 100 requests per 15 minutes per IP)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

// More lenient limiter for auth endpoints (e.g., 20 requests per 5 minutes per IP)
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: 'Too many login attempts, please try again later.'
});

// Stricter limiter for task creation (e.g., 20 creates per hour per IP)
export const createTaskLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many tasks created from this IP, please try again later.'
});
