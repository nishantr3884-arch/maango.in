// ===== 1. FIREBASE INITIALIZATION & BACKEND URL =====
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

// 🚀 TERA LIVE CUSTOM BACKEND SERVER URL 
const BACKEND_URL = "https://maango-backend.onrender.com";

// ===== 2. GLOBAL STATE =====
let currentUser = null;
let currentUserData = null;
let authMode = 'login'; 
let selectedType = 'buyer';
let allListings = [];

// ===== 3. CORE AUTH LISTENER =====
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if(user) {
        document.getElementById('navAuthBtn').textContent = "Profile";
        db.collection('users').doc(user.uid).get().then((doc) => {
            currentUserData = doc.exists ? doc.data() : null;
            renderProfile();
            loadContracts(); // Load escrow contracts from Custom Backend
        });
    } else {
        document.getElementById('navAuthBtn').textContent = "👤 Login";
        currentUserData = null;
        renderProfile();
    }
    loadListings(); 
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

// ===== 5. UPGRADED AUTHENTICATION (With Strict Email Verification) =====
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

    const btn = document.getElementById('authMainBtn');
    const originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    btn.disabled = true;
  
    if (authMode === 'signup') {
        const name = document.getElementById('authName').value.trim();
        const country = document.getElementById('authCountry').value.trim();
        if(!name || !country) {
            btn.textContent = originalText; btn.disabled = false;
            return showToast('⚠️ Name and Country required.');
        }

        auth.createUserWithEmailAndPassword(email, pass).then((cred) => {
            // 🚨 STRICT EMAIL VERIFICATION TRIGGER 🚨
            cred.user.sendEmailVerification();
            
            return fetch(`${BACKEND_URL}/api/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: cred.user.uid, name: name, email: email, country: country, user_type: selectedType
                })
            }).then(res => {
                if(!res.ok) throw new Error("Database provisioning failed");
                return db.collection('users').doc(cred.user.uid).set({
                    name: name, email: email, country: country, userType: selectedType,
                    govtIdVerified: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        }).then(() => {
            // Force sign out immediately so they have to verify email before accessing dashboard
            auth.signOut(); 
            closeModal('authModal');
            showToast('📩 Verification Link Sent! Please check your Email to login.');
        }).catch(e => showToast('❌ ' + e.message)).finally(() => {
            btn.textContent = originalText; btn.disabled = false;
        });
    } else {
        // LOGIN FLOW WITH VERIFICATION CHECK
        auth.signInWithEmailAndPassword(email, pass).then((cred) => {
            if (!cred.user.emailVerified) {
                auth.signOut(); // Kick them out if not verified
                throw new Error("Please verify your email address first.");
            }
            closeModal('authModal'); showToast('✅ Secure Login Successful!');
        }).catch(e => showToast('❌ ' + e.message)).finally(() => {
            btn.textContent = originalText; btn.disabled = false;
        });
    }
}

// ===== 6. PROFILE & SECURE VAULT KYC LOGIC =====
function saveProfile() {
    const govtIdType = document.getElementById('govtIdType').value;
    const govtIdNumber = document.getElementById('govtIdNumber').value.trim();
    const fileInput = document.getElementById('kycFile');
    
    if(!govtIdType || !govtIdNumber || fileInput.files.length === 0) {
        return showToast('⚠️ Required KYC fields or Document file missing!');
    }
    
    const btn = document.getElementById('kycSubmitBtn');
    const originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Uploading to Vault...';
    btn.disabled = true;

    const file = fileInput.files[0];
    const reader = new FileReader();
    
    // File ko read karke base64 banana chalu karo
    reader.onloadend = function() {
        const base64String = reader.result.split(',')[1]; // Metadata saaf karo, sirf raw text lo
        
        // Render Backend par hit maro
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
            if(data.error) throw new Error(data.error);
            
            // Sync with local Firebase for instantly updating frontend layout
            return db.collection('users').doc(currentUser.uid).set({
                govtIdType: govtIdType,
                govtIdNumber: govtIdNumber,
                govtIdVerified: true
            }, {merge: true});
        })
        .then(() => {
            if (!currentUserData) currentUserData = {};
            currentUserData.govtIdVerified = true;
            
            closeModal('profileModal');
            showToast('🔐 Secure KYC Document Uploaded & Verified!');
            renderProfile();
        })
        .catch(e => {
            showToast('❌ Upload Failed: ' + e.message);
        })
        .finally(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        });
    };
    
    reader.readAsDataURL(file); // Trigger background conversion
}

function renderProfile() {
    const pc = document.getElementById('profileContent');
    if(!currentUser) {
        pc.innerHTML = '<div class="empty-state"><div>🔒</div><p>Please login to access profile.</p></div>';
        return;
    }
    
    const verified = currentUserData && currentUserData.govtIdVerified;
    const role = currentUserData ? currentUserData.userType : 'buyer';
    const roleEmoji = role === 'farmer' ? '🌾' : (role === 'expert' ? '👨‍🏫' : '🛒');
    
    pc.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, var(--green), #1a5c35); color: white; border: none;">
            <div style="font-size:24px; font-weight:900;">${currentUserData ? currentUserData.name : 'User'}</div>
            <div style="opacity: 0.9; margin-bottom: 12px; font-size:14px;">${roleEmoji} ${role.toUpperCase()}</div>
            ${verified ? '<span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold;">🛡️ KYC Verified</span>' : '<button onclick="document.getElementById(\'profileModal\').classList.add(\'show\')" style="background: var(--gold); color: var(--green); border: none; padding: 6px 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">⚠️ Complete KYC</button>'}
            
            <button onclick="auth.signOut().then(()=>showPage('home'))" style="display:block; width:100%; margin-top: 20px; background: white; color: var(--text); border: none; padding: 10px; border-radius: 12px; font-weight: bold; cursor: pointer;">🚪 Logout Securely</button>
        </div>
    `;
}

// ===== 7. MARKET FEED & DEMANDS (Runs on Firebase for now) =====
function loadListings() {
    db.collection('listings').orderBy('createdAt','desc').onSnapshot(snap => {
        allListings = snap.docs.map(d => Object.assign({id: d.id}, d.data()));
        renderCards(allListings);
    }, err => {
        document.getElementById('feedContainer').innerHTML = '<div class="empty-state"><p>Error loading feed.</p></div>';
    });
}

function renderCards(data) {
    const c = document.getElementById('feedContainer');
    if(!data.length) { c.innerHTML = '<div class="empty-state"><div>📋</div><p>No demands yet.<br>Be the first to post!</p></div>'; return; }
    
    let html = '';
    data.forEach(l => {
        const time = l.createdAt ? new Date(l.createdAt.toDate()).toLocaleDateString() : 'Just now';
        html += `
            <div class="card">
                <div class="card-header">
                    <div class="buyer-info">
                        <div class="avatar">${(l.userName||'U')[0].toUpperCase()}</div>
                        <div>
                            <div class="buyer-name">${l.userName||'User'}</div>
                            <span class="buyer-type">${l.userType==='farmer'?'🌾 Farmer':'🛒 Buyer'}</span>
                        </div>
                    </div>
                </div>
                <div class="card-product">${l.product||''}</div>
                <div class="card-details">
                    <div class="dtag">📦 <span>${l.qty||''}</span></div>
                    <div class="dtag">📍 <span>${l.location||''}</span></div>
                </div>
                <div class="card-footer">
                    <span class="card-time">🕐 ${time}</span>
                </div>
            </div>
        `;
    });
    c.innerHTML = html;
}

// 🚨 SEARCH FIX (Correct Placement) 🚨
function filterCards() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!query || query === "") {
        renderCards(allListings);
        return;
    }
    
    const filteredData = allListings.filter(item => {
        const prod = (item.product || '').toLowerCase();
        const loc = (item.location || '').toLowerCase();
        return prod.includes(query) || loc.includes(query);
    });
    
    renderCards(filteredData);
}

function showPostModal() {
    if(!currentUser){ showToast('⚠️ Login Required'); document.getElementById('authModal').classList.add('show'); return; }
    if(!currentUserData || !currentUserData.govtIdVerified){ showToast('⚠️ KYC Required'); document.getElementById('profileModal').classList.add('show'); return; }
    document.getElementById('postModal').classList.add('show');
}

function submitPost() {
    const product = document.getElementById('productName').value.trim();
    const qty = document.getElementById('quantity').value.trim();
    const loc = document.getElementById('location').value.trim();
    
    if(!product || !qty || !loc) return showToast('⚠️ Fill all fields');
    
    const btn = document.getElementById('submitPostBtn');
    btn.innerHTML = '<span class="spinner"></span>...'; btn.disabled = true;
    
    db.collection('listings').add({
        product: product, qty: qty, location: loc,
        userId: currentUser.uid, userName: currentUserData.name || 'User', userType: currentUserData.userType || 'buyer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        closeModal('postModal'); showToast('✅ Demand Posted Successfully!');
        document.getElementById('productName').value = '';
        document.getElementById('quantity').value = '';
        document.getElementById('location').value = '';
    }).finally(() => { 
        btn.innerHTML = '🚀 Post Demand'; btn.disabled = false; 
    });
}

// ===== 8. CONTRACT & ESCROW LOGIC (Connected to Custom Render Backend) =====
function openContractModal() {
    if(!currentUserData || currentUserData.userType !== 'expert') {
        showToast("⚠️ Access Denied: Only verified Experts can draft contracts.");
        return;
    }
    document.getElementById('contractModal').classList.add('show');
}

function createContract() {
    const buyer = document.getElementById('contractBuyer').value.trim();
    const farmer = document.getElementById('contractFarmer').value.trim();
    const crop = document.getElementById('contractCrop').value.trim();
    const amount = document.getElementById('contractAmount').value.trim();

    if(!buyer || !farmer || !crop || !amount) {
        showToast("⚠️ All fields are required!");
        return;
    }

    const btn = document.getElementById('submitContractBtn');
    btn.innerHTML = '<span class="spinner"></span> Locking...';
    btn.disabled = true;

    // Direct POST request to your new custom backend
    fetch(`${BACKEND_URL}/api/contracts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            buyer_ref: buyer,
            farmer_ref: farmer,
            expert_id: currentUser.uid,
            expert_name: currentUserData.name || 'Expert',
            crop_details: crop,
            escrow_amount: amount
        })
    }).then(res => res.json())
    .then(data => {
        if(data.error) throw new Error(data.error);
        
        closeModal('contractModal');
        showToast("✅ Contract Locked in PostgreSQL!");
        
        document.getElementById('contractBuyer').value = '';
        document.getElementById('contractFarmer').value = '';
        document.getElementById('contractCrop').value = '';
        document.getElementById('contractAmount').value = '';
        
        // Refresh API data
        loadContracts();
    }).catch(e => {
        showToast("❌ Error: " + e.message);
    }).finally(() => {
        btn.innerHTML = '🔒 Lock in Escrow';
        btn.disabled = false;
    });
}

function loadContracts() {
    if(!currentUser) return;
    const container = document.getElementById('contractsContainer');
    container.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Syncing secure PostgreSQL ledger...</p></div>';

    // Direct GET request to your custom backend
    fetch(`${BACKEND_URL}/api/contracts`)
    .then(res => res.json())
    .then(data => {
        let expertBtn = '';
        if(currentUserData && currentUserData.userType === 'expert') {
            expertBtn = '<button class="post-btn" style="margin-bottom:16px; width:100%;" onclick="openContractModal()">+ Draft New Contract</button>';
        }

        if(!data || data.length === 0) {
            container.innerHTML = `
                ${expertBtn}
                <div class="empty-state">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
                    <p>No active contracts found in the secure system.</p>
                </div>
            `;
            return;
        }

        let html = expertBtn; 

        data.forEach(contract => {
            html += `
                <div class="card" style="border-left: 4px solid var(--gold);">
                    <div style="font-size:12px; color:var(--gray); font-weight:bold;">Contract ID: #${contract.contract_id}</div>
                    <div style="font-weight:900; font-size:18px; margin-top:4px; color:var(--green);">${contract.crop_details}</div>
                    
                    <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="background:#e8f5ee; color:var(--green); padding:6px 10px; border-radius:8px; font-size:12px; font-weight:800; border: 1px solid var(--green2);">
                            ${contract.status}
                        </span>
                        <span style="font-weight:900; color:var(--green2); font-size:18px;">
                            ₹${contract.escrow_amount}
                        </span>
                    </div>
                    
                    <div style="margin-top:16px; font-size:13px; color:var(--text); background: var(--bg); padding: 12px; border-radius: 12px;">
                        <div style="margin-bottom:4px;">👨‍🏫 <strong>Expert:</strong> ${contract.expert_name}</div>
                        <div style="margin-bottom:4px;">🛒 <strong>Buyer:</strong> ${contract.buyer_ref}</div>
                        <div>🌾 <strong>Farmer:</strong> ${contract.farmer_ref}</div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }).catch(error => {
        console.error("Error fetching contracts from Backend:", error);
        container.innerHTML = '<div class="empty-state"><p>Error connecting to Enterprise API.</p></div>';
    });
}
