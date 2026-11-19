require('dotenv').config();
require('express-async-errors');
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { getMongoClient } = require('./config/db');
const { attachUser } = require('./middleware/auth');
const attachAvailableTags  = require('./middleware/tags');
const Notification = require('./models/Notification');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/post');
const notificationRoutes = require('./routes/notifications');
const codeExecutionRoutes = require('./routes/execute');
const chatRoutes = require('./routes/chat');
const userRoutes = require('./routes/user');
const moderationRoutes = require('./routes/moderation');
const { renderMarkdown, excerpt } = require('./utils/markdown');
const connectDB = require('./config/db');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: getMongoClient(),
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production',
      },
    })
  );

  app.use(attachUser);
  app.use(attachAvailableTags);

  app.use(async (req, res, next) => {
    if (req.session.user) {
      try {
        const [notifications, unreadCount] = await Promise.all([Notification.find({ recipient: req.session.user.id })
          .sort({ createdAt: -1 })
          .limit(10).lean(), Notification.countDocuments({ recipient: req.session.user.id, read: false })]);
        res.locals.notifications = notifications;
        res.locals.unreadCount = unreadCount;
      } catch {
        res.locals.notifications = [];
        res.locals.unreadCount = 0;
      }
    } else {
      res.locals.notifications = [];
      res.locals.unreadCount = 0;
    }
    next();
  });

  app.use('/', authRoutes);
  app.use('/', postRoutes);
  app.use('/', notificationRoutes);
  app.use('/', userRoutes);
  app.use('/', moderationRoutes);
  app.use('/', chatRoutes);
  app.use('/api', codeExecutionRoutes);

  app.use((err, req, res, next) => {
    console.error('Request failed:', err);
    if (res.headersSent) return next(err);
    res.status(500).send('Internal server error');
  });

  app.use((req, res) => {
    res.status(404).render('404');
  });

  app.locals.md = renderMarkdown;
  app.locals.excerpt = excerpt;

  return app;
}

const app = express();
let forumApp;

app.use((req, res, next) => {
  connectDB()
    .then(() => {
      if (!forumApp) {
        forumApp = createApp();
      }
      forumApp(req, res, next);
    })
    .catch((err) => {
      console.error('Unable to initialize the forum app:', err.message);
      if (res.headersSent) return next(err);
      res.status(503).send('Service temporarily unavailable');
    });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  connectDB()
    .then(() => {
      forumApp = createApp();
      forumApp.listen(PORT, () => {
        console.log(`Forum app listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Unable to start the forum app:', err.message);
      process.exitCode = 1;
    });
}

module.exports = app;
module.exports.createApp = createApp;
