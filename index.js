const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Autorise toutes les origines
  },
});

const games = {}; // Stocke les informations des parties

// Fonction pour générer un identifiant de partie aléatoire de 6 caractères
const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

io.on('connection', (socket) => {
  console.log('Un joueur est connecté :', socket.id);

  // Création d'une nouvelle partie
  socket.on('createGame', () => {
    let roomId;
    // Générer un nouvel identifiant jusqu'à en obtenir un unique
    do {
      roomId = generateRoomId();
    } while (games[roomId]);

    games[roomId] = {
      players: [socket.id],
      board: Array(6).fill().map(() => Array(7).fill(null)), // Grille 6x7 initialisée à null
      currentPlayer: socket.id,
    };
    socket.join(roomId);
    socket.emit('gameCreated', { roomId });
    console.log(`Partie créée avec l'ID: ${roomId}`);
  });

  // Rejoindre une partie existante
  socket.on('joinGame', (roomId) => {
    const game = games[roomId];
    if (game && game.players.length === 1) {
      game.players.push(socket.id);
      socket.join(roomId);
      io.to(roomId).emit('startGame', { players: game.players });
      console.log(`Joueur ${socket.id} a rejoint la partie ${roomId}`);
    } else {
      socket.emit('error', 'Partie introuvable ou déjà complète.');
    }
  });

  // Gestion des coups joués
  socket.on('play', ({ roomId, column }) => {
    const game = games[roomId];
    if (!game) return;

    const player = socket.id;
    if (player !== game.currentPlayer) return;

    for (let row = 5; row >= 0; row--) {
      if (game.board[row][column] === null) {
        game.board[row][column] = player;
        game.currentPlayer = game.players.find((p) => p !== player); // Change de joueur
        io.to(roomId).emit('updateBoard', {
          board: game.board,
          currentPlayer: game.currentPlayer,
        });
        break;
      }
    }
  });

  // Gestion de la déconnexion d'un joueur
  socket.on('disconnect', () => {
    console.log('Déconnexion :', socket.id);
    for (const [roomId, game] of Object.entries(games)) {
      if (game.players.includes(socket.id)) {
        io.to(roomId).emit('playerLeft');
        delete games[roomId];
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Serveur WebSocket en écoute sur http://localhost:3000');
});
