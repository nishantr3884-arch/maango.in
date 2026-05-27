// ===== 1. FIREBASE INITIALIZATION =====
const firebaseConfig = {
  apiKey: "AIzaSyAikQe8asrbdh7BWmPKLu9HDCNg1J9tqr4", // Warning: In production, hide this!
  authDomain: "maango-9c803.firebaseapp.com",
  projectId: "maango-9c803",
  storageBucket: "maango-9c803.firebasestorage.app",
  messagingSenderId: "524807951878",
  appId: "1:524807951878:web:1dcf661c2ef25231aed587"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== 2. GLOBAL STATE =====
let currentUser = null;
let currentUserData = null;
let authMode = 'login'; 
let selectedType = 'buyer'; // default

// ===== 3. CORE AUTH LISTENER =====
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if(user) {
    document.getElementById('navAuthBtn').textContent = "Profile";
    db.collection('users').doc(user.uid).get().then((doc) => {
      currentUserData = doc.exists ? doc.data() : null;
      loadContracts(); // Load escrow contracts if logged in
    });
  } else {
    document.getElementById('navAuthBtn').textContent = "👤 Login";
    currentUserData = null;
  }
});

// ===== 4. NAVIGATION LOGIC =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  if(document.getElementById(page+'Page')) {
      document.getElementById(page+'Page').classList.add('active');
  }
  
  const navId = 'nav' + page.charAt(0).toUpperCase() + page.slice(1);
  if(document.getElementById(navId)) {
      document.getElementById(navId).classList.add('active');
  }
}

function switchTab(el) { 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    el.classList.add('active'); 
}
function handleNavBtn() { 
    currentUser ? showPage('profile') : document.getElementById('authModal').classList.add('show'); 
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display='none', 3000);
}

// ===== 5. AUTHENTICATION LOGIC =====
function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupExtraFields').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('authMainBtn').textContent = mode === 'login' ? 'Secure Login' : 'Create Account';
}

function selectType(type) {
  selectedType = type;
  ['buyer', 'farmer', 'expert'].forEach(t => {
      document.getElementById('type' + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove('selected');
  });
  document.getElementById('type' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('selected');
}

function processAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPassword').value.trim();
  if (!email || !pass) return showToast('⚠️ Email and Password required.');

  if (authMode === 'signup') {
    const name = document.getElementById('authName').value.trim();
    const country = document.getElementById('authCountry').value.trim();
    
    auth.createUserWithEmailAndPassword(email, pass).then((cred) => {
      return db.collection('users').doc(cred.user.uid).set({
        name: name, email: email, country: country, userType: selectedType,
        govtIdVerified: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(() => {
      closeModal('authModal');
      showToast('✅ Account Created!');
    }).catch(e => showToast('❌ ' + e.message));
  } else {
    auth.signInWithEmailAndPassword(email, pass).then(() => {
      closeModal('authModal'); showToast('✅ Login Successful!');
    }).catch(e => showToast('❌ Invalid Credentials'));
  }
}

// ===== 6. CONTRACT & ESCROW LOGIC (NEW FEATURE) =====
function loadContracts() {
    if(!currentUser || !currentUserData) return;
    
    const container = document.getElementById('contractsContainer');
    // Here an Expert can see all contracts, Buyer/Farmer see their own.
    // Assuming backend logic matches user ID to contract participants.
    container.innerHTML = `
        <div class="card" style="border-left: 4px solid var(--gold);">
            <div style="font-size:12px; color:var(--gray)">Contract ID: #MNG-8942</div>
            <div style="font-weight:bold; font-size:18px; margin-top:4px;">10 Tons Wheat Export</div>
            <div style="margin-top:8px; display:flex; justify-content:space-between;">
                <span style="background:#e8f5ee; color:var(--green); padding:4px 8px; border-radius:8px; font-size:12px; font-weight:bold;">Status: Escrow Locked</span>
                <span style="font-weight:bold;">$2,500</span>
            </div>
            <div style="margin-top:12px; font-size:13px; color:var(--gray);">Expert Assigned: Rahul (Agronomist)</div>
            <button class="modal-submit" style="margin-top:12px; padding:10px; width:100%;">View Details</button>
        </div>
    `;
}

