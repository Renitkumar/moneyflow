import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, getIdToken } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById("app");
let currentUser = null, transactions = [], unsubscribe = null, currentPage = "home";

// Pick one fresh underwater hero image when the app loads. The lock value prevents
// the image service/browser cache from returning the same image on every open.
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1530053969600-caed2596d242?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=82"
];
// A different remote wallpaper is selected on every fresh app load.
const HERO_IMAGE = HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];

const money = n => `₹${Number(n || 0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const iso = d => { const x=new Date(d), o=x.getTimezoneOffset(); return new Date(x.getTime()-o*60000).toISOString().slice(0,10); };
const dateText = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});

function toast(msg,type="info"){
  const e=document.createElement("div"); e.className=`toast ${type}`; e.textContent=msg;
  document.body.appendChild(e); setTimeout(()=>e.remove(),2800);
}

function authView(mode="login"){
  const register=mode==="register";
  const AUTH_BACKGROUNDS = [
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=82",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=82",
    "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1600&q=82"
  ];
  const bg=AUTH_BACKGROUNDS[Math.floor(Math.random()*AUTH_BACKGROUNDS.length)];
  root.innerHTML=`<main class="auth-shell video-auth" style="--auth-bg:url('${bg}')">
    <div class="auth-light light-a"></div><div class="auth-light light-b"></div>
    <section class="auth-card glass auth-video-card ${register?'is-register':''}">
      <button class="auth-close" id="authClose" aria-label="Close">×</button>
      <div class="auth-floating-logo"><span>≋</span></div>
      <div class="auth-title-wrap"><div class="auth-kicker">MONEY MANAGEMENT</div><h1>${register?'Create account':'Welcome Back'}</h1><p>${register?'Start your journey with MoneyFlow':'Sign in to continue'}</p></div>
      <form id="authForm">
        ${register?'<label class="auth-field"><span>Username</span><input id="name" placeholder="Your name" required></label>':""}
        <label class="auth-field"><span>Email</span><input id="email" type="email" placeholder="Email address" required></label>
        <label class="auth-field"><span>Password</span><input id="password" type="password" placeholder="Password" minlength="6" required></label>
        <div class="auth-options"><label><input type="checkbox"> <span>Remember me</span></label>${register?'':'<button type="button" class="forgot-btn">Forgot Password?</button>'}</div>
        <button class="primary wide auth-login-btn" type="submit"><span>${register?'Create Account':'Login'}</span><b>→</b></button>
      </form>
      <div class="auth-switch">${register?'Already have an account?':'Don’t have an account?'} <button class="link-btn" id="switch">${register?'Login':'Register'}</button></div>
      <small class="auth-secure">Your financial data is stored securely per account.</small>
    </section>
  </main>`;
  document.getElementById("switch").onclick=()=>authView(register?"login":"register");
  document.getElementById("authClose").onclick=()=>{ if(currentUser) shell(); };
  document.getElementById("authForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const email=document.getElementById("email").value.trim(), password=document.getElementById("password").value;
      if(register){
        const name=document.getElementById("name").value.trim();
        const c=await createUserWithEmailAndPassword(auth,email,password);
        await updateProfile(c.user,{displayName:name});
        await setDoc(doc(db,"users",c.user.uid),{displayName:name,lockedUntil:null},{merge:true});
        toast("Account created","success");
      }else await signInWithEmailAndPassword(auth,email,password);
    }catch(err){toast(err.message.replace("Firebase: ",""),"error")}
  };
}
function totals(){
  return {
    credit:transactions.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0),
    debit:transactions.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0)
  };
}

function shell(){
  root.innerHTML=`<div class="app-shell home-wallpaper" style="--hero-image:url('${HERO_IMAGE}')">
    <header class="topbar">
      <div class="brand"><span class="brand-wave">≋</span><div><b>MoneyFlow</b><small>Track Today, Build Tomorrow</small></div></div>
      <div class="header-actions">
        <button id="adminPanelBtn" class="admin-panel-btn hidden">⚙ Admin Panel</button>
        <div class="user-chip"><span class="user-dot">${esc((currentUser?.displayName||currentUser?.email||"U").slice(0,1).toUpperCase())}</span><span class="user-name">${esc(currentUser?.displayName||currentUser?.email||"User")}</span></div>
      </div>
    </header>
    <main class="content"><section id="page"></section></main>
    <nav class="bottom-nav liquid-nav glass" id="bottomNav">
      <div class="liquid-lens" id="liquidLens" aria-hidden="true"></div>
      <button data-page="home"><i>⌂</i><span>Home</span></button>
      <button data-page="add" class="add-nav"><i>＋</i><span>Add</span></button>
      <button data-page="download"><i>↓</i><span>Download</span></button>
      <button id="logout"><i>↪</i><span>Log out</span></button>
    </nav>
  </div>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{currentPage=b.dataset.page;renderPage()});
  document.getElementById("logout").onclick=()=>signOut(auth);
  document.getElementById("adminPanelBtn").onclick=()=>{ currentPage="admin"; renderPage(); };
  setupLiquidNavigation();
  checkAdminAccess();
  renderPage();
}


function updateLiquidLens(){
  const nav=document.getElementById("bottomNav"), lens=document.getElementById("liquidLens");
  if(!nav || !lens)return;
  const active=nav.querySelector(`[data-page="${currentPage}"]`);
  if(!active)return;
  const nr=nav.getBoundingClientRect(), ar=active.getBoundingClientRect();
  lens.style.width=`${ar.width}px`;
  lens.style.height=`${ar.height}px`;
  lens.style.transform=`translate(${ar.left-nr.left}px, ${ar.top-nr.top}px)`;
}

function setupLiquidNavigation(){
  const nav=document.getElementById("bottomNav");
  if(!nav)return;
  nav.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{
    currentPage=b.dataset.page;
    renderPage();
  }));

  let startX=0,startY=0,startTime=0;
  nav.addEventListener("touchstart",e=>{
    const t=e.changedTouches[0]; startX=t.clientX; startY=t.clientY; startTime=Date.now();
  },{passive:true});
  nav.addEventListener("touchend",e=>{
    const t=e.changedTouches[0], dx=t.clientX-startX, dy=t.clientY-startY, dt=Date.now()-startTime;
    if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.25 && dt<650){
      const pages=["home","add","download"];
      const i=pages.indexOf(currentPage);
      const next=dx<0?Math.min(i+1,pages.length-1):Math.max(i-1,0);
      if(next!==i){currentPage=pages[next];renderPage();}
    }
  },{passive:true});

  let mouseDown=false,mouseStart=0;
  nav.addEventListener("pointerdown",e=>{mouseDown=true;mouseStart=e.clientX});
  nav.addEventListener("pointerup",e=>{
    if(!mouseDown)return; mouseDown=false;
    const dx=e.clientX-mouseStart;
    if(Math.abs(dx)>75){
      const pages=["home","add","download"];
      const i=pages.indexOf(currentPage);
      const next=dx<0?Math.min(i+1,pages.length-1):Math.max(i-1,0);
      if(next!==i){currentPage=pages[next];renderPage();}
    }
  });
  window.addEventListener("resize",updateLiquidLens);
  updateLiquidLens();
}


async function adminApi(action, payload={}){
  const token=await currentUser.getIdToken();
  const res=await fetch(`/api/admin?action=${encodeURIComponent(action)}`,{
    method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
    body:JSON.stringify(payload)
  });
  const data=await res.json().catch(()=>({error:"Invalid server response"}));
  if(!res.ok)throw new Error(data.error||"Admin request failed");
  return data;
}

async function checkAdminAccess(){
  try{
    const data=await adminApi("me");
    const btn=document.getElementById("adminPanelBtn");
    if(btn && data.isAdmin)btn.classList.remove("hidden");
  }catch(_){}
}

async function renderAdmin(p){
  p.innerHTML=`<div class="admin-shell">
    <div class="admin-head">
      <div><div class="eyebrow">ADMIN CONTROL</div><h2>Admin Panel</h2><p class="muted">Manage users and correct transactions securely.</p></div>
      <button class="secondary" id="backHome">← Home</button>
    </div>
    <div class="admin-stats" id="adminStats"><div class="admin-stat glass"><b>Loading…</b><small>Users</small></div></div>
    <section class="admin-card glass">
      <div class="admin-toolbar"><h3>Users</h3><input id="userSearch" placeholder="Search name or email"></div>
      <div id="adminUsers" class="admin-users"><div class="admin-loading">Loading users…</div></div>
    </section>
  </div>`;
  document.getElementById("backHome").onclick=()=>{currentPage="home";renderPage()};
  try{
    const data=await adminApi("users");
    document.getElementById("adminStats").innerHTML=`
      <div class="admin-stat glass"><strong>${data.users.length}</strong><small>Total users</small></div>
      <div class="admin-stat glass"><strong>${data.users.filter(u=>u.disabled).length}</strong><small>Disabled</small></div>
      <div class="admin-stat glass"><strong>${data.users.filter(u=>u.locked).length}</strong><small>Temporarily locked</small></div>`;
    const renderUsers=()=>{
      const q=document.getElementById("userSearch").value.trim().toLowerCase();
      const rows=data.users.filter(u=>(u.email+" "+(u.displayName||"")).toLowerCase().includes(q));
      document.getElementById("adminUsers").innerHTML=rows.length?rows.map(u=>`
        <article class="admin-user ${u.disabled?"is-disabled":""}">
          <div class="admin-user-main"><div class="avatar">${esc((u.displayName||u.email||"?").slice(0,1).toUpperCase())}</div>
            <div><b>${esc(u.displayName||"Unnamed user")}</b><span>${esc(u.email||"No email")}</span><small>${u.uid}</small></div></div>
          <div class="user-money"><span class="pos">+ ${money(u.credit)}</span><span class="neg">− ${money(u.debit)}</span><strong>${money(u.balance)}</strong><small>${u.locked?"LOCKED":u.disabled?"DISABLED":"ACTIVE"}</small></div>
          <button class="secondary manage-user" data-uid="${u.uid}">Manage</button>
        </article>`).join(""):`<div class="admin-loading">No users found.</div>`;
      document.querySelectorAll(".manage-user").forEach(b=>b.onclick=()=>openAdminUser(data.users.find(u=>u.uid===b.dataset.uid)));
    };
    document.getElementById("userSearch").oninput=renderUsers; renderUsers();
  }catch(err){document.getElementById("adminUsers").innerHTML=`<div class="admin-error">${esc(err.message)}</div>`}
}

async function openAdminUser(u){
  const p=document.getElementById("page");
  p.innerHTML=`<div class="admin-shell">
    <div class="admin-head"><div><div class="eyebrow">USER MANAGEMENT</div><h2>${esc(u.displayName||"User")}</h2><p class="muted">${esc(u.email||"")}</p></div><button class="secondary" id="backUsers">← Users</button></div>
    <section class="user-overview glass">
      <div class="overview-money"><span class="pos">Positive ${money(u.credit)}</span><span class="neg">Negative ${money(u.debit)}</span><strong>${money(u.balance)}</strong><small>Available balance</small></div>
      <div class="status-pill ${u.disabled?"bad":u.locked?"warn":"ok"}">${u.disabled?"DISABLED":u.locked?"LOCKED":"ACTIVE"}</div>
    </section>
    <section class="admin-card glass">
      <div class="admin-toolbar"><h3>Transactions</h3><span class="muted">Admin can remove incorrect entries</span></div>
      <div id="adminTx" class="tx-list"><div class="admin-loading">Loading…</div></div>
    </section>
    <section class="admin-actions glass">
      <h3>Account controls</h3>
      <p class="muted">These actions affect only this user's account.</p>
      <div class="action-grid">
        <button class="secondary" id="toggleLock">${u.locked?"Unlock temporarily locked user":"Temporary lock"}</button>
        <button class="secondary" id="toggleDisable">${u.disabled?"Enable account":"Disable account"}</button>
        <button class="danger" id="deleteUser">Delete account</button>
      </div>
      <small class="admin-warning">Delete permanently removes the Firebase Auth account and the user's transaction records. Use only when necessary.</small>
    </section>
  </div>`;
  document.getElementById("backUsers").onclick=()=>renderAdmin(document.getElementById("page"));

  document.getElementById("toggleLock").onclick=async()=>{
    try{await adminApi(u.locked?"unlockUser":"lockUser",{uid:u.uid});toast(u.locked?"User unlocked":"User temporarily locked","success");renderAdmin(document.getElementById("page"))}
    catch(e){toast(e.message,"error")}
  };
  document.getElementById("toggleDisable").onclick=async()=>{
    try{await adminApi(u.disabled?"enableUser":"disableUser",{uid:u.uid});toast(u.disabled?"Account enabled":"Account disabled","success");renderAdmin(document.getElementById("page"))}
    catch(e){toast(e.message,"error")}
  };
  document.getElementById("deleteUser").onclick=async()=>{
    if(!confirm(`Delete ${u.email||u.displayName||"this user"} permanently?`))return;
    try{await adminApi("deleteUser",{uid:u.uid});toast("Account deleted","success");renderAdmin(document.getElementById("page"))}
    catch(e){toast(e.message,"error")}
  };

  try{
    const data=await adminApi("transactions",{uid:u.uid});
    document.getElementById("adminTx").innerHTML=data.transactions.length?data.transactions.map(t=>`
      <div class="tx admin-tx"><div class="tx-icon ${t.type}">${t.type==="credit"?"↗":"↘"}</div>
        <div class="tx-main"><b>${esc(t.note)}</b><span>${esc(t.date)} · ${esc(t.id)}</span></div>
        <strong class="${t.type}">${t.type==="credit"?"+":"−"}${money(t.amount)}</strong>
        <button class="delete-tx" data-id="${t.id}" title="Delete transaction">✕</button>
      </div>`).join(""):`<div class="admin-loading">No transactions.</div>`;
    document.querySelectorAll(".delete-tx").forEach(b=>b.onclick=async()=>{
      if(!confirm("Remove this transaction? The user's totals will update."))return;
      let passcode;
      if(u.uid===currentUser?.uid){
        passcode=window.prompt("Admin self-delete requires passcode:");
        if(passcode===null)return;
      }
      try{
        const payload={uid:u.uid,transactionId:b.dataset.id};
        if(passcode!==undefined)payload.passcode=passcode;
        await adminApi("deleteTransaction",payload);
        toast("Transaction removed","success");
        openAdminUser(u);
      }catch(e){toast(e.message,"error")}
    });
  }catch(e){document.getElementById("adminTx").innerHTML=`<div class="admin-error">${esc(e.message)}</div>`}
}

function renderPage(){
  const p=document.getElementById("page"); if(!p)return;
  const tb=document.querySelector(".topbar");
  if(tb) tb.classList.toggle("home-only-brand", currentPage==="home");
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage));
  requestAnimationFrame(updateLiquidLens);
  if(currentPage==="home")renderHome(p);
  if(currentPage==="history")renderHistory(p);
  if(currentPage==="add")renderAdd(p);
  if(currentPage==="download")renderDownload(p);
  if(currentPage==="admin")renderAdmin(p);
}

function renderHome(p){
  const {credit,debit}=totals(), balance=credit-debit;
  const hour=new Date().getHours();
  const greeting=hour<12?"Good Morning":hour<18?"Good Afternoon":"Good Evening";
  p.innerHTML=`<section class="home-greeting">
    <div class="eyebrow">OVERVIEW</div>
    <h1>${greeting}<br><strong>${esc(currentUser?.displayName?.split(" ")[0]||"there")}</strong> 👋</h1>
    <p>Small steps. Big results.</p>
  </section>
  <section class="dashboard-grid">
    <article class="stat-card positive"><div class="stat-icon">↗</div><div class="label">POSITIVE</div><strong>${money(credit)}</strong><small>Total credits</small></article>
    <article class="stat-card negative"><div class="stat-icon">↘</div><div class="label">NEGATIVE</div><strong>${money(debit)}</strong><small>Total debits</small></article>
  </section>
  <article class="balance-card ${balance<0?"down":""}"><div class="balance-icon">▣</div><div><div class="label">CURRENT BALANCE</div><strong>${money(balance)}</strong><small>${balance>=0?"You're on track":"Watch your spending"}</small></div><div class="balance-arrow">${balance>=0?"↑":"↓"}</div></article>
  <div class="quote">✦<br><b>Discipline today,<br>financial freedom tomorrow.</b></div>`;
}
function renderHistory(p){
  p.innerHTML=`<div class="page-head">
    <div><div class="eyebrow">HISTORY</div><h2>Your records</h2><p class="muted">See when money came in or went out.</p></div>
  </div>
  <section class="history-filter glass">
    <div class="filter-title"><div><div class="eyebrow">HISTORY</div><h2>Your records</h2></div><span class="record-count">${transactions.length} records</span></div>
    <div class="filter-tabs">
      <button class="filter-tab active" data-filter="all">All</button>
      <button class="filter-tab positive-filter" data-filter="credit">↗ Positive</button>
      <button class="filter-tab negative-filter" data-filter="debit">↘ Negative</button>
    </div>
  </section>
  <div id="historyList">${list(transactions)}</div>`;

  document.querySelectorAll(".filter-tab").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".filter-tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const type=b.dataset.filter;
    document.getElementById("historyList").innerHTML=list(type==="all"?transactions:transactions.filter(t=>t.type===type));
  });
}

function renderAdd(p){
  p.innerHTML=`<div class="page-head">
    <div><div class="eyebrow">ADD TRANSACTION</div><h2>Credit / Debit</h2><p class="muted">Record your money movement.</p></div>
  </div>
  <section class="history-card glass add-card">
    <div class="type-tabs">
      <button class="type-tab active" data-type="credit">↗ CREDIT<small>Money received</small></button>
      <button class="type-tab" data-type="debit">↘ DEBIT<small>Money spent</small></button>
    </div>
    <form id="txForm">
      <input type="hidden" id="txType" value="credit">
      <div class="input-grid">
        <label>Amount (₹)<input id="txAmount" type="number" min=".01" step=".01" placeholder="1500" required></label>
        <label>Date<input id="txDate" type="date" value="${iso(new Date())}" required></label>
      </div>
      <label>Description<input id="txNote" maxlength="120" placeholder="Salary, food, travel..." required></label>
      <button class="primary wide save-btn" type="submit">Save transaction</button>
    </form>
  </section>
  <div class="add-hint glass"><span>✦</span><div><b>Real-time sync</b><small>Your saved transaction instantly updates Positive, Negative and Current Balance.</small></div></div>`;

  document.querySelectorAll(".type-tab").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".type-tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("txType").value=b.dataset.type;
  });

  document.getElementById("txForm").onsubmit=async e=>{
    e.preventDefault();
    const type=document.getElementById("txType").value;
    try{
      await addDoc(collection(db,"users",currentUser.uid,"transactions"),{
        type, amount:Number(document.getElementById("txAmount").value),
        note:document.getElementById("txNote").value.trim(),
        date:document.getElementById("txDate").value, uid:currentUser.uid, createdAt:serverTimestamp()
      });
      e.target.reset();
      document.getElementById("txDate").value=iso(new Date());
      toast(type==="credit"?"Credit added":"Debit added","success");
    }catch(err){toast(err.message,"error")}
  };
}

function openTx(type){
  currentPage="add"; renderPage();
  setTimeout(()=>{
    document.getElementById("txType").value=type;
    document.querySelectorAll(".type-tab").forEach(x=>x.classList.toggle("active",x.dataset.type===type));
    document.getElementById("txAmount")?.focus();
  },0);
}

function list(rows){
  if(!rows.length)return `<div class="empty"><div>₹</div><h3>No transactions yet</h3><p>Add your first credit or debit from History.</p></div>`;
  return `<div class="tx-list">${rows.map(t=>`<div class="tx">
    <div class="tx-icon ${t.type}">${t.type==="credit"?"↗":"↘"}</div>
    <div class="tx-main"><b>${esc(t.note)}</b><span>${dateText(t.date)}</span></div>
    <strong class="${t.type}">${t.type==="credit"?"+":"−"}${money(t.amount)}</strong>
  </div>`).join("")}</div>`;
}

function renderDownload(p){
  p.innerHTML=`<div class="page-head">
    <div><div class="eyebrow">EXPORT</div><h2>Download report</h2><p class="muted">Choose a date range for your report.</p></div>
  </div>
  <section class="download-card glass"><p class="muted">Choose a date range to download your complete credit/debit report.</p>
    <div class="input-grid"><label>From<input id="from" type="date"></label><label>To<input id="to" type="date" value="${iso(new Date())}"></label></div>
    <div id="preview"></div><button class="primary wide" id="download">↓ Download CSV</button>
  </section>`;
  const f=document.getElementById("from"),t=document.getElementById("to");
  f.value=transactions.length?iso(new Date(Math.min(...transactions.map(x=>new Date(x.date).getTime())))):iso(new Date());
  const preview=()=>{
    const r=range(f.value,t.value),c=r.filter(x=>x.type==="credit").reduce((a,x)=>a+Number(x.amount),0),d=r.filter(x=>x.type==="debit").reduce((a,x)=>a+Number(x.amount),0);
    document.getElementById("preview").innerHTML=`<div class="report-total"><span>Positive<b>${money(c)}</b></span><span>Negative<b>${money(d)}</b></span><span>Balance<b>${money(c-d)}</b></span></div><small>${r.length} transactions selected</small>`;
  };
  f.onchange=t.onchange=preview; preview();
  document.getElementById("download").onclick=()=>{
    const r=range(f.value,t.value); if(!r.length)return toast("No transactions in this range","error");
    const c=r.filter(x=>x.type==="credit").reduce((a,x)=>a+Number(x.amount),0),d=r.filter(x=>x.type==="debit").reduce((a,x)=>a+Number(x.amount),0);
    const csv=[["MONEYFLOW REPORT"],["Positive / Credit",c],["Negative / Debit",d],["Balance",c-d],[],["Date","Type","Description","Amount (₹)"],...r.map(x=>[x.date,x.type==="credit"?"Credit":"Debit",x.note,Number(x.amount).toFixed(2)])]
      .map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"})); a.download=`moneyflow_${f.value}_to_${t.value}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
}
function range(f,t){return transactions.filter(x=>x.date>=f&&x.date<=t).sort((a,b)=>b.date.localeCompare(a.date))}

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(!user){if(unsubscribe)unsubscribe();authView();return}
  currentPage="home"; shell();
  const q=query(collection(db,"users",user.uid,"transactions"),orderBy("date","desc"));
  unsubscribe=onSnapshot(q,s=>{transactions=s.docs.map(d=>({id:d.id,...d.data()}));renderPage()},e=>toast("Sync error: "+e.message,"error"));
});