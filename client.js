// ==================== КОНФИГУРАЦИЯ FIREBASE (твой проект) ====================
const firebaseConfig = {
  apiKey: "AIzaSyCoYiERRluU6VMu_-Yf_aqnjUNEX6SObiE",
  authDomain: "game-chat-69275.firebaseapp.com",
  databaseURL: "https://game-chat-69275-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "game-chat-69275",
  storageBucket: "game-chat-69275.firebasestorage.app",
  messagingSenderId: "345421295258",
  appId: "1:345421295258:web:ec0bf56423205180a63923",
  measurementId: "G-7B5QWL8GXT"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = canvas.parentElement.clientWidth;
canvas.height = canvas.parentElement.clientHeight;

let myId = null;
let myName = 'Гость';
let myColor = '#ffcc00';
const players = {};   // userId -> { name, x, y, color }
let myX = 100;
let myY = 100;
const keys = {};

// ==================== АУТЕНТИФИКАЦИЯ ====================
auth.signInAnonymously()
  .then((userCredential) => {
    myId = userCredential.user.uid;
    myName = `Гость_${myId.slice(0, 4)}`;
    myColor = getRandomColor();

    // Создаём запись о себе в базе данных
    database.ref(`players/${myId}`).set({
      name: myName,
      x: myX,
      y: myY,
      color: myColor,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    // При отключении (закрытие вкладки) удаляем свою запись
    database.ref(`players/${myId}`).onDisconnect().remove();

    // Подключаем слушателей
    setupListeners();
    startGameLoop();

    console.log('Успешный вход, ID:', myId);
  })
  .catch((error) => {
    console.error('Ошибка аутентификации:', error);
  });

// ==================== СЛУШАТЕЛИ БАЗЫ ДАННЫХ ====================
function setupListeners() {
  // Слушаем всех игроков
  database.ref('players').on('value', (snapshot) => {
    const data = snapshot.val();
    // Удаляем всех, кроме себя (потом добавим актуальных)
    for (const id in players) {
      if (id !== myId) delete players[id];
    }
    if (data) {
      for (const id in data) {
        if (id !== myId) {
          players[id] = data[id];
        }
      }
    }
  });

  // Слушаем последние 20 сообщений чата
  database.ref('messages').limitToLast(20).on('child_added', (snapshot) => {
    const msg = snapshot.val();
    addMessage(`${msg.name}: ${msg.text}`);
  });
}

// ==================== ДВИЖЕНИЕ ====================
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function updatePosition() {
  const speed = 3;
  let moved = false;
  if (keys['arrowleft'] || keys['a']) { myX -= speed; moved = true; }
  if (keys['arrowright'] || keys['d']) { myX += speed; moved = true; }
  if (keys['arrowup'] || keys['w']) { myY -= speed; moved = true; }
  if (keys['arrowdown'] || keys['s']) { myY += speed; moved = true; }

  // Ограничиваем перемещение пределами canvas
  myX = Math.max(0, Math.min(canvas.width - 20, myX));
  myY = Math.max(0, Math.min(canvas.height - 20, myY));

  // Если двигались, отправляем обновление в Firebase
  if (moved && myId) {
    database.ref(`players/${myId}`).update({
      x: myX,
      y: myY,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });
    // Обновляем себя в локальном списке
    players[myId] = { name: myName, x: myX, y: myY, color: myColor };
  }
}

// ==================== ОТПРАВКА СООБЩЕНИЙ ====================
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && myId) {
    database.ref('messages').push({
      userId: myId,
      name: myName,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    chatInput.value = '';
  }
});

function addMessage(text) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==================== ОТРИСОВКА И ИГРОВОЙ ЦИКЛ ====================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = p.color || '#66ccff';
    ctx.fillRect(p.x, p.y, 20, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x + 10, p.y - 5);
  }
}

function startGameLoop() {
  function gameLoop() {
    updatePosition();
    draw();
    requestAnimationFrame(gameLoop);
  }
  gameLoop();
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function getRandomColor() {
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ==================== РЕСАЙЗ ====================
window.addEventListener('resize', () => {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
});