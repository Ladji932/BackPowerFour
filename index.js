import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { Rows } from 'lucide-react';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://v2-power-front.vercel.app'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: ['http://localhost:5173', 'https://v2-power-front.vercel.app'],
  credentials: true
}));

const games = {};


// Génération d'un code de partie court (6 caractères, base64url)
function generateShortRoomCode(length = 6) {
  return randomBytes(length).toString('base64url').slice(0, length);
}

// 🔍 Vérifie si un joueur a gagné
function checkWinner(board, mode, players) {
  const ROWS = board.length;
  const COLS = board[0].length;

  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonale descendante
    [1, -1],  // diagonale montante
  ];

  // Si mode est 1v1, on vérifie la victoire d'un seul joueur
  if (mode === '1v1') {
    return checkWinForSinglePlayer(board, directions);
  }

  // Si mode est 2v2, on vérifie la victoire pour chaque équipe
  if (mode === '2v2') {
    console.log("Le mode est 2 vs 2")
    return checkWinForTeam(board, directions, players);
  }

  return null;
}

// Vérification pour un seul joueur (mode 1v1)
function checkWinForSinglePlayer(board, directions) {
  const ROWS = board.length;
  const COLS = board[0].length;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const playerId = board[r][c];
      if (playerId === null) continue;

      for (let [dr, dc] of directions) {
        let count = 0;
        for (let i = 0; i < 4; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (
            nr >= 0 && nr < ROWS &&
            nc >= 0 && nc < COLS &&
            board[nr][nc] === playerId
          ) {
            count++;
          }
        }

        if (count === 4) return true; // Si 4 pions sont alignés, victoire
      }
    }
  }

  return false;
}

// Vérification pour une équipe (mode 2v2)
function checkWinForTeam(board, directions, players) {
  const ROWS = board.length;
  const COLS = board[0].length;

  const teamGreen = [players[0], players[2]];
  const teamYellow = [players[1], players[3]];

  console.log("Équipe verte:", teamGreen);
  console.log("Équipe jaune:", teamYellow);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const playerId = board[r][c];
      if (playerId === null) continue;

      console.log(`Case [${r}, ${c}] jouée par : ${playerId}`);

      const team = teamGreen.includes(playerId)
        ? teamGreen
        : teamYellow.includes(playerId)
        ? teamYellow
        : null;

      if (!team) {
        console.log(`Le joueur ${playerId} n'appartient à aucune équipe`);
        continue;
      }

      const teamName = team === teamGreen ? "green" : "yellow";
      console.log(`Le joueur ${playerId} appartient à l’équipe : ${teamName}`);

      for (let [dr, dc] of directions) {
        let count = 1;

        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (
            nr >= 0 && nr < ROWS &&
            nc >= 0 && nc < COLS &&
            team.includes(board[nr][nc])
          ) {
            count++;
            console.log(`Alignement trouvé avec ${board[nr][nc]} à [${nr}, ${nc}] (${count})`);
          } else {
            break;
          }
        }

        if (count === 4) {
          console.log(`✅ Équipe ${teamName} gagne grâce au joueur ${playerId} !`);
          return {
            team: teamName,
            playerId
          };
        } else {
          console.log(`⏳ Pas encore 4 pour ${playerId}, direction [${dr}, ${dc}], total: ${count}`);
        }
      }
    }
  }

  return false;
}

// 🧹 Supprimer toutes les parties
app.delete('/deleteAllGames', (req, res) => {
  const numberOfGames = Object.keys(games).length;
  if (numberOfGames > 0) {
    Object.keys(games).forEach(roomId => {
      io.to(roomId).emit('gameDeleted', 'La partie a été supprimée.');
      delete games[roomId];
    });
    res.status(200).send({ message: `${numberOfGames} parties ont été supprimées.` });
  } else {
    res.status(404).send({ message: 'Aucune partie en cours à supprimer.' });
  }
});

io.on('connection', (socket) => {
  console.log('✅ Un utilisateur s\'est connecté :', socket.id);

  // 🎮 Création d'une partie
  socket.on('createGame', ({ mode }) => {
    const roomId = generateShortRoomCode();
    const requiredPlayers = mode === '2v2' ? 4 : 2;

    games[roomId] = {
      players: [socket.id],
      board: [],
      currentPlayer: '',
      mode,
      requiredPlayers,
    };

    socket.join(roomId);
    console.log(`🎲 Partie créée avec l'ID : ${roomId} en mode ${mode}`);
    socket.emit('gameCreated', { roomId , roomMode: mode });
    console.log('ID Salon :',roomId)
  });

  // 👥 Rejoindre une partie
  socket.on('joinGame', ({ roomId,mode}) => {
    const game = games[roomId];
  
    if (!game) {
      socket.emit('error', "❌ La partie n'existe pas.");
      return;
    }

    if (game.mode !== mode) {
      console.log(game.mode,"  et ",mode)
      //console.log('error', `❌ Le mode de jeu ne correspond pas à celui de la salle (${game.mode}).`)
      socket.emit('error', `❌ Le mode de jeu ne correspond pas à celui de la salle. Veuillez passer au mode "${game.mode}".`);
      return;
    }

    
  
    if (game.players.includes(socket.id)) {
      socket.emit('error', "❌ Vous êtes déjà dans cette partie.");
      return;
    }
  
    if (game.players.length >= game.requiredPlayers) {
      socket.emit('error', "❌ La partie est déjà pleine.");
      return;
    }
  
    // Le joueur rejoint la partie
    game.players.push(socket.id);
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { players: game.players });
    console.log(`👥 Joueur ${socket.id} a rejoint la partie ${roomId}`);
  
    // Si le nombre de joueurs atteint la capacité nécessaire, on commence la partie
    if (game.players.length === game.requiredPlayers) {
      game.board = Array(6).fill(null).map(() => Array(7).fill(null));  // Initialisation du plateau
      game.currentPlayer = game.players[0];  // Le premier joueur commence
  
      // Définir les couleurs des équipes
      const teamColors = game.requiredPlayers === 2
        ? ['green', 'yellow']
        : ['green', 'yellow', 'green', 'yellow'];
  
      const playerColors = game.players.reduce((acc, player, i) => {
        acc[player] = teamColors[i];
        return acc;
      }, {});
  
     // Démarre la partie pour tous les joueurs
io.to(roomId).emit("startGame", {
  players: game.players,
  playerColors,
  mode: game.mode,
  teamGreen: [game.players[0], game.players[2]],  // J1 et J2
  teamYellow: [game.players[1], game.players[3]], // J3 et J4
});

   // Met à jour le plateau pour tous les joueurs
   io.to(roomId).emit('updateBoard', {
    board: game.board,
    currentPlayer: game.currentPlayer,
    teamGreen: [game.players[0], game.players[2]],  // J1 et J2
    teamYellow: [game.players[1], game.players[3]], // J3 et J4,
    mode: game.mode,

  });
     
    } else {
      // Si la partie n'est pas encore pleine, on notifie le joueur qu'il a rejoint
      socket.emit('success', 'Vous avez rejoint la partie');
    }
  });
  

  //Individu qui quitte a perdu 
  


  // ▶️ Jouer un coup
  socket.on('play', ({ roomId, column }) => {
    const game = games[roomId];
    if (!game) return;

    const { board, players, currentPlayer, mode } = game;
    if (socket.id !== currentPlayer) return;

    for (let row = 5; row >= 0; row--) {
      if (board[row][column] === null) {
        board[row][column] = socket.id;

        // 🏆 Vérifie victoire
        const winner = checkWinner(board, mode, players);
        if (winner) {
          io.to(roomId).emit('updateBoard', {
            board,
            currentPlayer: null,
          });
        
          io.to(roomId).emit('gameWon', {
            winner: mode === '1v1' ? socket.id : winner.playerId,
            team: winner.team || null,
          });
        
          console.log(`🎉 ${winner.playerId || socket.id} a gagné la partie ${roomId} (${winner.team || 'solo'})`);
          delete games[roomId];
          return;
        }
        
        // 🔁 Tour suivant
        let nextPlayer;
        if (mode === '1v1') {
          nextPlayer = players.find(p => p !== currentPlayer);
        } else {
          const currentIndex = players.indexOf(currentPlayer);
          nextPlayer = players[(currentIndex + 1) % players.length];
        }

        game.currentPlayer = nextPlayer;

        io.to(roomId).emit('updateBoard', {
          board,
          currentPlayer: nextPlayer,
        });

       // console.log(`${socket.id} a joué dans la colonne ${column}`);
        return;
      }
    }

    socket.emit('error', "❌ Colonne pleine !");
  });

  // ❌ Déconnexion d'un joueur
// Lors de la déconnexion de l'utilisateur
socket.on('disconnect', () => {
  console.log('❌ Utilisateur déconnecté :', socket.id);

  for (const [roomId, game] of Object.entries(games)) {
    if (game.players.includes(socket.id)) {
      // Trouver l'autre joueur dans la room
      const otherPlayer = game.players.find(player => player !== socket.id);

      // Avertir tous les joueurs que l'un d'eux a quitté la partie
      io.to(roomId).emit('playerLeft', { playerId: socket.id });

      // Déclarer l'autre joueur comme gagnant
      io.to(roomId).emit('gameWon', { winner: otherPlayer });

      // Log des informations sur le gagnant et le perdant
      console.log(`🏆 Gagnant : ${otherPlayer}`);
      console.log(`💀 Perdant : ${socket.id}`);

      // Supprimer la partie en cours
      delete games[roomId];
      console.log(`⚠️ Partie ${roomId} supprimée suite au départ de ${socket.id}`);
      break;
    }
  }
});

// Lorsqu'un joueur quitte la partie (playerLeft)
socket.on('playerLeft', ({ playerId }) => {
  const game = Object.values(games).find(game => game.players.includes(playerId));

  if (game) {
    const { players, roomId } = game;
    // Trouver le joueur restant
    const remainingPlayer = players.find(player => player !== playerId);

    // Déclarer le joueur restant comme gagnant
    io.to(roomId).emit('gameWon', { winner: remainingPlayer });

    // Log du gagnant
    console.log(`🎉 Le joueur ${remainingPlayer} a gagné la partie ${roomId} car ${playerId} a quitté.`);
  }
});



});

// 🚀 Lancement serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
