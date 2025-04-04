const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const games = {}; // { roomId: { players: [], board: [], currentPlayer: '' } }

io.on('connection', (socket) => {
  console.log(`✅ Client connecté : ${socket.id}`);

  socket.on('createGame', () => {
    const roomId = uuidv4();
    games[roomId] = {
      players: [socket.id],
      board: [],
      currentPlayer: '',
    };
    socket.join(roomId);
    console.log(`🎲 Partie créée avec l'ID : ${roomId}`);
    
    // Log pour vérifier que cet événement n'est émis qu'une seule fois
    console.log(`Émission de gameCreated avec roomId: ${roomId}`);
    
    socket.emit('gameCreated', { roomId });
  });
  
  socket.on('joinGame', (roomId) => {
    console.log(`Tentative de rejoindre la partie ${roomId}`);
  
    const game = games[roomId];
    if (!game) {
      socket.emit('error', "❌ La partie n'existe pas.");
      console.log("❌ La partie n'existe pas.")
      return;
    }
  
    if (game.players.length >= 2) {
      socket.emit('error', "❌ La partie est déjà pleine.");
      console.log("❌ La partie est déjà pleine.")
      return;
    }
  
    if (game.players.includes(socket.id)) {
      socket.emit('error', "❌ Vous êtes déjà dans cette partie.");
      console.log("❌ Vous êtes déjà dans cette partie.")
      return;
    }
  
    game.players.push(socket.id);
    game.board = Array(6).fill(null).map(() => Array(7).fill(null));
    game.currentPlayer = game.players[0];
  
    socket.join(roomId);
  
    io.to(roomId).emit('startGame', { players: game.players });
    io.to(roomId).emit('updateBoard', { board: game.board, currentPlayer: game.currentPlayer });
  
    console.log(`👥 Joueur ${socket.id} a rejoint la partie ${roomId}`);
  });
  
  socket.on('play', ({ roomId, column }) => {
    const game = games[roomId];
    if (!game) return;

    const { board, players, currentPlayer } = game;
    if (socket.id !== currentPlayer) return; // Pas à ce joueur de jouer

    for (let row = 5; row >= 0; row--) {
      if (board[row][column] === null) {
        board[row][column] = socket.id;
        const nextPlayer = players.find((p) => p !== currentPlayer);
        game.currentPlayer = nextPlayer;

        io.to(roomId).emit('updateBoard', { board, currentPlayer: nextPlayer });
        console.log(`🟡 ${socket.id} a joué colonne ${column}`);
        return;
      }
    }

    socket.emit('error', "❌ Colonne pleine !");
  });

  socket.on('disconnect', () => {
    for (const [roomId, game] of Object.entries(games)) {
      if (game.players.includes(socket.id)) {
        io.to(roomId).emit('playerLeft');
        delete games[roomId];
        console.log(`⚠️ Joueur ${socket.id} déconnecté, partie ${roomId} supprimée`);
        break;
      }
    }
  });
});

// Exposer une route POST pour supprimer toutes les parties
app.post('/clear-all-games', (req, res) => {
  // Déconnecte tous les joueurs et supprime les parties
  for (const [roomId, game] of Object.entries(games)) {
    game.players.forEach((player) => {
      io.to(player).emit('error', 'La partie a été supprimée.');
      io.sockets.sockets.get(player)?.disconnect(true);
    });
  }

  // Réinitialiser l'objet des jeux
  for (const roomId in games) {
    delete games[roomId];
  }

  console.log("🧹 Toutes les connexions ont été supprimées et toutes les parties effacées.");
  return res.status(200).send('Toutes les parties ont été supprimées.');
});

// Lancer le serveur
server.listen(3000, () => {
  console.log('🚀 Serveur Socket.IO en écoute sur le port 3000');
});
