import express from 'express';
import mongoose from 'mongoose';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import './models/User.js';
import './config/passport.js';
import authRoutes from './routes/auth.js';
import tasksRoutes from './routes/tasks.js';
import notificationsRoutes from './routes/notifications.js';
import usersRoutes from './routes/users.js';
import { sendDeadlineReminders } from './utils/deadlineReminder.js';
import { apiLimiter } from './rateLimit.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: 'https://online-todo-mathu-frontend.onrender.com',
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: 'https://online-todo-mathu-frontend.onrender.com',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.set('trust proxy', 1); // Keep this at the top if not already

app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
  proxy: true, // 👈 ADD THIS LINE
  cookie: {
    secure: true,
    sameSite: 'none'
  },
}));


// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://mathuchinnamurugan:Mathu%4007182004@cluster0.zfmdaro.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

// Basic route
app.get('/', (req, res) => {
  res.send('API is running');
});


// Auth routes
app.use('/auth', authRoutes);
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
