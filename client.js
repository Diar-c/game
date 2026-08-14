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
let myAvatar = '😀';
let myFriendCode = null;
let myCreatedAt = null;
const players = {};
let myX = 100, myY = 100;
const keys = {};

let localStream = null;
let peerConnection = null;
let currentCall = null;
let incomingCallData = null;

let authMode = 'login';
let currentView = 'chats';
let currentChat = 'general'; // 'general' или friendId
let currentFriendId = null;
let currentFriendName = null;

// Список доступных аватарок
const avatarOptions = ['😀', '😎', '🤖', '👽', '🐱', '🦊', '🐼', '🐸', '🐙', '🦄'];

// ==================== АУТЕНТИФИКАЦИЯ ====================
auth.onAuthStateChanged((user) => {
  if (user) {
    myId = user.uid;
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'flex';
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('profileButton').style.display = 'flex';

    // Загружаем/создаём профиль
    database.ref(`users/${myId}`).once('value').then(snap => {
      const data = snap.val();
      if (data) {
        myName = data.name || `Гость_${myId.slice(0,4)}`;
        myColor = data.color || getRandomColor();
        myAvatar = data.avatar || '😀';
        myFriendCode = data.friendCode || generateFriendCode();
        myCreatedAt = data.createdAt || Date.now();
      } else {
        myName = `Гость_${myId.slice(0,4)}`;
        myColor = getRandomColor();
        myAvatar = '😀';
        myFriendCode = generateFriendCode();
        myCreatedAt = Date.now();
        database.ref(`users/${myId}`).set({
          name: myName,
          color: myColor,
          avatar: myAvatar,
          friendCode: myFriendCode,
          createdAt: myCreatedAt
        });
      }
      updateProfileUI();
      setupGame();
      setupFriends();
      setupCalls();
      buildChatList();
      buildAvatarGrid();
      // По умолчанию открываем общий чат
      openChat('general');
    });
  } else {
    myId = null;
    document.getElementById('topBar').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('profileButton').style.display = 'none';
    document.getElementById('profileMenu').style.display = 'none';
    // Сброс
    if (myId) {
      database.ref(`players/${myId}`).remove();
      database.ref(`friends/${myId}`).off();
      database.ref(`friendRequests/${myId}`).off();
      database.ref(`calls/${myId}`).off();
    }
    localStream = null;
    peerConnection = null;
    currentCall = null;
    incomingCallData = null;
  }
});

// ==================== АВТОРИЗАЦИЯ ====================
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

// ==================== ПРОФИЛЬ ====================
function updateProfileUI() {
  document.getElementById('profileAvatarSmall').textContent = myAvatar;
  document.getElementById('profileNameSmall').textContent = myName;
  document.getElementById('profileAvatarLarge').textContent = myAvatar;
  document.getElementById('profileNickname').textContent = myName;
  document.getElementById('profileDate').textContent = `Регистрация: ${new Date(myCreatedAt).toLocaleDateString()}`;
  document.getElementById('profileCode').textContent = `Код: ${myFriendCode}`;
}
// Клик по кнопке профиля
document.getElementById('profileButton').addEventListener('click', () => {
  const menu = document.getElementById('profileMenu');
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
});
// Клик по коду — копирование
document.getElementById('profileCode').addEventListener('click', () => {
  navigator.clipboard.writeText(myFriendCode);
  alert('Код скопирован!');
});

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================
document.querySelectorAll('.sidebar-icon').forEach(icon => {
  icon.addEventListener('click', () => {
    const view = icon.dataset.view;
    switchView(view);
  });
});
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
  document.querySelector(`.sidebar-icon[data-view="${view}"]`).classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}View`).classList.add('active');
  if (view === 'chats') {
    // При возврате на чаты показываем текущий чат
    if (currentChat === 'general') {
      openChat('general');
    } else {
      openChat(currentFriendId);
    }
  }
}

// ==================== ИГРОВАЯ ЧАСТЬ (общий чат) ====================
function setupGame() {
  database.ref(`players/${myId}`).set({
    name: myName,
    x: myX,
    y: myY,
    color: myColor,
    avatar: myAvatar
  });
  database.ref(`players/${myId}`).onDisconnect().remove();

  database.ref('players').on('value', snapshot => {
    const data = snapshot.val();
    for (const id in players) if (id !== myId) delete players[id];
    if (data) for (const id in data) if (id !== myId) players[id] = data[id];
  });

  database.ref('messages').limitToLast(50).on('child_added', snap => {
    const msg = snap.val();
    addGeneralMessage(`${msg.name}: ${msg.text}`);
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
    ctx.fillRect(p.x, p.y, 30, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.avatar || '😀', p.x + 15, p.y + 20);
    ctx.fillText(p.name, p.x + 15, p.y - 5);
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

function addGeneralMessage(text) {
  const div = document.createElement('div');
  div.textContent = text;
  document.getElementById('generalMessages').appendChild(div);
  document.getElementById('generalMessages').scrollTop = 999999;
}

document.getElementById('generalChatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('generalChatInput').value.trim();
  if (text && myId) {
    database.ref('messages').push({
      userId: myId,
      name: myName,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    document.getElementById('generalChatInput').value = '';
  }
});

// ==================== ЧАТЫ (СПИСОК И ОТКРЫТИЕ) ====================
function buildChatList() {
  const chatList = document.getElementById('chatList');
  chatList.innerHTML = '';
  // Общий чат
  const generalItem = document.createElement('div');
  generalItem.className = 'chat-item' + (currentChat === 'general' ? ' active' : '');
  generalItem.textContent = 'Общий чат';
  generalItem.onclick = () => openChat('general');
  chatList.appendChild(generalItem);

  // Личные чаты (для каждого друга)
  database.ref(`friends/${myId}`).on('value', snap => {
    const data = snap.val();
    // Удаляем старые личные чаты
    const existing = chatList.querySelectorAll('.chat-item.private');
    existing.forEach(el => el.remove());
    if (data) {
      for (const friendId in data) {
        const friendName = data[friendId].name;
        const item = document.createElement('div');
        item.className = 'chat-item private' + (currentChat === friendId ? ' active' : '');
        item.textContent = `💬 ${friendName}`;
        item.onclick = () => openChat(friendId, friendName);
        chatList.appendChild(item);
      }
    }
  });
}

function openChat(chatId, friendName = null) {
  // Сброс активных классов
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  // Выделяем нужный элемент
  const chatItems = document.querySelectorAll('.chat-item');
  if (chatId === 'general') {
    currentChat = 'general';
    chatItems[0]?.classList.add('active'); // первый - общий
    document.getElementById('generalChat').style.display = 'flex';
    document.getElementById('privateChat').style.display = 'none';
  } else {
    currentChat = chatId;
    currentFriendId = chatId;
    currentFriendName = friendName;
    // Найти элемент по id друга
    chatItems.forEach(el => {
      if (el.textContent.includes(friendName)) el.classList.add('active');
    });
    document.getElementById('generalChat').style.display = 'none';
    document.getElementById('privateChat').style.display = 'flex';
    document.getElementById('privateChatHeader').textContent = `Личный чат с ${friendName}`;
    // Очищаем сообщения
    document.getElementById('privateMessages').innerHTML = '';
    // Подписываемся на личные сообщения
    const friendKey = [myId, chatId].sort().join('_');
    database.ref(`privateMessages/${friendKey}`).off(); // снимаем старый слушатель
    database.ref(`privateMessages/${friendKey}`).limitToLast(50).on('child_added', snap => {
      const msg = snap.val();
      const sender = msg.from === myId ? 'Вы' : friendName;
      addPrivateMessage(`${sender}: ${msg.text}`);
    });
  }
}

function addPrivateMessage(text) {
  const div = document.createElement('div');
  div.textContent = text;
  document.getElementById('privateMessages').appendChild(div);
  document.getElementById('privateMessages').scrollTop = 999999;
}

document.getElementById('privateChatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('privateChatInput').value.trim();
  if (text && currentFriendId) {
    const friendKey = [myId, currentFriendId].sort().join('_');
    database.ref(`privateMessages/${friendKey}`).push({
      from: myId,
      to: currentFriendId,
      fromName: myName,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    document.getElementById('privateChatInput').value = '';
  }
});

// ==================== ДРУЗЬЯ ====================
function setupFriends() {
  // Слушаем входящие запросы
  database.ref(`friendRequests/${myId}`).on('child_added', snap => {
    const request = snap.val();
    if (confirm(`${request.name} хочет добавить вас в друзья. Принять?`)) {
      database.ref(`friends/${myId}/${snap.key}`).set({ name: request.name });
      database.ref(`friends/${snap.key}/${myId}`).set({ name: myName });
    }
    database.ref(`friendRequests/${myId}/${snap.key}`).remove();
  });

  // Слушаем список друзей и обновляем вкладку "Друзья"
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
            <button onclick="openChat('${friendId}','${friendName}')">💬</button>
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

// ==================== НАСТРОЙКИ (АВАТАРКА) ====================
function buildAvatarGrid() {
  const grid = document.getElementById('avatarGrid');
  grid.innerHTML = '';
  avatarOptions.forEach(avatar => {
    const div = document.createElement('div');
    div.className = 'avatar-option' + (avatar === myAvatar ? ' selected' : '');
    div.textContent = avatar;
    div.onclick = () => {
      myAvatar = avatar;
      database.ref(`users/${myId}`).update({ avatar: avatar });
      database.ref(`players/${myId}`).update({ avatar: avatar });
      updateProfileUI();
      buildAvatarGrid(); // перерисовать
    };
    grid.appendChild(div);
  });
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
