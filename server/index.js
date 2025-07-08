import express from 'express';
import mongoose from 'mongoose';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import './config/passport.js';
import authRoutes from './routes/auth.js';
import tasksRoutes from './routes/tasks.js';
import notificationsRoutes from './routes/notifications.js';
import usersRoutes from './routes/users.js';
import { sendDeadlineReminders } from './utils/deadlineReminder.js';
import { apiLimiter } from './rateLimit.js';
import MongoStore from 'connect-mongo';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1); // trust first proxy (Render, Heroku, etc.)

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    collectionName: 'sessions',
  }),
  cookie: {
    secure: true, // important for HTTPS
    sameSite: 'None', // allow cross-site cookies
    httpOnly: true,
  },
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Auth routes
app.use('/api/auth', authRoutes);
// Task routes
app.use('/api/tasks', (req, res, next) => {
  req.io = io;
  next();
}, tasksRoutes);
// Notification routes
app.use('/api/notifications', notificationsRoutes);
// User routes
app.use('/api/users', usersRoutes);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join user room for real-time updates
  socket.on('join', (userId) => {
    socket.join(userId);
  });

  // Listen for task changes and broadcast to collaborators
  socket.on('task-updated', (task) => {
    if (task) {
      // Support both old and new collaborator formats
      const collaboratorIds = Array.isArray(task.collaborators)
        ? task.collaborators.map(c => (c && c.user ? c.user : c)).filter(Boolean)
        : [];
      const allIds = [task.owner, ...collaboratorIds];
      allIds.forEach(id => {
        if (id) io.to(id.toString()).emit('task-updated', task);
      });
    }
  });

  // Listen for task deletion and broadcast to collaborators
  socket.on('task-deleted', ({ taskId, owner, collaborators }) => {
    const collaboratorIds = Array.isArray(collaborators)
      ? collaborators.map(c => (c && c.user ? c.user : c)).filter(Boolean)
      : [];
    const allIds = [owner, ...collaboratorIds];
    allIds.forEach(id => {
      if (id) io.to(id.toString()).emit('task-deleted', { taskId });
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Periodic deadline reminders
setInterval(() => sendDeadlineReminders(io), 5 * 60 * 1000); // every 5 minutes

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/todo-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
