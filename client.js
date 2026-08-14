// ==================== КОНФИГУРАЦИЯ FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyCoYiERRluU6VMu_-Yf_aqnjUNEX6SObiE",
  authDomain: "game-chat-69275.firebaseapp.com",
  databaseURL: "https://game-chat-69275-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "game-chat-69275",
  storageBucket: "game-chat-69275.firebasestorage.app",
  messagingSenderId: "345421295258",
  appId: "1:345421295258:web:ec0bf56423205180a63923"
};

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
let myFriendCode = null;
const players = {};
let myX = 100, myY = 100;
const keys = {};

let localStream = null;
let peerConnection = null;
let currentCall = null;
let incomingCallData = null;

let authMode = 'login'; // 'login' или 'register'

// ==================== АУТЕНТИФИКАЦИЯ ====================
auth.onAuthStateChanged((user) => {
  if (user) {
    // Пользователь вошёл
    myId = user.uid;
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'flex';
    document.getElementById('friendsPanel').style.display = 'flex';
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';

    // Загружаем профиль
    database.ref(`users/${myId}`).once('value').then(snap => {
      const data = snap.val();
      if (data) {
        myName = data.name || `Гость_${myId.slice(0,4)}`;
        myColor = data.color || getRandomColor();
        myFriendCode = data.friendCode || generateFriendCode();
      } else {
        myName = `Гость_${myId.slice(0,4)}`;
        myColor = getRandomColor();
        myFriendCode = generateFriendCode();
        database.ref(`users/${myId}`).set({
          name: myName,
          color: myColor,
          friendCode: myFriendCode
        });
      }
      document.getElementById('friendCode').textContent = myFriendCode;
      setupGame();
      setupFriends();
      setupCalls();
    });
  } else {
    // Пользователь вышел или ещё не вошёл
    myId = null;
    document.getElementById('topBar').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('friendsPanel').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex'; // показываем окно входа
    document.getElementById('logoutBtn').style.display = 'none';

    // Очищаем данные
    if (myId) {
      database.ref(`players/${myId}`).remove();
      database.ref(`friends/${myId}`).off();
      database.ref(`friendRequests/${myId}`).off();
      database.ref(`calls/${myId}`).off();
    }
    // Сбрасываем переменные
    localStream = null;
    peerConnection = null;
    currentCall = null;
    incomingCallData = null;
    document.getElementById('videoContainer').style.display = 'none';
  }
});

// ==================== ФУНКЦИИ АВТОРИЗАЦИИ ====================
function hideAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Вход' : 'Регистрация';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Войти' : 'Создать аккаунт';
}

function handleAuth() {
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  if (authMode === 'login') {
    auth.signInWithEmailAndPassword(email, password).catch(err => alert(err.message));
  } else {
    auth.createUserWithEmailAndPassword(email, password).catch(err => alert(err.message));
  }
}

function logout() {
  auth.signOut();
}

// ==================== ИГРОВАЯ ЧАСТЬ ====================
function setupGame() {
  database.ref(`players/${myId}`).set({
    name: myName,
    x: myX,
    y: myY,
    color: myColor
  });
  database.ref(`players/${myId}`).onDisconnect().remove();

  database.ref('players').on('value', snapshot => {
    const data = snapshot.val();
    for (const id in players) if (id !== myId) delete players[id];
    if (data) for (const id in data) if (id !== myId) players[id] = data[id];
  });

  database.ref('messages').limitToLast(50).on('child_added', snap => {
    const msg = snap.val();
    addMessage(`${msg.name}: ${msg.text}`);
  });

  startGameLoop();
}

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function updatePosition() {
  const speed = 3;
  let moved = false;
  if (keys['arrowleft'] || keys['a']) { myX -= speed; moved = true; }
  if (keys['arrowright'] || keys['d']) { myX += speed; moved = true; }
  if (keys['arrowup'] || keys['w']) { myY -= speed; moved = true; }
  if (keys['arrowdown'] || keys['s']) { myY += speed; moved = true; }
  myX = Math.max(0, Math.min(canvas.width - 20, myX));
  myY = Math.max(0, Math.min(canvas.height - 20, myY));
  if (moved && myId) {
    database.ref(`players/${myId}`).update({ x: myX, y: myY });
  }
}

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
  function loop() {
    updatePosition();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
}

function addMessage(text) {
  const div = document.createElement('div');
  div.textContent = text;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = 999999;
}

document.getElementById('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('chatInput').value.trim();
  if (text && myId) {
    database.ref('messages').push({
      userId: myId,
      name: myName,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    document.getElementById('chatInput').value = '';
  }
});

// ==================== ДРУЗЬЯ ====================
function setupFriends() {
  database.ref(`friendRequests/${myId}`).on('child_added', snap => {
    const request = snap.val();
    if (confirm(`${request.name} хочет добавить вас в друзья. Принять?`)) {
      database.ref(`friends/${myId}/${snap.key}`).set({ name: request.name });
      database.ref(`friends/${snap.key}/${myId}`).set({ name: myName });
    }
    database.ref(`friendRequests/${myId}/${snap.key}`).remove();
  });

  database.ref(`friends/${myId}`).on('value', snap => {
    const data = snap.val();
    const listDiv = document.getElementById('friendsList');
    listDiv.innerHTML = '';
    if (data) {
      for (const friendId in data) {
        const friendName = data[friendId].name;
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.innerHTML = `
          <span class="name">${friendName}</span>
          <div class="actions">
            <button onclick="startPrivateChat('${friendId}','${friendName}')">💬</button>
            <button onclick="startCall('${friendId}','${friendName}')">📞</button>
          </div>
        `;
        listDiv.appendChild(friendItem);
      }
    }
  });
}

function generateFriendCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function addFriend() {
  const code = document.getElementById('addFriendInput').value.trim().toUpperCase();
  if (!code) return;
  database.ref('users').orderByChild('friendCode').equalTo(code).once('value')
    .then(snapshot => {
      if (snapshot.exists()) {
        const friendId = Object.keys(snapshot.val())[0];
        const friendName = snapshot.val()[friendId].name;
        database.ref(`friendRequests/${friendId}/${myId}`).set({
          name: myName,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        alert('Запрос отправлен!');
      } else {
        alert('Пользователь с таким кодом не найден');
      }
    });
}

function startPrivateChat(friendId, friendName) {
  const friendKey = [myId, friendId].sort().join('_');
  const message = prompt(`Сообщение для ${friendName}:`);
  if (message) {
    database.ref(`privateMessages/${friendKey}`).push({
      from: myId,
      to: friendId,
      fromName: myName,
      text: message,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }
}

// ==================== ЗВОНКИ ====================
function setupCalls() {
  database.ref(`calls/${myId}`).on('value', snap => {
    const data = snap.val();
    if (data && data.status === 'ringing') {
      incomingCallData = { callId: snap.key, callerId: data.callerId, callerName: data.callerName };
      document.getElementById('incomingCallText').textContent = `Входящий звонок от ${data.callerName}`;
      document.getElementById('incomingCall').style.display = 'block';
    } else {
      document.getElementById('incomingCall').style.display = 'none';
    }
  });
}

async function startCall(friendId, friendName) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    document.getElementById('localVideo').srcObject = localStream;
    document.getElementById('videoContainer').style.display = 'flex';
  } catch (err) {
    alert('Нет доступа к микрофону/камере');
    return;
  }

  const callRef = database.ref(`calls/${friendId}`).push();
  const callId = callRef.key;
  currentCall = { id: callId, friendId, friendName };
  callRef.set({
    callerId: myId,
    callerName: myName,
    status: 'ringing',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  database.ref(`calls/${friendId}/${callId}`).on('value', snap => {
    const data = snap.val();
    if (data && data.status === 'accepted') {
      createPeerConnection(friendId, callId, true);
    }
  });
}

function acceptCall() {
  if (!incomingCallData) return;
  navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(stream => {
      localStream = stream;
      document.getElementById('localVideo').srcObject = stream;
      document.getElementById('videoContainer').style.display = 'flex';
      database.ref(`calls/${myId}/${incomingCallData.callId}`).update({ status: 'accepted' });
      createPeerConnection(incomingCallData.callerId, incomingCallData.callId, false);
    })
    .catch(err => alert('Нет доступа к медиа'));
}

function rejectCall() {
  if (incomingCallData) {
    database.ref(`calls/${myId}/${incomingCallData.callId}`).update({ status: 'rejected' });
    database.ref(`calls/${myId}/${incomingCallData.callId}`).remove();
    incomingCallData = null;
  }
}

function createPeerConnection(remoteId, callId, isCaller) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  peerConnection = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    document.getElementById('remoteVideo').srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      database.ref(`calls/${remoteId}/${callId}/iceCandidates`).push(event.candidate.toJSON());
    }
  };

  if (isCaller) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      database.ref(`calls/${remoteId}/${callId}`).update({ offer: pc.localDescription });
    });
  }

  database.ref(`calls/${myId}/${callId}/iceCandidates`).on('child_added', snap => {
    pc.addIceCandidate(new RTCIceCandidate(snap.val()));
  });

  if (!isCaller) {
    database.ref(`calls/${myId}/${callId}`).on('value', snap => {
      const data = snap.val();
      if (data && data.offer && !pc.localDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        pc.createAnswer().then(answer => {
          pc.setLocalDescription(answer);
          database.ref(`calls/${myId}/${callId}`).update({ answer: pc.localDescription });
        });
      } else if (data && data.answer && !pc.remoteDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
function getRandomColor() {
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0'];
  return colors[Math.floor(Math.random() * colors.length)];
}

window.addEventListener('resize', () => {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
});
