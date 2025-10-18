require('dotenv').config(); // loads .env in local dev; harmless on Rendernpm install peer

const express = require('express');
const { ExpressPeerServer } = require('peer');

const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidV4 } = require('uuid');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const users = require('./modules/module');
const Meeting = require('./modules/meeting');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
const mongooseOpts = { useNewUrlParser: true, useUnifiedTopology: true };

mongoose.connect(MONGODB_URI, mongooseOpts)
  .then(() => console.log('MongoDB Connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));



app.set('view engine', 'ejs');
app.use('/peerjs', ExpressPeerServer(server, { debug: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const meetings = {}; // memory store: roomId → admin + permissions

// ======================= AUTH ROUTES =======================
app.get('/', (req, res) => res.render('index'));
app.get('/signin', (req, res) => res.render('sign'));
app.get('/login', (req, res) => res.render('login'));

app.post('/signin', async (req, res) => {
  const { name, email, password } = req.body;
  bcrypt.genSalt(10, (err, salt) => {
    bcrypt.hash(password, salt, async (err, hash) => {
      const person = await users.create({ name, email, password: hash });
      res.render('home', { person });
    });
  });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const person = await users.findOne({ email });
  if (!person) return res.send('Invalid email or password');
  const comp = await bcrypt.compare(password, person.password);
  if (!comp) return res.send('Invalid email or password');
  res.render('home', { person });
});

// ======================= MEETING ROUTES =======================
app.get('/create', (req, res) => res.redirect(`/meeting/${uuidV4()}`));
app.get('/meeting/:room', (req, res) => res.render('meeting', { roomId: req.params.room }));

// Schedule a future meeting
app.post('/schedule', async (req, res) => {
  const { title, date, time, createdBy } = req.body;
  const fullDate = new Date(`${date}T${time}`);
  const roomId = uuidV4();
  const link = `http://localhost:3000/meeting/${roomId}`;

  await Meeting.create({ title, date: fullDate, link, createdBy });
  res.send(`✅ Meeting scheduled: ${link}`);
});

// My Meetings page
app.get('/mymeetings/:user', async (req, res) => {
  const meetings = await Meeting.find({ createdBy: req.params.user });
  res.render('mymeetings', { meetings });
});

// ======================= SOCKET.IO =======================
io.on('connection', socket => {
  // user joins
  socket.on('join-room', (roomId, userId, userName, isAdmin) => {
    if (!meetings[roomId]) meetings[roomId] = { adminId: null, permissions: {} };
    if (isAdmin) meetings[roomId].adminId = socket.id;

    socket.join(roomId);
    meetings[roomId].permissions[userId] = { mic: true, cam: true, share: false };

    if (!isAdmin) {
      const adminId = meetings[roomId]?.adminId;
      if (adminId) io.to(adminId).emit('join-request', { userId, userName });
    }

    socket.on('approval-decision', ({ targetId, approved }) => {
      if (approved) io.to(targetId).emit('join-approved');
      else io.to(targetId).emit('join-denied');
    });

    socket.on('toggle-permission', ({ targetId, type, value }) => {
      io.to(targetId).emit('permission-updated', { type, value });
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
