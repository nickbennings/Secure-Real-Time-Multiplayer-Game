require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const socket = require('socket.io');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();

app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Helmet setup
app.use(helmet({
  noSniff: true,
  hidePoweredBy: { setTo: 'PHP 7.4.3' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

// Prevent caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  }); 

// For FCC testing purposes
fccTestingRoutes(app);
    
// 404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const portNum = process.env.PORT || 3000;

// Set up server and tests
const server = app.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

// Socket.io setup
const Player = require('./public/Player');
const Collectible = require('./public/Collectible');
const { dimension } = require('./public/dimension');

const random = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomPosition = () => {
  let x = random(dimension.minX + 50, dimension.maxX - 50);
  let y = random(dimension.minY + 50, dimension.maxY - 50);
  x = Math.floor(x / 10) * 10;
  y = Math.floor(y / 10) * 10;

  return [x, y];
};

let playersList = [];
let [oxygenX, oxygenY] = getRandomPosition();
let oxygen = new Collectible({ x: oxygenX, y: oxygenY, value: 1, id: Date.now() });
let [spikeX, spikeY] = getRandomPosition();
let spike = new Player({ x: spikeX, y: spikeY, value: 1, id: Date.now() });
let connections = [];

const io = socket(server);
io.sockets.on('connection', socket => {
  console.log(`New connection ${socket.id}`);
  connections.push(socket);
  console.log('Connected: %s sockets connected.', connections.length);

  let [positionX, positionY] = getRandomPosition();
  let player = new Player({ x: positionX, y: positionY, score: 0, id: socket.id });

  playersList.push(player);

  socket.emit('init', { id: socket.id, players: playersList, oxygen: oxygen, spike: spike });

  socket.on('update', (updatedUser) => {
    playersList.forEach(user => {
      if (user.id === socket.id) {
        user.x = updatedUser.x;
        user.y = updatedUser.y;
        user.score = updatedUser.score;
        user.radius = updatedUser.radius;
      }
    });
    io.emit('update', { players: playersList, spike: spike, oxygen: oxygen, player: null });
  });

  socket.on('disconnect', () => {
    console.log(`deconnection ${socket.id}`);
    socket.broadcast.emit('remove-player', socket.id);
    connections.splice(connections.indexOf(socket), 1);
    playersList = playersList.filter(player => player.id !== socket.id);
    console.log('Disconnected: %s sockets connected.', connections.length);
  });
});

setInterval(tick, 1000 / 50); 

let vx = 2;
let vy = 2;

function tick() {
  // move the spike
  if (spike.x + spike.radius > dimension.maxX) vx = -vx;
  if (spike.y + spike.radius > dimension.maxY) vy = -vy;
  if (spike.x - spike.radius <= dimension.minX) vx = -vx;
  if (spike.y - spike.radius <= dimension.minY) vy = -vy;
  spike.x += vx;
  spike.y += vy;
  let playerUpdate = null;

  playersList.forEach(player => {
    if (spike.collision(player)) {
      let [positionX, positionY] = getRandomPosition();
      player.x = positionX;
      player.y = positionY;
      player.score = 0;
      player.radius = 30;
      playerUpdate = player;
    }
    if (player.collision(oxygen)) {
      player.score += 1;
      player.radius += 10;
      let [oxygenX, oxygenY] = getRandomPosition();
      oxygen = new Collectible({ x: oxygenX, y: oxygenY, value: 1, id: Date.now() });
      playerUpdate = player;
    }
  });

  io.emit('update', {
    players: playersList,
    spike: spike,
    oxygen: oxygen,
    player: playerUpdate
  });
}

module.exports = app; // For testing
