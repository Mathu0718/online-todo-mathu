import express from 'express';
import passport from 'passport';
import { apiLimiter, authLimiter } from '../rateLimit.js';

const router = express.Router();

// Google OAuth login
router.get('/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Redirect to dashboard or client app after successful login
    res.redirect(process.env.CLIENT_URL || 'http://localhost:3000');
  }
);

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Get current user
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

export default router;
