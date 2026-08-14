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
let myAvatar = '😀'; // Может быть emoji или data URL
let myFriendCode = null;
let myCreatedAt = null;
const players = {};
let myX = 100, myY = 100;
const keys = {};

let localStream = null;
let peerConnection = null;
let currentCall = null; // { id, friendId, friendName }
let incomingCallData = null;

let authMode = 'login';
let currentView = 'chats';
let currentChat = 'general'; // 'general' или friendId
let currentFriendId = null;
let currentFriendName = null;

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
  const smallAvatar = document.getElementById('profileAvatarSmall');
  const largeAvatar = document.getElementById('profileAvatarLarge');
  setAvatarDisplay(smallAvatar, myAvatar);
  setAvatarDisplay(largeAvatar, myAvatar);
  document.getElementById('profileNameSmall').textContent = myName;
  document.getElementById('profileNickname').textContent = myName;
  document.getElementById('profileDate').textContent = `Регистрация: ${new Date(myCreatedAt).toLocaleDateString()}`;
  document.getElementById('profileCode').textContent = `Код: ${myFriendCode}`;
  document.getElementById('nicknameInput').value = myName;
}

// Вспомогательная функция для отображения аватарки (emoji или изображение)
function setAvatarDisplay(element, avatar) {
  if (avatar.startsWith('data:image')) {
    element.innerHTML = `<img src="${avatar}" alt="avatar">`;
  } else {
    element.textContent = avatar; // emoji
  }
}

document.getElementById('profileButton').addEventListener('click', () => {
  const menu = document.getElementById('profileMenu');
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('profileCode').addEventListener('click', () => {
  navigator.clipboard.writeText(myFriendCode);
  alert('Код скопирован!');
});

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================
document.querySelectorAll('.sidebar-icon').forEach(icon => {
  icon.addEventListener('click', () => {
    switchView(icon.dataset.view);
  });
});
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
  document.querySelector(`.sidebar-icon[data-view="${view}"]`).classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}View`).classList.add('active');
  if (view === 'chats') {
    if (currentChat === 'general') openChat('general');
    else openChat(currentFriendId, currentFriendName);
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
    addGeneralMessage(msg);
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
  myX = Math.max(0, Math.min(canvas.width - 30, myX));
  myY = Math.max(0, Math.min(canvas.height - 30, myY));
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
    // Если аватарка - изображение, показываем первую букву имени
    const avatarText = (p.avatar && !p.avatar.startsWith('data:image')) ? p.avatar : p.name[0];
    ctx.fillText(avatarText, p.x + 15, p.y + 20);
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

// ==================== СООБЩЕНИЯ ====================
function addGeneralMessage(msg) {
  const messagesDiv = document.getElementById('generalMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const avatarSpan = document.createElement('div');
  avatarSpan.className = 'msg-avatar';
  setAvatarDisplay(avatarSpan, msg.avatar || '😀');
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'msg-body';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'msg-name';
  nameSpan.textContent = msg.name + ':';
  bodyDiv.appendChild(nameSpan);
  bodyDiv.appendChild(document.createTextNode(' ' + msg.text));
  messageDiv.appendChild(avatarSpan);
  messageDiv.appendChild(bodyDiv);
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

document.getElementById('generalChatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('generalChatInput').value.trim();
  if (text && myId) {
    database.ref('messages').push({
      userId: myId,
      name: myName,
      avatar: myAvatar,
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
  const generalItem = document.createElement('div');
  generalItem.className = 'chat-item' + (currentChat === 'general' ? ' active' : '');
  generalItem.textContent = 'Общий чат';
  generalItem.onclick = () => openChat('general');
  chatList.appendChild(generalItem);

  database.ref(`friends/${myId}`).on('value', snap => {
    const data = snap.val();
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
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  if (chatId === 'general') {
    currentChat = 'general';
    document.getElementById('generalChat').style.display = 'flex';
    document.getElementById('privateChat').style.display = 'none';
    const firstItem = document.querySelector('#chatList .chat-item');
    if (firstItem) firstItem.classList.add('active');
  } else {
    currentChat = chatId;
    currentFriendId = chatId;
    currentFriendName = friendName;
    document.getElementById('generalChat').style.display = 'none';
    document.getElementById('privateChat').style.display = 'flex';
    document.getElementById('privateChatHeader').textContent = `Личный чат с ${friendName}`;
    document.getElementById('privateMessages').innerHTML = '';
    const friendKey = [myId, chatId].sort().join('_');
    database.ref(`privateMessages/${friendKey}`).off();
    database.ref(`privateMessages/${friendKey}`).limitToLast(50).on('child_added', snap => {
      const msg = snap.val();
      addPrivateMessage(msg, friendName);
    });
    document.querySelectorAll('#chatList .chat-item.private').forEach(el => {
      if (el.textContent.includes(friendName)) el.classList.add('active');
    });
  }
}

function addPrivateMessage(msg, friendName) {
  const messagesDiv = document.getElementById('privateMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const avatarSpan = document.createElement('div');
  avatarSpan.className = 'msg-avatar';
  setAvatarDisplay(avatarSpan, msg.avatar || '😀');
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'msg-body';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'msg-name';
  const senderName = msg.from === myId ? 'Вы' : friendName;
  nameSpan.textContent = senderName + ':';
  bodyDiv.appendChild(nameSpan);
  bodyDiv.appendChild(document.createTextNode(' ' + msg.text));
  messageDiv.appendChild(avatarSpan);
  messageDiv.appendChild(bodyDiv);
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
      avatar: myAvatar,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    document.getElementById('privateChatInput').value = '';
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

// ==================== НАСТРОЙКИ ====================
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
      buildAvatarGrid();
    };
    grid.appendChild(div);
  });

  // Кнопка загрузки
  const uploadBtn = document.getElementById('uploadAvatarBtn');
  uploadBtn.onclick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        alert('Файл слишком большой. Максимум 500 КБ.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        myAvatar = dataUrl;
        database.ref(`users/${myId}`).update({ avatar: dataUrl });
        database.ref(`players/${myId}`).update({ avatar: dataUrl });
        updateProfileUI();
        buildAvatarGrid();
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };
}

function changeNickname() {
  const newNick = document.getElementById('nicknameInput').value.trim();
  if (!newNick) return;
  myName = newNick;
  database.ref(`users/${myId}`).update({ name: newNick });
  database.ref(`players/${myId}`).update({ name: newNick });
  updateProfileUI();
  alert('Ник изменён!');
}

// ==================== ЗВОНКИ (Discord-like) ====================
function setupCalls() {
  // Слушаем входящие звонки
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

  // Слушаем завершение звонка (удаление записи)
  database.ref(`calls/${myId}`).on('child_removed', snap => {
    if (currentCall && snap.key === currentCall.id) {
      endCallUI();
    }
  });
}

async function startCall(friendId, friendName) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    alert('Нет доступа к микрофону/камере');
    return;
  }

  // Показываем окно звонка
  document.getElementById('localVideo').srcObject = localStream;
  document.getElementById('callPanel').style.display = 'flex';
  document.getElementById('incomingCall').style.display = 'none';

  const callRef = database.ref(`calls/${friendId}`).push();
  const callId = callRef.key;
  currentCall = { id: callId, friendId, friendName };
  callRef.set({
    callerId: myId,
    callerName: myName,
    status: 'ringing',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  // Ожидаем ответа
  database.ref(`calls/${friendId}/${callId}`).on('value', snap => {
    const data = snap.val();
    if (data && data.status === 'accepted') {
      createPeerConnection(friendId, callId, true);
    } else if (data && data.status === 'rejected') {
      endCallUI();
    }
  });
}

function acceptCall() {
  if (!incomingCallData) return;
  navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(stream => {
      localStream = stream;
      document.getElementById('localVideo').srcObject = stream;
      document.getElementById('callPanel').style.display = 'flex';
      document.getElementById('incomingCall').style.display = 'none';
      database.ref(`calls/${myId}/${incomingCallData.callId}`).update({ status: 'accepted' });
      currentCall = { id: incomingCallData.callId, friendId: incomingCallData.callerId, friendName: incomingCallData.callerName };
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

function endCall() {
  if (currentCall) {
    // Если мы инициатор, удаляем запись; если получатель, просто обновляем статус
    if (currentCall.friendId) {
      database.ref(`calls/${currentCall.friendId}/${currentCall.id}`).remove();
    }
    database.ref(`calls/${myId}/${currentCall.id}`).remove();
  }
  endCallUI();
}

function endCallUI() {
  document.getElementById('callPanel').style.display = 'none';
  document.getElementById('incomingCall').style.display = 'none';
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  document.getElementById('localVideo').srcObject = null;
  document.getElementById('remoteVideo').srcObject = null;
  currentCall = null;
  incomingCallData = null;
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('muteBtn').textContent = audioTrack.enabled ? '🎙️' : '🔇';
    }
  }
}

function toggleCamera() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('cameraBtn').textContent = videoTrack.enabled ? '📷' : '🚫';
    }
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
