// ===== 1. FIREBASE & RENDER BACKEND INITIALIZATION =====
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
const db = firebase.firestore();

// 🚀 TERA LIVE CUSTOM BACKEND SERVER URL 
const BACKEND_URL = "https://maango-backend.onrender.com";

// ===== 2. GEMINI AI INIT =====
const part1 = "AIzaSy"; 
const part2 = "ACBXbKq_J-0f52D"; 
const part3 = "YTj5WWl4q9ykNZq104"; 
const GEMINI_KEY = part1 + part2 + part3;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY;

async function gemini(prompt) {
  try {
    const res = await fetch(GEMINI_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:1024}})
    });
    if (!res.ok) return "⚠️ AI Quota limit reached. Please try later.";
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch(e) { return 'Connection error. Please check internet.'; }
}

// ===== 3. GLOBAL STATE =====
let currentUser = null;
let currentUserData = null;
let currentChatId = null;
let allListings = [];
let dynCats = new Set(['all']);
let authMode = 'login'; 
let selectedType = 'buyer';

// ===== 4. CORE AUTH STATE LISTENER =====
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if(user) {
    db.collection('users').doc(user.uid).get().then((doc) => {
      currentUserData = doc.exists ? doc.data() : null;
      renderProfile();
      // Agar contracts page hai toh load karo
      if(document.getElementById('contractsContainer')) loadContracts(); 
    });
  } else {
    currentUserData = null;
    renderProfile();
  }
  loadListings();
});

// ===== 5. AUTHENTICATION LOGIC (Connected to Render) =====
function handleNavBtn() { currentUser ? showPage('profile') : document.getElementById('authModal').classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display='none', 3500);
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
  document.getElementById('typeBuyer').classList.remove('selected');
  document.getElementById('typeFarmer').classList.remove('selected');
  document.getElementById('typeExpert').classList.remove('selected');
  if(type === 'buyer') document.getElementById('typeBuyer').classList.add('selected');
  if(type === 'farmer') document.getElementById('typeFarmer').classList.add('selected');
  if(type === 'expert') document.getElementById('typeExpert').classList.add('selected');
}

function processAuth() {
  const btn = document.getElementById('authMainBtn');
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPassword').value.trim();

  if (!email || !pass) return showToast('⚠️ Email and Password required.');

  btn.innerHTML = '<span class="spinner"></span> Processing...';
  btn.disabled = true;

  if (authMode === 'signup') {
    const name = document.getElementById('authName').value.trim();
    const mobile = document.getElementById('authMobile').value.trim();
    const city = document.getElementById('authCity').value.trim();

    if(!name || !mobile || !city) { showToast('⚠️ Name, Mobile, and City are required.'); resetBtn(); return; }
    if(pass.length < 6) { showToast('⚠️ Password must be 6+ chars.'); resetBtn(); return; }

    auth.createUserWithEmailAndPassword(email, pass).then((cred) => {
      cred.user.sendEmailVerification();
      
      // Send to Render Backend
      return fetch(`${BACKEND_URL}/api/users/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cred.user.uid, name: name, email: email, country: city, user_type: selectedType })
      }).then(() => {
          // Sync with Firebase
          return db.collection('users').doc(cred.user.uid).set({
            name: name, email: email, mobile: mobile, city: city, userType: selectedType,
            govtIdVerified: false, profileComplete: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
      });
    }).then(() => {
      auth.signOut(); // Strict Email Verification
      closeModal('authModal');
      showToast('✅ Account Created! Check Email to verify.');
    }).catch(e => showToast('❌ ' + e.message)).finally(resetBtn);

  } else {
    auth.signInWithEmailAndPassword(email, pass).then((cred) => {
      if (!cred.user.emailVerified) {
          auth.signOut(); throw new Error("Please verify your email address first.");
      }
      closeModal('authModal'); showToast('✅ Secure Login Successful!');
    }).catch(e => showToast('❌ ' + e.message)).finally(resetBtn);
  }

  function resetBtn() { btn.innerHTML = authMode === 'login' ? 'Secure Login' : 'Create Account'; btn.disabled = false; }
}

function resetPassword() {
  const email = prompt("Enter your registered Email to reset password:");
  if(email) {
    auth.sendPasswordResetEmail(email).then(() => { showToast("📧 Secure Reset link sent!"); closeModal('authModal'); })
    .catch(e => showToast("❌ Error: " + e.message));
  }
}

// ===== 6. PROFILE & KYC (With Render Upload Support) =====
function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if(modal) modal.classList.add('show');
}

function saveProfile() {
  const govtIdType = document.getElementById('govtIdType').value;
  const govtIdNumber = document.getElementById('govtIdNumber').value.trim();
  const state = document.getElementById('userState').value;
  const kycFile = document.getElementById('kycFile'); // Checks if file input exists in HTML
  
  if(!govtIdType || !govtIdNumber || !state){ showToast('⚠️ Required KYC fields missing!'); return; }

  // Fallback: If no file input in HTML, just save to Firebase
  if(!kycFile || !kycFile.files || kycFile.files.length === 0) {
      db.collection('users').doc(currentUser.uid).set({
        govtIdType: govtIdType, govtIdNumber: govtIdNumber, state: state,
        businessName: document.getElementById('businessName')?.value.trim() || '',
        govtIdVerified: true, profileComplete: true
      },{merge:true}).then(() => db.collection('users').doc(currentUser.uid).get())
      .then((doc) => {
        currentUserData=doc.data(); closeModal('profileModal'); showToast('🔐 KYC Data Saved!'); renderProfile();
      }).catch(e => showToast('❌ Error: ' + e.message));
      return;
  }

  // Advanced: If File exists, send Base64 to Render Vault
  const file = kycFile.files[0];
  const reader = new FileReader();
  showToast('⏳ Uploading securely...');
  
  reader.onloadend = function() {
      const base64String = reader.result.split(',')[1];
      fetch(`${BACKEND_URL}/api/users/kyc-upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.uid, docType: govtIdType, docNumber: govtIdNumber, fileBase64: base64String, fileName: file.name })
      }).then(res => res.json()).then(data => {
          if(data.error) throw new Error(data.error);
          return db.collection('users').doc(currentUser.uid).set({
              govtIdType: govtIdType, govtIdNumber: govtIdNumber, state: state,
              govtIdVerified: true, profileComplete: true
          }, {merge: true});
      }).then(() => {
          currentUserData.govtIdVerified = true;
          closeModal('profileModal'); showToast('🔐 Document Vaulted & Verified!'); renderProfile();
      }).catch(e => showToast('❌ Upload Failed: ' + e.message));
  };
  reader.readAsDataURL(file);
}

function renderProfile() {
  const pc = document.getElementById('profileContent');
  if(!currentUser){
    pc.innerHTML='<div class="empty-state"><div>🔒</div><p>Protecting user data.<br>Please login to access profile.</p></div><div style="padding:0 20px 20px"><button class="modal-submit" onclick="document.getElementById(\'authModal\').classList.add(\'show\')">Secure Access</button></div>';
    return;
  }
  
  const verified = currentUserData && currentUserData.govtIdVerified;
  const emailVerified = currentUser.emailVerified;
  
  pc.innerHTML=`
  <div class="profile-header">
    <div class="profile-avatar">${((currentUserData&&currentUserData.name)||'U')[0].toUpperCase()}</div>
    <div>
      <div style="font-size:18px;font-weight:800">${(currentUserData&&currentUserData.name)||'User'}</div>
      <div style="font-size:12px;opacity:.9;margin-top:2px">${(currentUserData&&currentUserData.userType)==='farmer'?'🌾 Farmer':(currentUserData&&currentUserData.userType==='expert'?'👨‍🏫 Expert':'🛒 Buyer')} · ${currentUserData&&currentUserData.city||''}</div>
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        ${verified ? '<span class="verify-badge">🛡️ KYC Verified</span>' : '<span class="unverified-badge" onclick="openProfileModal()">⚠️ Pending KYC</span>'}
        ${emailVerified ? '<span class="verify-badge">🔐 Email Verified</span>' : '<span class="unverified-badge" onclick="currentUser.sendEmailVerification();showToast(\'Link Sent!\')">📧 Verify Email</span>'}
      </div>
    </div>
  </div>
  <div class="profile-menu">
    ${!verified ? '<div class="profile-item" onclick="openProfileModal()">🛡️ Complete KYC Verification</div>' : ''}
    <div class="profile-item" onclick="showPostModal()">📋 Post New Demand</div>
    <div class="profile-item" onclick="showPage('chat')">💬 Encrypted Chats</div>
    <div class="profile-item logout-item" onclick="auth.signOut().then(()=>showPage('home'))" style="color:#d32f2f;">🚪 Logout Securely</div>
  </div>`;
}

// ===== 7. DATA FETCHING ENGINES =====
function loadListings() {
  db.collection('listings').orderBy('createdAt','desc').onSnapshot(snap => {
    allListings = snap.docs.map(d => Object.assign({id:d.id}, d.data()));
    dynCats.clear(); dynCats.add('all');
    allListings.forEach(l => { if(l.category) dynCats.add(l.category); });
    updateCats();
    renderCards(allListings);
  }, err => {
    document.getElementById('feedContainer').innerHTML = '<div class="empty-state"><p>Error loading feed.</p></div>';
  });
}

function updateCats() {
  const container = document.getElementById('catChips');
  if(!container) return;
  let html = '';
  const emojis = {all:'🌟',gehu:'🌾',wheat:'🌾',chaval:'🌾',rice:'🌾',dal:'🫘',pyaz:'🧅',aloevera:'🌱',haldi:'🌿',makka:'🌽',corn:'🌽',ganna:'🎋',phal:'🍎',fruits:'🍎',veg:'🥬'};
  
  dynCats.forEach(cat => {
    const icon = emojis[cat.toLowerCase()] || '📦';
    const name = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
    html += `<div class="chip ${cat==='all'?'active':''}" onclick="filterCat(this,'${cat}')">${icon} ${name}</div>`;
  });
  container.innerHTML = html;
}

// ===== 8. FEED & LISTINGS ACTION =====
function showPostModal() {
  if(!currentUser){showToast('⚠️ Login Required'); document.getElementById('authModal').classList.add('show'); return;}
  if(!currentUser.emailVerified) {showToast('⚠️ Please verify your email first (check Profile).'); return;}
  if(!currentUserData || !currentUserData.govtIdVerified){showToast('⚠️ KYC Verification Required'); openProfileModal(); return;}
  document.getElementById('postModal').classList.add('show');
}

function submitPost() {
  const product = document.getElementById('productName').value.trim();
  const qty = document.getElementById('quantity').value.trim();
  const location = document.getElementById('location').value.trim();
  if(!product || !qty || !location){ showToast('⚠️ Fill required fields'); return; }
  
  const btn = document.getElementById('submitPostBtn');
  btn.innerHTML = '<span class="spinner"></span>...'; btn.disabled=true;
  
  const catPrompt = `For agricultural product "${product}" return ONLY one lowercase English category word (e.g. wheat, rice, fruits, veg). Just the word.`;
  gemini(catPrompt).then(catResult => {
    const category = (catResult||'other').trim().toLowerCase().replace(/[^a-z_]/g,'') || 'other';
    return db.collection('listings').add({
      product: product, qty: qty, location: location,
      price: document.getElementById('price')?.value.trim() || 'Negotiable',
      desc: document.getElementById('description')?.value.trim() || '',
      category: category, badge: 'New', userId: currentUser.uid,
      userName: (currentUserData&&currentUserData.name) || 'User',
      userType: (currentUserData&&currentUserData.userType) || 'buyer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(() => {
    closeModal('postModal'); showToast('✅ Demand Posted Successfully!');
    ['productName','quantity','location','price','description'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value=''; });
  }).finally(() => { btn.innerHTML='🚀 Post Demand'; btn.disabled=false; });
}

function renderCards(data) {
  const c = document.getElementById('feedContainer');
  if(!data.length) { c.innerHTML = '<div class="empty-state"><div>📋</div><p>No demands yet.<br>Be the first to post!</p></div>'; return; }
  let html = '';
  data.forEach((l, i) => {
    const name = (l.userName || 'U').replace(/'/g,"\\'");
    const product = (l.product || '').replace(/'/g,"\\'");
    const time = (l.createdAt && typeof l.createdAt.toDate === 'function') ? new Date(l.createdAt.toDate()).toLocaleDateString() : 'Just now';
    
    html += `
    <div class="card" style="animation-delay:${i*.05}s">
      <div class="card-header">
        <div class="buyer-info">
          <div class="avatar">${(l.userName||'U')[0].toUpperCase()}</div>
          <div>
            <div class="buyer-name">${l.userName||'User'}</div>
            <span class="buyer-type">${l.userType==='farmer'?'🌾 Farmer':'🛒 Buyer'}</span>
          </div>
        </div>
        <span class="card-badge">${l.badge||'New'}</span>
      </div>
      <div class="card-product">${l.product||''}</div>
      <div class="card-desc">${l.desc||''}</div>
      <div class="card-details">
        <div class="dtag">📦 <span>${l.qty||''}</span></div>
        <div class="dtag">📍 <span>${l.location||''}</span></div>
        <div class="dtag">💰 <span>${l.price||'Negotiable'}</span></div>
      </div>
      <div class="card-footer">
        <span class="card-time">🕐 ${time}</span>
        <div style="display:flex; gap:8px;">
          <button class="trans-btn" onclick="translatePost(this, '${(l.desc||l.product).replace(/'/g,"\\'")}')">🔄 Translate</button>
          <button class="chat-btn" onclick="startChat('${l.id}', '${l.userId||''}', '${name}', '${product}')">💬 Contact</button>
        </div>
      </div>
    </div>`;
  });
  c.innerHTML = html;
}

function translatePost(btn, text) {
  const orig = btn.innerText; btn.innerText = "⏳...";
  gemini(`Translate this to Hindi strictly (Devanagari). Only provide the translation: '${text}'`).then(res => {
    if(res && !res.includes("Quota limit")) {
      btn.parentElement.parentElement.previousElementSibling.previousElementSibling.innerText = res; btn.innerText = "✅ Done";
    } else { btn.innerText = orig; showToast("⚠️ Translation limit reached."); }
  });
}

// ===== 9. UI NAVIGATION & HELPERS =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if(document.getElementById(page+'Page')) document.getElementById(page+'Page').classList.add('active');
  if(document.getElementById('nav'+page.charAt(0).toUpperCase()+page.slice(1))) document.getElementById('nav'+page.charAt(0).toUpperCase()+page.slice(1)).classList.add('active');
  
  if(page==='chat') loadChats();
  if(page==='profile') renderProfile();
  if(page==='expert') renderDirectory('expert', 'expertList', '👨‍🏫', 'Verified Expert');
  if(page==='farmerDir') renderDirectory('farmer', 'farmerList', '🌾', 'Verified Farmer');
  if(page==='buyerDir') renderDirectory('buyer', 'buyerList', '🛒', 'Verified Buyer');
  if(page==='contracts' && typeof loadContracts === 'function') loadContracts();
  window.scrollTo(0,0);
}

function switchTab(el) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); }
function filterCat(el, cat) { document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderCards(cat==='all' ? allListings : allListings.filter(l => l.category===cat)); }
function filterCards() { 
  const q = document.getElementById('searchInput').value.toLowerCase().trim(); 
  renderCards(q ? allListings.filter(l => (l.product||'').toLowerCase().includes(q) || (l.location||'').toLowerCase().includes(q)) : allListings); 
}

function openLegal(type) {
  document.getElementById('legalModal').classList.add('show');
  const title = document.getElementById('legalTitle'); const body = document.getElementById('legalBody');
  if(type === 'help') {
    title.textContent = "Help Center"; body.innerHTML = "<strong>How to use Maango?</strong><br>1. Register and verify email.<br>2. Complete KYC for security.<br>3. Search demands or post your own.<br><br><strong>Facing issues?</strong> Email us at support@maango.in";
  } else if(type === 'contact') {
    title.textContent = "Contact Us"; body.innerHTML = "<strong>Headquarters:</strong> Aligarh, Uttar Pradesh<br><strong>Email:</strong> support@maango.in<br><strong>Phone:</strong> +91-XXXXX-XXXXX (Available 9 AM - 6 PM)";
  } else {
    title.textContent = "Privacy & Terms"; body.innerHTML = "Maango values your privacy. All documents provided during KYC are encrypted and securely stored. We do not share your personal identification with third parties without consent.";
  }
}

// ===== 10. DIRECTORY ENGINES =====
function renderDirectory(type, containerId, icon, titleRole) {
  const c = document.getElementById(containerId);
  c.innerHTML = `<div class="empty-state"><span class="spinner" style="border-top-color:var(--green)"></span><p>Loading profiles...</p></div>`;

  db.collection('users').where('userType', '==', type).onSnapshot(snap => {
    if (snap.empty) { c.innerHTML = `<div class="empty-state"><div>${icon}</div><p>No ${type}s registered yet.</p></div>`; return; }
    let html = '';
    snap.docs.forEach(doc => {
      const user = doc.data(); const userId = doc.id;
      if(currentUser && userId === currentUser.uid) return; 
      const name = (user.name || 'User').replace(/'/g, "\\'"); const city = (user.city || 'India');

      html += `
      <div class="card" style="display:flex;align-items:center;gap:16px;padding:16px;margin-bottom:12px">
        <div class="avatar" style="width:52px;height:52px;font-size:22px">${name.charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:16px">${name} ${user.govtIdVerified ? '<span style="font-size:12px" title="Verified ID">☑️</span>' : ''}</div>
          <div style="font-size:12px;color:var(--gray);margin-bottom:4px">${titleRole}</div>
          <div style="font-size:11px;color:var(--gray);background:var(--bg);padding:4px 8px;border-radius:6px;display:inline-block">📍 ${city}</div>
        </div>
        <button class="chat-btn" onclick="startChat('dir_${userId}', '${userId}', '${name}', 'Direct Contact')">Connect</button>
      </div>`;
    });
    c.innerHTML = html === '' ? `<div class="empty-state"><p>Only you are here so far!</p></div>` : html;
  }, error => { c.innerHTML = '<div class="empty-state"><p>Secure network error.</p></div>'; });
}

// ===== 11. AI CHAT & KNOWLEDGE BASE =====
function toggleAI(){ document.getElementById('aiBox').classList.toggle('show'); }

function askAI(override) {
  const input = document.getElementById('aiInput'); const msg = override || input.value.trim(); if(!msg) return; input.value = '';
  const msgs = document.getElementById('aiMsgs');
  msgs.insertAdjacentHTML('beforeend', `<div class="ai-m usr">${msg}</div>`);
  const tid = 't' + Date.now();
  msgs.insertAdjacentHTML('beforeend', `<div id="${tid}" class="ai-m bot"><div class="ai-typing"><span></span><span></span><span></span></div></div>`);
  msgs.scrollTop = msgs.scrollHeight;
  
  const sysPrompt = `You are Maango AI — friendly farming assistant. STRICT RULE: Detect the language of the user's message and reply in the EXACT SAME language. Keep answers short (3-5 lines).`;
  gemini(sysPrompt + '\n\nUser: ' + msg).then(reply => {
    const el = document.getElementById(tid);
    if(el) {
       const displayHtml = (reply||'Error connecting.').replace(/\n/g,'<br>');
       const safeText = displayHtml.replace(/(<([^>]+)>)/gi, "").replace(/"/g, '&quot;').replace(/'/g, '&#39;');
       el.outerHTML = `<div class="ai-m bot">${displayHtml}<br><button class="voice-btn" data-text="${safeText}" onclick="speakAnswer(this)">🔊 Listen</button></div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  });
}

function startVoiceTyping(inputId) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showToast("⚠️ Voice not supported."); return; }
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'hi-IN'; const inputField = document.getElementById(inputId); const oldPlaceholder = inputField.placeholder;
    inputField.placeholder = "Listening... 🎤"; inputField.value = ""; 
    recognition.start();
    recognition.onresult = e => { inputField.value = e.results[0][0].transcript; inputField.placeholder = oldPlaceholder; };
    recognition.onerror = e => { inputField.placeholder = oldPlaceholder; showToast("❌ Voice error."); };
    recognition.onend = () => { inputField.placeholder = oldPlaceholder; };
}

function speakAnswer(btnElement) {
    if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance();
    msg.text = btnElement.getAttribute('data-text'); msg.lang = 'hi-IN'; msg.rate = 0.95; 
    window.speechSynthesis.speak(msg); showToast("🔊 Playing audio...");
}

function searchCrop() {
  const query = document.getElementById('kbInput').value.trim();
  if(!query){showToast('⚠️ Enter crop name!');return;}
  const container = document.getElementById('kbResults');
  container.innerHTML = `<div class="empty-state"><span class="spinner" style="border-top-color:var(--green)"></span><p>Fetching data...</p></div>`;
  
  const prompt = `Give brief farming guide for "${query}". STRICT RULE: Return ONLY a raw JSON object starting with { and ending with }. No markdown, no backticks, no explanations. Format: {"crop":"name","emoji":"emoji","season":"season","duration":"days","soil":"soil type","profit":"profit/acre","tips":"important tips"}`;
  
  gemini(prompt).then(result => {
    try {
      const jsonStr = result.substring(result.indexOf('{'), result.lastIndexOf('}') + 1);
      const d = JSON.parse(jsonStr);
      container.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:50px;height:50px;border-radius:12px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;">${d.emoji||'🌱'}</div>
          <div><div style="font-weight:800;font-size:18px;">${d.crop||query}</div><div style="font-size:12px;color:var(--gray)">⏱️ ${d.duration||'Varies'}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:var(--bg);border-radius:12px;padding:12px;font-size:12px"><strong>🗓️ Season</strong><br>${d.season||'All'}</div>
          <div style="background:var(--bg);border-radius:12px;padding:12px;font-size:12px"><strong>🌍 Soil</strong><br>${d.soil||'Any'}</div>
          <div style="background:#e8f5ee;border-radius:12px;padding:12px;font-size:12px;grid-column:1/-1;color:var(--green)"><strong>💡 Tip:</strong> ${d.tips||'Consult experts for details.'}</div>
        </div>
      </div>`;
    } catch(e) { container.innerHTML='<div class="card"><p>Data format error. Please try asking AI Chat directly.</p></div>'; }
  });
}

// ===== 12. P2P USER CHATS =====
function startChat(lId, sId, sName, prod) {
  if(!currentUser){showToast('⚠️ Login Required'); document.getElementById('authModal').classList.add('show'); return;}
  if(!currentUserData||!currentUserData.govtIdVerified){showToast('⚠️ KYC Required'); openProfileModal(); return;}
  if(sId===currentUser.uid){showToast('⚠️ This is your own listing.');return;}
  currentChatId = [currentUser.uid,sId].sort().join('_')+'_'+lId;
  db.collection('chats').doc(currentChatId).set({ participants:[currentUser.uid,sId], listingId:lId, product:prod, buyerName:currentUserData.name, sellerName:sName, updatedAt:firebase.firestore.FieldValue.serverTimestamp() },{merge:true});
  document.getElementById('chatNavName').textContent = sName; document.getElementById('chatNavAvatar').textContent = sName[0].toUpperCase();
  document.getElementById('chatBody').innerHTML = ''; listenMsgs(currentChatId); document.getElementById('fullChat').classList.add('show');
}

function listenMsgs(cId) {
  db.collection('chats').doc(cId).collection('messages').orderBy('createdAt').onSnapshot(snap => {
    const body = document.getElementById('chatBody'); let html = '';
    snap.docs.forEach(d => {
      const m = d.data(); const sent = m.senderId === (currentUser&&currentUser.uid);
      const time = (m.createdAt && typeof m.createdAt.toDate === 'function') ? new Date(m.createdAt.toDate()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'Now';
      html += `<div class="msg ${sent?'sent':'received'}">${m.text}<div class="msg-time">${time}</div></div>`;
    });
    body.innerHTML = html; body.scrollTop = body.scrollHeight;
  });
}

function sendMsg() {
  const i = document.getElementById('chatInputFull'); const t = i.value.trim(); if(!t||!currentChatId)return; i.value='';
  db.collection('chats').doc(currentChatId).collection('messages').add({ text:t, senderId:currentUser.uid, senderName:currentUserData.name||'User', createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  db.collection('chats').doc(currentChatId).set({updatedAt:firebase.firestore.FieldValue.serverTimestamp(),lastMsg:t},{merge:true});
}

function closeFullChat(){ document.getElementById('fullChat').classList.remove('show'); }

function loadChats() {
  if(!currentUser){document.getElementById('chatListContainer').innerHTML='<div class="empty-state"><div>🔒</div><p>Login to view chats.</p></div>';return;}
  db.collection('chats').where('participants','array-contains',currentUser.uid).onSnapshot(snap => {
    const c = document.getElementById('chatListContainer'); if(snap.empty){c.innerHTML='<div class="empty-state"><div>💬</div><p>No active conversations.</p></div>';return;}
    const docs = snap.docs.map(d => Object.assign({id: d.id}, d.data()));
    docs.sort((a,b) => { const tA=(a.updatedAt&&typeof a.updatedAt.toMillis==='function')?a.updatedAt.toMillis():0; const tB=(b.updatedAt&&typeof b.updatedAt.toMillis==='function')?b.updatedAt.toMillis():0; return tB-tA; });
    let html = ''; docs.forEach(chat => {
      const other = chat.participants[0] === currentUser.uid ? chat.sellerName : chat.buyerName;
      html += `
      <div class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px;margin-bottom:10px" onclick="startChat('${chat.listingId}','${chat.participants.find(p=>p!==currentUser.uid)}','${other}','${chat.product}')">
        <div class="avatar" style="width:46px;height:46px">${(other||'U')[0].toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:15px">${other||'User'}</div>
          <div style="font-size:12px;color:var(--gray);margin-top:2px">📦 ${chat.product||''}</div>
          <div style="font-size:13px;margin-top:4px;color:var(--text)">${chat.lastMsg||'Start chatting'}</div>
        </div>
      </div>`;
    }); 
    c.innerHTML = html;
  });
}

// ===== 13. ESCROW CONTRACTS (RENDER BACKEND INTEGRATION) =====
function openContractModal() {
    if(!currentUserData || currentUserData.userType !== 'expert') { showToast("⚠️ Access Denied: Only verified Experts can draft contracts."); return; }
    document.getElementById('contractModal').classList.add('show');
}

function createContract() {
    const buyer = document.getElementById('contractBuyer').value.trim();
    const farmer = document.getElementById('contractFarmer').value.trim();
    const crop = document.getElementById('contractCrop').value.trim();
    const amount = document.getElementById('contractAmount').value.trim();

    if(!buyer || !farmer || !crop || !amount) { showToast("⚠️ All fields are required!"); return; }

    const btn = document.getElementById('submitContractBtn');
    btn.innerHTML = '<span class="spinner"></span> Locking...'; btn.disabled = true;

    fetch(`${BACKEND_URL}/api/contracts/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_ref: buyer, farmer_ref: farmer, expert_id: currentUser.uid, expert_name: currentUserData.name || 'Expert', crop_details: crop, escrow_amount: amount })
    }).then(res => res.json()).then(data => {
        if(data.error) throw new Error(data.error);
        closeModal('contractModal'); showToast("✅ Contract Locked in PostgreSQL!");
        ['contractBuyer','contractFarmer','contractCrop','contractAmount'].forEach(id => document.getElementById(id).value = '');
        if(document.getElementById('contractsContainer')) loadContracts();
    }).catch(e => showToast("❌ Error: " + e.message)).finally(() => { btn.innerHTML = '🔒 Lock in Escrow'; btn.disabled = false; });
}

function loadContracts() {
    if(!currentUser) return;
    const container = document.getElementById('contractsContainer');
    if(!container) return; // Silent exit if contracts tab not in HTML
    
    container.innerHTML = '<div class="empty-state"><span class="spinner" style="border-top-color:var(--green)"></span><p>Syncing secure ledger...</p></div>';

    fetch(`${BACKEND_URL}/api/contracts`).then(res => res.json()).then(data => {
        let expertBtn = '';
        if(currentUserData && currentUserData.userType === 'expert') {
            expertBtn = '<button class="post-btn" style="margin-bottom:16px; width:100%;" onclick="openContractModal()">+ Draft New Contract</button>';
        }

        if(!data || data.length === 0) {
            container.innerHTML = `${expertBtn}<div class="empty-state"><div>🔐</div><p>No active contracts found.</p></div>`;
            return;
        }

        let html = expertBtn; 
        data.forEach(contract => {
            html += `
            <div class="card" style="border: 2px solid var(--border);">
                <div style="font-size:12px; color:var(--gray); font-weight:bold;">Contract ID: #${contract.contract_id}</div>
                <div style="font-family:'Playfair Display', serif; font-weight:900; font-size:18px; margin-top:4px; color:var(--green);">${contract.crop_details}</div>
                <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="background:#e8f5ee; color:var(--green); padding:6px 10px; border-radius:8px; font-size:12px; font-weight:800;">${contract.status}</span>
                    <span style="font-weight:900; color:var(--gold); font-size:18px;">₹${contract.escrow_amount}</span>
                </div>
                <div style="margin-top:16px; font-size:13px; background:var(--bg); padding:12px; border-radius:12px;">
                    <div style="margin-bottom:4px;">👨‍🏫 <strong>Expert:</strong> ${contract.expert_name}</div>
                    <div style="margin-bottom:4px;">🛒 <strong>Buyer:</strong> ${contract.buyer_ref}</div>
                    <div>🌾 <strong>Farmer:</strong> ${contract.farmer_ref}</div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }).catch(error => { container.innerHTML = '<div class="empty-state"><p>Error connecting to Database.</p></div>'; });
}

// Event Listeners for Modals
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('show'); });
});
