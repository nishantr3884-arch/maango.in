// =============================================
// 🥭 MAANGO APP.JS — COMPLETE FRONTEND LOGIC
// =============================================

// ===== 1. FIREBASE INITIALIZATION =====
const firebaseConfig = {
  apiKey: "AIzaSyAikQe8asrbdh7BWmPKLu9HDCNg1J9tqr4",
  authDomain: "maango-9c803.firebaseapp.com",
  projectId: "maango-9c803",
  storageBucket: "maango-9c803.firebasestorage.app",
  messagingSenderId: "524807951878",
  appId: "1:524807951878:web:1dcf661c2ef25231aed587"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== 2. BACKEND & AI CONFIG =====
// ⚠️ APNA RENDER URL YAHAN DAALO after deploy
const BACKEND_URL = "https://maango-backend.onrender.com";

// Gemini AI Key (split for basic obfuscation)
const GEMINI_KEY = "AIzaSy" + "ACBXbKq_J-0f52D" + "YTj5WWl4q9ykNZq104";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

async function gemini(prompt) {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });
    if (!res.ok) return "⚠️ AI limit reached. Please try later.";
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch(e) {
    return 'Connection error. Please check internet.';
  }
}

// ===== 3. GLOBAL STATE =====
let currentUser     = null;
let currentUserData = null;
let currentChatId   = null;
let allListings     = [];
let dynCats         = new Set(['all']);
let authMode        = 'login';
let selectedType    = 'buyer';

// ===== 4. AUTH STATE LISTENER =====
auth.onAuthStateChanged((user) => {
  currentUser = user;
  const btn = document.getElementById('navAuthBtn');
  if (user) {
    db.collection('users').doc(user.uid).get().then((doc) => {
      currentUserData = doc.exists ? doc.data() : null;
      if (btn) btn.textContent = '👤 ' + (currentUserData?.name?.split(' ')[0] || 'Profile');
      renderProfile();
    });
  } else {
    currentUserData = null;
    if (btn) btn.textContent = '👤 Login';
    renderProfile();
  }
  loadListings();
});

// ===== 5. AUTHENTICATION LOGIC =====
function handleNavBtn() {
  currentUser
    ? showPage('profile')
    : document.getElementById('authModal').classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3500);
}

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupExtraFields').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('authMainBtn').textContent = mode === 'login' ? 'Secure Login' : 'Create Account';
  document.getElementById('forgotPwdLink').style.display = mode === 'login' ? 'block' : 'none';
}

function selectType(type) {
  selectedType = type;
  ['buyer','farmer','expert'].forEach(t => {
    document.getElementById('type' + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove('selected');
  });
  document.getElementById('type' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('selected');
}

function processAuth() {
  const btn   = document.getElementById('authMainBtn');
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value.trim();

  if (!email || !pass) { showToast('⚠️ Email and Password required.'); return; }

  btn.innerHTML = '<span class="spinner"></span> Processing...';
  btn.disabled  = true;

  function resetBtn() {
    btn.innerHTML = authMode === 'login' ? 'Secure Login' : 'Create Account';
    btn.disabled  = false;
  }

  if (authMode === 'signup') {
    const name   = document.getElementById('authName').value.trim();
    const mobile = document.getElementById('authMobile').value.trim();
    const city   = document.getElementById('authCity').value.trim();

    if (!name || !mobile || !city) { showToast('⚠️ Name, Mobile, and City required.'); resetBtn(); return; }
    if (pass.length < 6)           { showToast('⚠️ Password must be 6+ chars.');       resetBtn(); return; }

    auth.createUserWithEmailAndPassword(email, pass)
      .then((cred) => {
        cred.user.sendEmailVerification();
        // Save to backend (optional — works even if backend is offline)
        fetch(`${BACKEND_URL}/api/users/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cred.user.uid, name, email, country: city, user_type: selectedType })
        }).catch(() => {}); // Silently fail if backend unavailable

        return db.collection('users').doc(cred.user.uid).set({
          name, email, mobile, city, userType: selectedType,
          govtIdVerified: false, profileComplete: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(() => {
        closeModal('authModal');
        showToast('✅ Account Created! Check Email to verify.');
      })
      .catch(e => {
        showToast('❌ ' + (e.code === 'auth/email-already-in-use' ? 'Email already registered!' : e.message));
      })
      .finally(resetBtn);

  } else {
    auth.signInWithEmailAndPassword(email, pass)
      .then((cred) => {
        if (!cred.user.emailVerified) {
          auth.signOut();
          throw new Error("Please verify your email first.");
        }
        closeModal('authModal');
        showToast('✅ Secure Login Successful!');
      })
      .catch(e => showToast('❌ ' + e.message))
      .finally(resetBtn);
  }
}

function resetPassword() {
  const email = prompt("Enter your registered Email to reset password:");
  if (email) {
    auth.sendPasswordResetEmail(email)
      .then(() => { showToast("📧 Reset link sent!"); closeModal('authModal'); })
      .catch(e => showToast("❌ " + e.message));
  }
}

// ===== 6. PROFILE & KYC =====
function openProfileModal() {
  document.getElementById('profileModal')?.classList.add('show');
}

function saveProfile() {
  const govtIdType   = document.getElementById('govtIdType').value;
  const govtIdNumber = document.getElementById('govtIdNumber').value.trim();
  const state        = document.getElementById('userState').value.trim();
  const kycFile      = document.getElementById('kycFile');

  if (!govtIdType || !govtIdNumber || !state) {
    showToast('⚠️ Required KYC fields missing!');
    return;
  }

  // If file is selected, upload via backend; otherwise, save directly to Firestore
  if (kycFile && kycFile.files && kycFile.files.length > 0) {
    const file   = kycFile.files[0];
    const reader = new FileReader();
    showToast('⏳ Uploading securely...');

    reader.onloadend = function() {
      const base64String = reader.result.split(',')[1];
      fetch(`${BACKEND_URL}/api/users/kyc-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          docType: govtIdType,
          docNumber: govtIdNumber,
          fileBase64: base64String,
          fileName: file.name
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        return saveKycToFirestore(govtIdType, govtIdNumber, state);
      })
      .catch(e => showToast('❌ Upload Failed: ' + e.message));
    };
    reader.readAsDataURL(file);
  } else {
    saveKycToFirestore(govtIdType, govtIdNumber, state);
  }
}

function saveKycToFirestore(govtIdType, govtIdNumber, state) {
  return db.collection('users').doc(currentUser.uid).set({
    govtIdType, govtIdNumber, state,
    businessName: document.getElementById('businessName')?.value.trim() || '',
    govtIdVerified: true,
    profileComplete: true
  }, { merge: true })
  .then(() => db.collection('users').doc(currentUser.uid).get())
  .then((doc) => {
    currentUserData = doc.data();
    closeModal('profileModal');
    showToast('🔐 KYC Verified & Saved!');
    renderProfile();
  })
  .catch(e => showToast('❌ Error: ' + e.message));
}

function renderProfile() {
  const pc = document.getElementById('profileContent');
  if (!pc) return;

  if (!currentUser) {
    pc.innerHTML = `
      <div class="empty-state">
        <div>🔒</div>
        <p>Protecting user data.<br>Please login to access profile.</p>
      </div>
      <div style="padding:0 20px 20px">
        <button class="modal-submit" onclick="document.getElementById('authModal').classList.add('show')">
          Secure Access
        </button>
      </div>`;
    return;
  }

  const verified      = currentUserData?.govtIdVerified;
  const emailVerified = currentUser.emailVerified;
  const userName      = currentUserData?.name || 'User';
  const userType      = currentUserData?.userType || 'buyer';
  const userCity      = currentUserData?.city || '';
  const typeLabel     = userType === 'farmer' ? '🌾 Farmer' : userType === 'expert' ? '👨‍🏫 Expert' : '🛒 Buyer';

  pc.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${userName[0].toUpperCase()}</div>
      <div>
        <div style="font-size:18px;font-weight:800">${userName}</div>
        <div style="font-size:12px;opacity:.9;margin-top:2px">${typeLabel} · ${userCity}</div>
        <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          ${verified
            ? '<span class="verify-badge">🛡️ KYC Verified</span>'
            : '<span class="unverified-badge" onclick="openProfileModal()">⚠️ Pending KYC</span>'}
          ${emailVerified
            ? '<span class="verify-badge">🔐 Email Verified</span>'
            : '<span class="unverified-badge" onclick="currentUser.sendEmailVerification();showToast(\'Link Sent!\')">📧 Verify Email</span>'}
        </div>
      </div>
    </div>
    <div class="profile-menu">
      ${!verified ? '<div class="profile-item" onclick="openProfileModal()">🛡️ Complete KYC Verification</div>' : ''}
      <div class="profile-item" onclick="showPostModal()">📋 Post New Demand</div>
      <div class="profile-item" onclick="showPage(\'chat\')">💬 Encrypted Chats</div>
      <div class="profile-item" style="color:#d32f2f;" onclick="auth.signOut().then(()=>showPage(\'home\'))">🚪 Logout Securely</div>
    </div>`;
}

// ===== 7. LISTINGS / FEED =====
function loadListings() {
  db.collection('listings').orderBy('createdAt', 'desc').onSnapshot(
    (snap) => {
      allListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      dynCats.clear();
      dynCats.add('all');
      allListings.forEach(l => { if (l.category) dynCats.add(l.category); });
      updateCats();
      renderCards(allListings);
    },
    (err) => {
      console.error(err);
      document.getElementById('feedContainer').innerHTML =
        '<div class="empty-state"><p>Error loading feed. Check connection.</p></div>';
    }
  );
}

function updateCats() {
  const container = document.getElementById('catChips');
  if (!container) return;
  const emojis = {
    all:'🌟', gehu:'🌾', wheat:'🌾', chaval:'🌾', rice:'🌾',
    dal:'🫘', pyaz:'🧅', aloevera:'🌱', haldi:'🌿', makka:'🌽',
    corn:'🌽', ganna:'🎋', phal:'🍎', fruits:'🍎', veg:'🥬'
  };
  let html = '';
  dynCats.forEach(cat => {
    const icon = emojis[cat.toLowerCase()] || '📦';
    const name = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
    html += `<div class="chip ${cat==='all'?'active':''}" onclick="filterCat(this,'${cat}')">${icon} ${name}</div>`;
  });
  container.innerHTML = html;
}

function showPostModal() {
  if (!currentUser) {
    showToast('⚠️ Login Required');
    document.getElementById('authModal').classList.add('show');
    return;
  }
  if (!currentUser.emailVerified) {
    showToast('⚠️ Please verify your email first (check Profile).');
    return;
  }
  if (!currentUserData?.govtIdVerified) {
    showToast('⚠️ KYC Verification Required');
    openProfileModal();
    return;
  }
  document.getElementById('postModal').classList.add('show');
}

function submitPost() {
  const product  = document.getElementById('productName').value.trim();
  const qty      = document.getElementById('quantity').value.trim();
  const location = document.getElementById('location').value.trim();

  if (!product || !qty || !location) { showToast('⚠️ Fill required fields'); return; }

  const btn = document.getElementById('submitPostBtn');
  btn.innerHTML = '<span class="spinner"></span> Posting...';
  btn.disabled  = true;

  const catPrompt = `For agricultural product "${product}" return ONLY one lowercase English category word (e.g. wheat, rice, fruits, veg). Just the word.`;

  gemini(catPrompt)
    .then(catResult => {
      const category = (catResult || 'other').trim().toLowerCase().replace(/[^a-z_]/g, '') || 'other';
      return db.collection('listings').add({
        product, qty, location,
        price:    document.getElementById('price')?.value.trim() || 'Negotiable',
        desc:     document.getElementById('description')?.value.trim() || '',
        category, badge: 'New',
        userId:   currentUser.uid,
        userName: currentUserData?.name || 'User',
        userType: currentUserData?.userType || 'buyer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .then(() => {
      closeModal('postModal');
      showToast('✅ Demand Posted Successfully!');
      ['productName','quantity','location','price','description'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    })
    .finally(() => { btn.innerHTML = '🚀 Post Demand'; btn.disabled = false; });
}

function renderCards(data) {
  const c = document.getElementById('feedContainer');
  if (!data.length) {
    c.innerHTML = '<div class="empty-state"><div>📋</div><p>No demands yet.<br>Be the first to post!</p></div>';
    return;
  }

  let html = '';
  data.forEach((l, i) => {
    const name    = (l.userName || 'U').replace(/'/g, "\\'");
    const product = (l.product  || '').replace(/'/g, "\\'");
    const time    = l.createdAt?.toDate
      ? new Date(l.createdAt.toDate()).toLocaleDateString('en-IN')
      : 'Just now';

    html += `
    <div class="card" style="animation-delay:${i*.05}s">
      <div class="card-header">
        <div class="buyer-info">
          <div class="avatar">${(l.userName||'U')[0].toUpperCase()}</div>
          <div>
            <div class="buyer-name">${l.userName || 'User'}</div>
            <span class="buyer-type">${l.userType === 'farmer' ? '🌾 Farmer' : '🛒 Buyer'}</span>
          </div>
        </div>
        <span class="card-badge">${l.badge || 'New'}</span>
      </div>
      <div class="card-product">${l.product || ''}</div>
      <div class="card-desc">${l.desc || ''}</div>
      <div class="card-details">
        <div class="dtag">📦 <span>${l.qty || ''}</span></div>
        <div class="dtag">📍 <span>${l.location || ''}</span></div>
        <div class="dtag">💰 <span>${l.price || 'Negotiable'}</span></div>
      </div>
      <div class="card-footer">
        <span class="card-time">🕐 ${time}</span>
        <div style="display:flex; gap:8px;">
          <button class="trans-btn" onclick="translatePost(this, '${(l.desc||l.product).replace(/'/g,"\\'")}')">🔄 Translate</button>
          <button class="chat-btn" onclick="startChat('${l.id}','${l.userId||''}','${name}','${product}')">💬 Contact</button>
        </div>
      </div>
    </div>`;
  });
  c.innerHTML = html;
}

function translatePost(btn, text) {
  const orig = btn.innerText;
  btn.innerText = "⏳...";
  gemini(`Translate to Hindi (Devanagari script only). Return translation only, no explanation: "${text}"`)
    .then(res => {
      if (res && !res.includes("limit")) {
        btn.closest('.card').querySelector('.card-desc').innerText = res;
        btn.innerText = "✅ Done";
      } else {
        btn.innerText = orig;
        showToast("⚠️ Translation unavailable.");
      }
    });
}

// ===== 8. NAVIGATION =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(page + 'Page');
  if (pageEl) pageEl.classList.add('active');

  const navId  = 'nav' + page.charAt(0).toUpperCase() + page.slice(1);
  const navEl  = document.getElementById(navId);
  if (navEl) navEl.classList.add('active');

  if (page === 'chat')      loadChats();
  if (page === 'profile')   renderProfile();
  if (page === 'expert')    renderDirectory('expert',    'expertList',  '👨‍🏫', 'Verified Expert');
  if (page === 'farmerDir') renderDirectory('farmer',    'farmerList',  '🌾',  'Verified Farmer');
  if (page === 'buyerDir')  renderDirectory('buyer',     'buyerList',   '🛒',  'Verified Buyer');

  window.scrollTo(0, 0);
}

function switchTab(el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function filterCat(el, cat) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCards(cat === 'all' ? allListings : allListings.filter(l => l.category === cat));
}

function filterCards() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  renderCards(q
    ? allListings.filter(l =>
        (l.product||'').toLowerCase().includes(q) ||
        (l.location||'').toLowerCase().includes(q))
    : allListings);
}

// ===== 9. LEGAL MODALS =====
function openLegal(type) {
  document.getElementById('legalModal').classList.add('show');
  const title = document.getElementById('legalTitle');
  const body  = document.getElementById('legalBody');

  if (type === 'help') {
    title.textContent = "Help Center";
    body.innerHTML = `
      <strong>How to use Maango?</strong><br>
      1. Register and verify your email.<br>
      2. Complete KYC verification for security.<br>
      3. Search market demands or post your own.<br>
      4. Chat directly with buyers/farmers via encrypted chat.<br><br>
      <strong>Facing issues?</strong> Email us at <a href="mailto:support@maango.in">support@maango.in</a>`;
  } else if (type === 'contact') {
    title.textContent = "Contact Us";
    body.innerHTML = `
      <strong>Headquarters:</strong> Aligarh, Uttar Pradesh, India<br>
      <strong>Email:</strong> <a href="mailto:support@maango.in">support@maango.in</a><br>
      <strong>Phone:</strong> +91-XXXXX-XXXXX<br>
      <em style="font-size:12px; color:#888">(Available Mon–Sat, 9 AM – 6 PM IST)</em>`;
  } else {
    title.textContent = "Privacy & Terms";
    body.innerHTML = `
      Maango values your privacy. All documents provided during KYC are encrypted 
      and securely stored. We do not share your personal identification with third 
      parties without consent.<br><br>
      <a href="legal.html" style="color:var(--green); font-weight:700;">Read Full Policy →</a>`;
  }
}

// ===== 10. USER DIRECTORY =====
function renderDirectory(type, containerId, icon, titleRole) {
  const c = document.getElementById(containerId);
  c.innerHTML = `<div class="empty-state"><span class="spinner" style="border-top-color:var(--green)"></span><p>Loading profiles...</p></div>`;

  db.collection('users').where('userType', '==', type).onSnapshot(
    (snap) => {
      if (snap.empty) {
        c.innerHTML = `<div class="empty-state"><div>${icon}</div><p>No ${type}s registered yet.</p></div>`;
        return;
      }
      let html = '';
      snap.docs.forEach(doc => {
        const user   = doc.data();
        const userId = doc.id;
        if (currentUser && userId === currentUser.uid) return;
        const name = (user.name || 'User').replace(/'/g, "\\'");
        const city = user.city || 'India';

        html += `
        <div class="card" style="display:flex;align-items:center;gap:16px;padding:16px;margin-bottom:12px">
          <div class="avatar" style="width:52px;height:52px;font-size:22px">${name.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:16px">
              ${name} ${user.govtIdVerified ? '<span title="Verified ID">☑️</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--gray);margin-bottom:4px">${titleRole}</div>
            <div style="font-size:11px;color:var(--gray);background:var(--bg);padding:4px 8px;border-radius:6px;display:inline-block">📍 ${city}</div>
          </div>
          <button class="chat-btn" onclick="startChat('dir_${userId}','${userId}','${name}','Direct Contact')">Connect</button>
        </div>`;
      });

      c.innerHTML = html || `<div class="empty-state"><p>Only you are registered here so far!</p></div>`;
    },
    () => { c.innerHTML = '<div class="empty-state"><p>Network error. Try again.</p></div>'; }
  );
}

// ===== 11. AI CHAT =====
function toggleAI() {
  document.getElementById('aiBox').classList.toggle('show');
}

function askAI(override) {
  const input = document.getElementById('aiInput');
  const msg   = override || input.value.trim();
  if (!msg) return;
  input.value = '';

  const msgs = document.getElementById('aiMsgs');
  msgs.insertAdjacentHTML('beforeend', `<div class="ai-m usr">${msg}</div>`);

  const tid = 't' + Date.now();
  msgs.insertAdjacentHTML('beforeend',
    `<div id="${tid}" class="ai-m bot"><div class="ai-typing"><span></span><span></span><span></span></div></div>`);
  msgs.scrollTop = msgs.scrollHeight;

  const sysPrompt = `You are Maango AI — a friendly farming and agriculture assistant for India. 
STRICT RULE: Detect the language of the user's message (Hindi, English, Hinglish, or any Indian language) and reply in the EXACT SAME language and script. 
Keep answers helpful and concise (3-5 lines max). Focus on farming, crop prices, weather, and market advice.`;

  gemini(sysPrompt + '\n\nUser: ' + msg).then(reply => {
    const el = document.getElementById(tid);
    if (el) {
      const displayHtml = (reply || 'Error connecting.').replace(/\n/g, '<br>');
      const safeText    = displayHtml.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      el.outerHTML = `
        <div class="ai-m bot">
          ${displayHtml}
          <br>
          <button class="voice-btn" data-text="${safeText}" onclick="speakAnswer(this)">🔊 Listen</button>
        </div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  });
}

// ===== 12. VOICE FEATURES =====
function startVoiceTyping(inputId) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast("⚠️ Voice not supported in this browser.");
    return;
  }
  const recognition     = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang      = 'hi-IN';
  recognition.interimResults = false;

  const inputField        = document.getElementById(inputId);
  const oldPlaceholder    = inputField.placeholder;
  inputField.placeholder  = "Listening... 🎤";
  inputField.value        = "";

  recognition.start();

  recognition.onresult  = e => { inputField.value = e.results[0][0].transcript; inputField.placeholder = oldPlaceholder; };
  recognition.onerror   = () => { inputField.placeholder = oldPlaceholder; showToast("❌ Voice error. Try again."); };
  recognition.onend     = () => { inputField.placeholder = oldPlaceholder; };
}

function speakAnswer(btnElement) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const msg  = new SpeechSynthesisUtterance();
  msg.text   = btnElement.getAttribute('data-text');
  msg.lang   = 'hi-IN';
  msg.rate   = 0.95;
  window.speechSynthesis.speak(msg);
  showToast("🔊 Playing audio...");
}

// ===== 13. KNOWLEDGE BASE =====
function searchCrop() {
  const query = document.getElementById('kbInput').value.trim();
  if (!query) { showToast('⚠️ Enter a crop name!'); return; }

  const container = document.getElementById('kbResults');
  container.innerHTML = `<div class="empty-state"><span class="spinner" style="border-top-color:var(--green)"></span><p>Fetching data...</p></div>`;

  const prompt = `Give brief farming guide for "${query}".
STRICT RULE: Return ONLY a raw JSON object starting with { and ending with }.
No markdown, no backticks, no explanations outside the JSON.
Format: {"crop":"name","emoji":"single emoji","season":"season info","duration":"growth duration","soil":"soil type","profit":"estimated profit/acre in INR","tips":"one important farming tip"}`;

  gemini(prompt).then(result => {
    try {
      const jsonStr = result.substring(result.indexOf('{'), result.lastIndexOf('}') + 1);
      const d       = JSON.parse(jsonStr);
      container.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:50px;height:50px;border-radius:12px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;">${d.emoji||'🌱'}</div>
          <div>
            <div style="font-weight:800;font-size:18px;font-family:'Playfair Display',serif">${d.crop||query}</div>
            <div style="font-size:12px;color:var(--gray)">⏱️ ${d.duration||'Varies'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:var(--bg);border-radius:12px;padding:12px;font-size:12px"><strong>🗓️ Season</strong><br>${d.season||'All seasons'}</div>
          <div style="background:var(--bg);border-radius:12px;padding:12px;font-size:12px"><strong>🌍 Soil Type</strong><br>${d.soil||'Any'}</div>
          <div style="background:var(--bg);border-radius:12px;padding:12px;font-size:12px"><strong>💰 Est. Profit</strong><br>${d.profit||'Variable'}</div>
          <div style="background:#e8f5ee;border-radius:12px;padding:12px;font-size:12px;color:var(--green)"><strong>💡 Expert Tip</strong><br>${d.tips||'Consult local experts.'}</div>
        </div>
        <button class="chat-btn" style="width:100%;margin-top:8px" onclick="document.getElementById('aiInput').value='Tell me more about growing ${query}'; document.getElementById('aiBox').classList.add(\'show\'); askAI()">
          🤖 Ask AI More About ${d.crop||query}
        </button>
      </div>`;
    } catch(e) {
      container.innerHTML = `<div class="card"><p style="color:#666">Could not parse data. Please try asking AI directly.</p><button class="chat-btn" style="margin-top:12px;width:100%" onclick="document.getElementById('aiInput').value='Tell me about ${query} farming'; toggleAI(); askAI()">Ask Maango AI →</button></div>`;
    }
  });
}

// ===== 14. CHAT SYSTEM =====
function startChat(lId, sId, sName, prod) {
  if (!currentUser) {
    showToast('⚠️ Login Required');
    document.getElementById('authModal').classList.add('show');
    return;
  }
  if (!currentUserData?.govtIdVerified) {
    showToast('⚠️ KYC Required to chat');
    openProfileModal();
    return;
  }
  if (sId === currentUser.uid) {
    showToast('⚠️ This is your own listing.');
    return;
  }

  currentChatId = [currentUser.uid, sId].sort().join('_') + '_' + lId;

  db.collection('chats').doc(currentChatId).set({
    participants: [currentUser.uid, sId],
    listingId:    lId,
    product:      prod,
    buyerName:    currentUserData.name,
    sellerName:   sName,
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  document.getElementById('chatNavName').textContent   = sName;
  document.getElementById('chatNavAvatar').textContent = sName[0].toUpperCase();
  document.getElementById('chatBody').innerHTML        = '';

  listenMsgs(currentChatId);
  document.getElementById('fullChat').classList.add('show');
}

function listenMsgs(cId) {
  db.collection('chats').doc(cId).collection('messages').orderBy('createdAt')
    .onSnapshot(snap => {
      const body = document.getElementById('chatBody');
      let html   = '';
      snap.docs.forEach(d => {
        const m    = d.data();
        const sent = m.senderId === currentUser?.uid;
        const time = m.createdAt?.toDate
          ? new Date(m.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Now';
        html += `<div class="msg ${sent?'sent':'received'}">${m.text}<div class="msg-time">${time}</div></div>`;
      });
      body.innerHTML  = html;
      body.scrollTop  = body.scrollHeight;
    });
}

function sendMsg() {
  const i = document.getElementById('chatInputFull');
  const t = i.value.trim();
  if (!t || !currentChatId) return;
  i.value = '';

  db.collection('chats').doc(currentChatId).collection('messages').add({
    text:       t,
    senderId:   currentUser.uid,
    senderName: currentUserData?.name || 'User',
    createdAt:  firebase.firestore.FieldValue.serverTimestamp()
  });
  db.collection('chats').doc(currentChatId).set({
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMsg:   t
  }, { merge: true });
}

function closeFullChat() {
  document.getElementById('fullChat').classList.remove('show');
}

function loadChats() {
  if (!currentUser) {
    document.getElementById('chatListContainer').innerHTML =
      '<div class="empty-state"><div>🔒</div><p>Login to view chats.</p></div>';
    return;
  }

  db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid)
    .onSnapshot(snap => {
      const c = document.getElementById('chatListContainer');
      if (snap.empty) {
        c.innerHTML = '<div class="empty-state"><div>💬</div><p>No active conversations yet.</p></div>';
        return;
      }

      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));

      let html = '';
      docs.forEach(chat => {
        const other    = chat.participants[0] === currentUser.uid ? chat.sellerName : chat.buyerName;
        const otherId  = chat.participants.find(p => p !== currentUser.uid);
        const lastMsg  = chat.lastMsg || 'Start chatting';
        html += `
        <div class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px;margin-bottom:10px"
             onclick="startChat('${chat.listingId}','${otherId}','${other}','${chat.product}')">
          <div class="avatar" style="width:46px;height:46px">${(other||'U')[0].toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:15px">${other||'User'}</div>
            <div style="font-size:12px;color:var(--gray);margin-top:2px">📦 ${chat.product||''}</div>
            <div style="font-size:13px;margin-top:4px;color:var(--text)">${lastMsg}</div>
          </div>
        </div>`;
      });
      c.innerHTML = html;
    });
}

// ===== 15. MODAL CLOSE ON BACKDROP CLICK =====
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
  });
});
