import express from 'express';
import passport from 'passport';
import { apiLimiter, authLimiter } from '../rateLimit.js';

const router = express.Router();

// Google OAuth login
router.get(
  '/google',
  authLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Redirect to dashboard or client app after successful login
    res.redirect(process.env.CLIENT_URL);
  }
);

// Logout route (updated to async style for newer Passport versions)
router.get('/logout', async (req, res, next) => {
  try {
    await req.logout(function (err) {
      if (err) return next(err);
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

// Get current user with debug logs
router.get('/user', (req, res) => {
  console.log('🌐 Session:', req.session);
  console.log('🔒 req.isAuthenticated:', req.isAuthenticated());
  console.log('👤 User:', req.user);

  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});


export default router;
