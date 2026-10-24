require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth');
const attachAvailableTags  = require('./middleware/tags');
const Notification = require('./models/Notification');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/post');
const notificationRoutes = require('./routes/notifications');
const codeExecutionRoutes = require('./routes/execute');
const { renderMarkdown, excerpt } = require('./utils/markdown');
const app = express();

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
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(attachUser);
app.use(attachAvailableTags);


app.use(async (req, res, next) => {
  if (req.session.user) {
    try {
      const notifications = await Notification.find({ recipient: req.session.user.id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      res.locals.notifications = notifications;
      res.locals.unreadCount = notifications.filter((n) => !n.read).length;
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
app.use('/api', codeExecutionRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Forum app listening on port ${PORT}`);
  });
});
app.locals.md = renderMarkdown;
app.locals.excerpt = excerpt;
