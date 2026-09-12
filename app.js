import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, getIdToken, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const root = document.getElementById("app");
let currentUser = null, transactions = [], unsubscribe = null, currentPage = "home", dailyTimer = null, profileSaving = false;

const money = n => `₹${Number(n || 0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const iso = d => { const x=new Date(d), o=x.getTimezoneOffset(); return new Date(x.getTime()-o*60000).toISOString().slice(0,10); };
const dateText = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});

function toast(msg,type="info"){
  const e=document.createElement("div"); e.className=`toast ${type}`; e.textContent=msg;
  document.body.appendChild(e); setTimeout(()=>e.remove(),2800);
}

function confirmLogout(){
  return new Promise(resolve=>{
    const old=document.getElementById("logoutConfirmModal");
    if(old)old.remove();
    const modal=document.createElement("div");
    modal.id="logoutConfirmModal";
    modal.className="logout-confirm-modal";
    modal.innerHTML=`<div class="logout-confirm-card glass" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle">
      <div class="logout-confirm-icon">↪</div>
      <h3 id="logoutConfirmTitle">Are you sure?</h3>
      <p>Do you want to log out of MoneyFlow?</p>
      <div class="logout-confirm-actions">
        <button type="button" class="secondary logout-no">No</button>
        <button type="button" class="primary logout-yes">Yes, Log out</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const close=value=>{modal.classList.add("closing"); setTimeout(()=>modal.remove(),140); resolve(value);};
    modal.querySelector(".logout-no").onclick=()=>close(false);
    modal.querySelector(".logout-yes").onclick=()=>close(true);
    modal.addEventListener("click",e=>{if(e.target===modal)close(false)});
    const onKey=e=>{if(e.key==="Escape"){document.removeEventListener("keydown",onKey);close(false)}};
    document.addEventListener("keydown",onKey);
    setTimeout(()=>modal.querySelector(".logout-no")?.focus(),0);
  });
}

function authView(mode="login"){
  if(mode==="forgot"){
    root.innerHTML=`<main class="auth-shell">
      <div class="orb orb1"></div><div class="orb orb2"></div>
      <section class="auth-card glass">
        <div class="brand-mark">₹</div>
        <h1>Reset Password</h1><p>Enter your email and we'll send you a reset link.</p>
        <form id="resetForm">
          <input id="resetEmail" type="email" placeholder="Email address" required>
          <button class="primary wide">Send Reset Link</button>
        </form>
        <button class="link-btn" id="backLogin">← Back to Login</button>
        <small>Check your inbox and spam folder for the password reset email.</small>
      </section>
    </main>`;

    document.getElementById("backLogin").onclick=()=>authView("login");
    document.getElementById("resetForm").onsubmit=async e=>{
      e.preventDefault();
      try{
        const email=document.getElementById("resetEmail").value.trim();
        const actionCodeSettings={
          url:"https://moneyflow-rouge.vercel.app/",
          handleCodeInApp:false
        };
        await sendPasswordResetEmail(auth,email,actionCodeSettings);
        toast("Password reset link sent to your email","success");
        setTimeout(()=>authView("login"),1200);
      }catch(err){
        let msg=err.message.replace("Firebase: ","");
        if(err.code==="auth/user-not-found")msg="No account found with this email.";
        if(err.code==="auth/invalid-email")msg="Please enter a valid email address.";
        toast(msg,"error");
      }
    };
    return;
  }

  const register=mode==="register";
  root.innerHTML=`<main class="auth-shell">
    <div class="orb orb1"></div><div class="orb orb2"></div>
    <section class="auth-card glass">
      <div class="brand-mark">₹</div>
      <h1>MoneyFlow</h1><p>Track Today, Build Tomorrow</p>
      <form id="authForm">
        ${register?'<input id="name" placeholder="Full name" required>':""}
        <input id="email" type="email" placeholder="Email address" required>
        <input id="password" type="password" placeholder="Password" minlength="6" required>
        <button class="primary wide">${register?"Create account":"Login"}</button>
      </form>
      ${!register?'<button class="link-btn" id="forgotBtn">Forgot password?</button>':""}
      <div class="auth-divider"><span>or</span></div>
      <button class="google-btn" id="googleBtn" type="button"><span class="google-icon">G</span> Continue with Google</button>
      <button class="link-btn" id="switch">${register?"Already have an account? Login":"New here? Create an account"}</button>
      <small>Your financial data is stored securely per account.</small>
    </section>
  </main>`;

  document.getElementById("switch").onclick=()=>authView(register?"login":"register");
  if(!register)document.getElementById("forgotBtn").onclick=()=>authView("forgot");

  document.getElementById("googleBtn").onclick=async()=>{
    try{
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      const result=await signInWithPopup(auth,provider);
      await setDoc(doc(db,"users",result.user.uid),{
        displayName:result.user.displayName||result.user.email?.split("@")[0]||"User",
        email:result.user.email||"",
        lockedUntil:null
      },{merge:true});
      toast("Signed in with Google","success");
    }catch(err){
      if(err.code!=="auth/popup-closed-by-user" && err.code!=="auth/cancelled-popup-request"){
        toast(err.message.replace("Firebase: ",""),"error");
      }
    }
  };

  document.getElementById("authForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const email=document.getElementById("email").value.trim(), password=document.getElementById("password").value;
      if(register){
        const name=document.getElementById("name").value.trim();
        const c=await createUserWithEmailAndPassword(auth,email,password);
        await updateProfile(c.user,{displayName:name});
        await setDoc(doc(db,"users",c.user.uid),{displayName:name,email,lockedUntil:null},{merge:true});
        toast("Account created","success");
      }else await signInWithEmailAndPassword(auth,email,password);
    }catch(err){toast(err.message.replace("Firebase: ",""),"error")}
  };
}
function totals(rows=transactions){
  return {
    credit:rows.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0),
    debit:rows.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0)
  };
}

function todayKey(){ return iso(new Date()); }
function todayTransactions(){ return transactions.filter(t=>t.date===todayKey()); }

function scheduleDailyRefresh(){
  if(dailyTimer)clearTimeout(dailyTimer);
  const now=new Date();
  const next=new Date(now);
  next.setHours(24,0,1,0);
  dailyTimer=setTimeout(()=>{ renderPage(); scheduleDailyRefresh(); }, Math.max(1000,next-now));
}

function shell(){
  root.innerHTML=`<div class="app-shell">
    <header class="topbar glass">
      <div class="brand"><span>₹</span><div><b>MoneyFlow</b><small>Track Today, Build Tomorrow</small></div></div>
      <div class="header-actions">
        <button id="adminPanelBtn" class="admin-panel-btn hidden">⚙ Admin Panel</button>
        <div class="user-chip">${currentUser?.photoURL?`<img src="${esc(currentUser.photoURL)}" alt="">`:`<span class="user-chip-avatar">${esc((currentUser?.displayName||currentUser?.email||"U").slice(0,1).toUpperCase())}</span>`}<span>${esc(currentUser?.displayName||currentUser?.email||"User")}</span></div>
      </div>
    </header>
    <main class="content"><section id="page"></section></main>
    <nav class="bottom-nav liquid-nav glass" id="bottomNav">
      <div class="liquid-lens" id="liquidLens" aria-hidden="true"></div>
      <button data-page="home"><i>⌂</i><span>Home</span></button>
      <button data-page="history"><i>◷</i><span>History</span></button>
      <button data-page="add" class="add-nav"><i>＋</i><span>Add</span></button>
      <button data-page="download"><i>↓</i><span>Download</span></button>
      <button id="logout"><i>↪</i><span>Log out</span></button>
    </nav>
  </div>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{currentPage=b.dataset.page;renderPage()});
  document.getElementById("logout").onclick=async e=>{
    e.preventDefault();
    e.stopPropagation();
    const confirmed=await confirmLogout();
    if(!confirmed)return;
    try{
      await signOut(auth);
    }catch(err){
      toast(err.message.replace("Firebase: ",""),"error");
    }
  };
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
  lens.style.borderRadius="22px";
  lens.style.transform=`translate3d(${ar.left-nr.left}px,${ar.top-nr.top}px,0) scaleX(1) scaleY(1)`;
}

function setupLiquidNavigation(){
  const nav=document.getElementById("bottomNav"), lens=document.getElementById("liquidLens");
  if(!nav || !lens)return;
  const pages=["home","history","add","download"];
  let dragging=false,moved=false,startX=0,startY=0,startIndex=0,pointerId=null,tapHandled=false;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const buttons=()=>pages.map(p=>nav.querySelector(`[data-page="${p}"]`)).filter(Boolean);

  function paintLens(x,sx=1,sy=1){
    const bs=buttons(); if(!bs.length)return;
    const nr=nav.getBoundingClientRect(),base=bs[startIndex]; if(!base)return;
    const ar=base.getBoundingClientRect();
    const width=ar.width, expanded=width*sx;
    const maxX=Math.max(8,nr.width-expanded-8);
    const target=clamp(x-(expanded-width)/2,8,maxX);
    lens.style.width=`${width}px`; lens.style.height=`${ar.height}px`;
    lens.style.transform=`translate3d(${target}px,${ar.top-nr.top-(ar.height*(sy-1)/2)}px,0) scaleX(${sx}) scaleY(${sy})`;
    lens.style.borderRadius=`${Math.max(18,22/sx)}px`;
    lens.style.transition="none";
  }

  function nearestIndexFromLens(){
    const bs=buttons(),nr=nav.getBoundingClientRect();
    const m=lens.style.transform.match(/translate3d\(([-\d.]+)px/);
    const mx=lens.style.transform.match(/scaleX\(([-\d.]+)\)/);
    const sx=mx?parseFloat(mx[1]):1;
    const left=m?parseFloat(m[1]):0;
    const center=left+(lens.offsetWidth*sx)/2;
    let best=0,dist=Infinity;
    bs.forEach((b,i)=>{const r=b.getBoundingClientRect(),c=r.left-nr.left+r.width/2,d=Math.abs(c-center);if(d<dist){dist=d;best=i;}});
    return best;
  }

  function snapTo(index){currentPage=pages[clamp(index,0,pages.length-1)];renderPage();}

  nav.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",e=>{
    if(tapHandled){tapHandled=false;return;}
    if(moved){e.preventDefault();return;}
    const i=pages.indexOf(b.dataset.page); if(i>=0)snapTo(i);
  }));

  nav.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    const target=e.target.closest?.("[data-page]");
    const i=target?pages.indexOf(target.dataset.page):pages.indexOf(currentPage);
    if(i<0)return;
    const active=nav.querySelector(`[data-page="${pages[i]}"]`); if(!active)return;
    const nr=nav.getBoundingClientRect(),ar=active.getBoundingClientRect();
    dragging=true;moved=false;pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;startIndex=i;
    nav.classList.add("swiping","dragging");
    try{nav.setPointerCapture(e.pointerId)}catch(_){ }
    paintLens(ar.left-nr.left,1,1);
  });

  nav.addEventListener("pointermove",e=>{
    if(!dragging||e.pointerId!==pointerId)return;
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if(Math.abs(dx)>8)moved=true;
    if(!moved&&Math.abs(dx)<Math.abs(dy)*0.65)return;
    e.preventDefault();
    const nr=nav.getBoundingClientRect(),active=nav.querySelector(`[data-page="${pages[startIndex]}"]`);if(!active)return;
    const ar=active.getBoundingClientRect();
    const amount=Math.abs(dx)/Math.max(140,nr.width);
    const sx=1+Math.min(.70,amount*.85);
    const sy=1+Math.min(.08,amount*.12);
    paintLens((ar.left-nr.left)+dx,sx,sy);
  },{passive:false});

  function endDrag(e){
    if(!dragging||e.pointerId!==pointerId)return;
    const wasMoved=moved;
    const target=e.target.closest?.("[data-page]");
    const targetIndex=target?pages.indexOf(target.dataset.page):-1;
    dragging=false;nav.classList.remove("swiping","dragging");
    if(wasMoved){e.preventDefault();snapTo(nearestIndexFromLens());}
    else if(targetIndex>=0){tapHandled=true;snapTo(targetIndex);setTimeout(()=>tapHandled=false,80);}
    else updateLiquidLens();
    moved=false;pointerId=null;
  }
  nav.addEventListener("pointerup",endDrag);
  nav.addEventListener("pointercancel",endDrag);
  nav.addEventListener("lostpointercapture",e=>{if(dragging)endDrag(e)});
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
      <div class="admin-head-actions"><button class="secondary" id="backHome">← Home</button></div>
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
      <div class="admin-toolbar"><div><h3>Transactions</h3><span class="muted">Admin can remove incorrect entries</span></div><button class="secondary" id="adminDownloadReport">↓ Download Report</button></div>
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
    const adminTransactions=data.transactions||[];
    document.getElementById("adminDownloadReport").onclick=()=>showAdminReportDialog(u,adminTransactions);
    document.getElementById("adminTx").innerHTML=adminTransactions.length?adminTransactions.map(t=>`
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


function showAdminReportDialog(user,txs){
  const old=document.getElementById("adminReportDialog");
  if(old)old.remove();
  const dates=txs.map(x=>x.date).filter(Boolean).sort();
  const first=dates[0]||iso(new Date()), last=dates[dates.length-1]||iso(new Date());
  const wrap=document.createElement("div");
  wrap.id="adminReportDialog";
  wrap.className="report-dialog-backdrop";
  wrap.innerHTML=`<div class="report-dialog glass">
    <div class="report-dialog-head"><div><div class="eyebrow">ADMIN EXPORT</div><h3>Download ${esc(user.displayName||user.email||"User")} report</h3><p class="muted">Choose one date or a date range.</p></div><button class="icon-btn" id="closeAdminReport">✕</button></div>
    <div class="report-choice-grid">
      <button class="report-choice active" data-mode="single"><b>One date</b><span>One day's Positive & Negative</span></button>
      <button class="report-choice" data-mode="range"><b>Date range</b><span>Day-wise report for multiple dates</span></button>
    </div>
    <div class="report-date-grid">
      <label id="singleDateWrap">Date<input id="adminReportDate" type="date" value="${last}"></label>
      <label id="rangeFromWrap" class="hidden">From<input id="adminReportFrom" type="date" value="${first}"></label>
      <label id="rangeToWrap" class="hidden">To<input id="adminReportTo" type="date" value="${last}"></label>
    </div>
    <div class="report-dialog-note">Every day shows <b>Positive</b>, <b>Negative</b>, and the transaction description/source.</div>
    <button class="primary wide" id="generateAdminReport">↓ Download Report</button>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  document.getElementById("closeAdminReport").onclick=close;
  wrap.addEventListener("click",e=>{if(e.target===wrap)close()});
  let mode="single";
  wrap.querySelectorAll(".report-choice").forEach(btn=>btn.onclick=()=>{
    mode=btn.dataset.mode;
    wrap.querySelectorAll(".report-choice").forEach(x=>x.classList.toggle("active",x===btn));
    document.getElementById("singleDateWrap").classList.toggle("hidden",mode!=="single");
    document.getElementById("rangeFromWrap").classList.toggle("hidden",mode!=="range");
    document.getElementById("rangeToWrap").classList.toggle("hidden",mode!=="range");
  });
  document.getElementById("generateAdminReport").onclick=()=>{
    const from=mode==="single"?document.getElementById("adminReportDate").value:document.getElementById("adminReportFrom").value;
    const to=mode==="single"?from:document.getElementById("adminReportTo").value;
    if(!from||!to||from>to)return toast("Please select a valid date range","error");
    const selected=txs.filter(x=>x.date>=from&&x.date<=to);
    if(!selected.length)return toast("No transactions in this date range","error");
    downloadAdminUserReport(user,selected,from,to);
    close();
  };
}

function downloadAdminUserReport(user,txs,from,to){
  const byDate={};
  txs.forEach(t=>{(byDate[t.date]??=[]).push(t)});
  const dates=Object.keys(byDate).sort();
  const rows=[["MONEYFLOW USER REPORT"],["User",user.displayName||"","Email",user.email||""],["From",from,"To",to],["Generated",new Date().toLocaleString("en-IN")],[],["DATE","POSITIVE","POSITIVE SOURCE","NEGATIVE","NEGATIVE SOURCE"]];
  let totalC=0,totalD=0;
  for(const date of dates){
    const day=byDate[date].slice();
    const credits=day.filter(x=>x.type==="credit");
    const debits=day.filter(x=>x.type==="debit");
    const creditTotal=credits.reduce((n,x)=>n+Number(x.amount||0),0);
    const debitTotal=debits.reduce((n,x)=>n+Number(x.amount||0),0);
    totalC+=creditTotal; totalD+=debitTotal;
    const max=Math.max(credits.length,debits.length,1);
    for(let i=0;i<max;i++){
      const c=credits[i],d=debits[i];
      rows.push([date,c?`+ ₹${Number(c.amount||0).toFixed(2)}`:"",c?(c.note||c.description||"Payment received"):"",d?`− ₹${Number(d.amount||0).toFixed(2)}`:"",d?(d.note||d.description||"Expense"):""]);
    }
    rows.push([`${date} TOTAL`,`+ ₹${creditTotal.toFixed(2)}`,"",`− ₹${debitTotal.toFixed(2)}`,""],[]);
  }
  rows.push(["REPORT TOTAL",`+ ₹${totalC.toFixed(2)}`,"",`− ₹${totalD.toFixed(2)}`,""],["NET BALANCE",`₹${(totalC-totalD).toFixed(2)}`]);
  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
  const safe=(user.displayName||user.email||"user").replace(/[^a-z0-9_-]+/gi,"_");
  a.download=`moneyflow_${safe}_report_${from}_to_${to}.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function saveProfileName(name){
  const clean=String(name||"").trim();
  if(!clean)return toast("Please enter your name","error");
  if(profileSaving)return;
  profileSaving=true;
  try{
    await updateProfile(currentUser,{displayName:clean});
    await setDoc(doc(db,"users",currentUser.uid),{displayName:clean,email:currentUser.email||"",photoURL:currentUser.photoURL||"",updatedAt:serverTimestamp()},{merge:true});
    toast("Profile updated","success");
    renderPage();
  }catch(e){toast(e.message.replace("Firebase: ",""),"error")}
  finally{profileSaving=false;}
}

async function uploadProfileImage(file){
  if(!file)return;
  if(!file.type.startsWith("image/"))return toast("Please select an image file","error");
  if(file.size>5*1024*1024)return toast("Image must be smaller than 5 MB","error");
  if(profileSaving)return;
  profileSaving=true;
  try{
    toast("Uploading profile image…","info");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const r=storageRef(storage,`users/${currentUser.uid}/profile.${ext}`);
    await uploadBytes(r,file,{contentType:file.type});
    const url=await getDownloadURL(r);
    await updateProfile(currentUser,{photoURL:url});
    await setDoc(doc(db,"users",currentUser.uid),{displayName:currentUser.displayName||"",email:currentUser.email||"",photoURL:url,updatedAt:serverTimestamp()},{merge:true});
    toast("Profile photo updated","success");
    renderPage();
  }catch(e){toast(e.message.replace("Firebase: ",""),"error")}
  finally{profileSaving=false;}
}

function renderProfile(p){
  const name=currentUser?.displayName||currentUser?.email?.split("@")[0]||"User";
  const photo=currentUser?.photoURL||"";
  p.innerHTML=`<section class="profile-page">
    <div class="profile-head">
      <div><div class="eyebrow">ACCOUNT</div><h2>My Profile</h2><p class="muted">Manage your name, profile photo and feedback.</p></div>
      <button class="secondary" id="profileBack">← Home</button>
    </div>
    <section class="profile-card glass">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">${photo?`<img src="${esc(photo)}" alt="Profile photo">`:`<span>${esc(name.slice(0,1).toUpperCase())}</span>`}</div>
        <label class="profile-image-btn" for="profileImageInput">＋ Add new image</label>
        <input id="profileImageInput" type="file" accept="image/*" hidden>
        <small>JPG, PNG or other image · max 5 MB</small>
      </div>
      <div class="profile-form">
        <label>Your name<input id="profileName" maxlength="60" value="${esc(name)}"></label>
        <label>Email address<input value="${esc(currentUser?.email||"")}" disabled></label>
        <button class="primary wide" id="saveProfile">Save changes</button>
      </div>
    </section>
    <section class="profile-feedback glass">
      <div class="profile-section-icon">💬</div>
      <div><h3>Feedback</h3><p class="muted">Tell us what you like, what is confusing, or what we can improve.</p></div>
      <textarea id="feedbackText" maxlength="1000" placeholder="Write your feedback here…"></textarea>
      <button class="primary wide" id="sendFeedback">Send feedback</button>
    </section>
  </section>`;
  document.getElementById("profileBack").onclick=()=>{currentPage="home";renderPage()};
  document.getElementById("profileImageInput").onchange=e=>uploadProfileImage(e.target.files?.[0]);
  document.getElementById("saveProfile").onclick=()=>saveProfileName(document.getElementById("profileName").value);
  document.getElementById("sendFeedback").onclick=async()=>{
    const btn=document.getElementById("sendFeedback");
    const text=document.getElementById("feedbackText").value.trim();
    if(!text)return toast("Please write some feedback first","error");
    if(!currentUser?.uid)return toast("Please login again before sending feedback","error");
    btn.disabled=true;
    try{
      await addDoc(collection(db,"users",currentUser.uid,"feedback"),{
        text,
        uid:currentUser.uid,
        email:currentUser.email||"",
        displayName:currentUser.displayName||name,
        createdAt:serverTimestamp()
      });
      document.getElementById("feedbackText").value="";
      toast("Feedback sent successfully","success");
    }catch(e){
      toast((e.message||"Unable to send feedback").replace("Firebase: ",""),"error");
    }finally{btn.disabled=false;}
  };
}

async function renderFeedbacks(p){
  p.innerHTML=`<section class="admin-shell">
    <div class="admin-head"><div><div class="eyebrow">USER FEEDBACK</div><h2>Feedbacks</h2><p class="muted">Messages submitted by MoneyFlow users.</p></div><button class="secondary" id="backAdmin">← Admin</button></div>
    <section class="admin-card glass"><div id="feedbackList" class="feedback-list"><div class="admin-loading">Loading feedbacks…</div></div></section>
  </section>`;
  document.getElementById("backAdmin").onclick=()=>{currentPage="admin";renderPage()};
  try{
    const data=await adminApi("feedbacks");
    const rows=data.feedbacks||[];
    document.getElementById("feedbackList").innerHTML=rows.length?rows.map(f=>`<article class="feedback-item"><div class="feedback-item-head"><div><b>${esc(f.displayName||"User")}</b><span>${esc(f.email||"")}</span></div><small>${esc(f.createdAtText||"")}</small></div><p>${esc(f.text||"")}</p></article>`).join(""):`<div class="empty"><div>💬</div><h3>No feedback yet</h3><p>User feedback will appear here.</p></div>`;
  }catch(e){document.getElementById("feedbackList").innerHTML=`<div class="admin-error">${esc(e.message)}</div>`}
}

function renderPage(){
  const p=document.getElementById("page"); if(!p)return;
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage));
  requestAnimationFrame(updateLiquidLens);
  if(currentPage==="home")renderHome(p);
  if(currentPage==="profile")renderProfile(p);
  if(currentPage==="history")renderHistory(p);
  if(currentPage==="add")renderAdd(p);
  if(currentPage==="download")renderDownload(p);
  if(currentPage==="admin")renderAdmin(p);
  if(currentPage==="feedback")renderFeedbacks(p);
}

function renderHome(p){
  const {credit,debit}=totals(todayTransactions()), balance=credit-debit;
  const today=dateText(todayKey());
  p.innerHTML=`<section class="hero">
    <div><div class="eyebrow">OVERVIEW · ${today}</div>
      <h1>Good ${new Date().getHours()<12?"Morning":new Date().getHours()<18?"Afternoon":"Evening"}<br>
      <strong class="home-user"><span class="home-user-avatar">${currentUser?.photoURL?`<img src="${esc(currentUser.photoURL)}" alt="">`:`${esc((currentUser?.displayName?.split(" ")[0]||"there").slice(0,1).toUpperCase())}`}</span>${esc(currentUser?.displayName?.split(" ")[0]||"there")}</strong> 👋</h1>
      <p>Small steps. Big results.</p>
    </div>
    <div class="floating-cube">₹<span>✦</span></div>
  </section>
  <section class="dashboard-grid">
    <article class="stat-card positive">
      <div class="stat-icon">↗</div><div class="label">POSITIVE</div>
      <strong>${money(credit)}</strong><small>Today's credits</small>
    </article>
    <article class="stat-card negative">
      <div class="stat-icon">↘</div><div class="label">NEGATIVE</div>
      <strong>${money(debit)}</strong><small>Today's debits</small>
    </article>
  </section>
  <article class="balance-card ${balance<0?"down":""}">
    <div class="balance-icon">▣</div><div>
      <div class="label">CURRENT BALANCE</div><strong>${money(balance)}</strong>
      <small>${balance>=0?"Today's remaining balance":"Watch today's spending"}</small>
    </div><div class="balance-arrow">${balance>=0?"↑":"↓"}</div>
  </article>
    <div class="quote">𓆩♛𓆪<br><b>MANIYA,<br></b></div>`;
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

function dailyRows(f,t){
  const dates=[];
  if(!f||!t||f>t)return dates;
  const cur=new Date(f+"T12:00:00"), end=new Date(t+"T12:00:00");
  while(cur<=end){
    const key=iso(cur);
    const day=transactions.filter(x=>x.date===key);
    const {credit,debit}=totals(day);
    dates.push({date:key,credit,debit,balance:credit-debit,count:day.length});
    cur.setDate(cur.getDate()+1);
  }
  return dates;
}

let downloadMode = "choose";

function renderDownload(p){
  if(downloadMode === "range"){
    renderDownloadRange(p);
    return;
  }

  const today=todayKey();
  p.innerHTML=`<section class="download-page">
    <div class="download-hero">
      <div class="download-icon">↓</div>
      <div class="eyebrow">EXPORT</div>
      <h2>Download Data</h2>
      <p>Choose how you want to download your transaction report.</p>
    </div>

    <section class="download-options glass">
      <button class="download-option selected" id="downloadTodayOption" type="button">
        <span class="download-option-icon">◷</span>
        <span class="download-option-copy"><b>Today</b><small>Download today's transactions</small></span>
        <span class="download-option-arrow">›</span>
      </button>
      <button class="download-option" id="downloadRangeOption" type="button">
        <span class="download-option-icon">▣</span>
        <span class="download-option-copy"><b>To – From</b><small>Select a custom date range</small></span>
        <span class="download-option-arrow">›</span>
      </button>
    </section>

    <button class="primary wide download-main-btn" id="downloadToday">↓&nbsp; Download</button>
    <p class="download-help">Today's report contains only transactions recorded today.</p>
  </section>`;

  document.getElementById("downloadRangeOption").onclick=()=>{
    downloadMode="range";
    renderPage();
  };

  document.getElementById("downloadToday").onclick=()=>{
    const rows=range(today,today);
    if(!rows.length)return toast("No transactions for today","error");
    downloadCsvReport(today,today,rows,"Today");
  };
}

function renderDownloadRange(p){
  const today=todayKey();
  p.innerHTML=`<section class="download-page download-range-page">
    <button class="download-back" id="downloadBack" type="button">←</button>
    <div class="download-hero">
      <div class="download-icon">▣</div>
      <div class="eyebrow">DATE RANGE</div>
      <h2>Select Date Range</h2>
      <p>Choose the start and end date for your transactions.</p>
    </div>

    <section class="download-date-card glass">
      <label>From Date<input id="downloadFrom" type="date"></label>
      <label>To Date<input id="downloadTo" type="date" value="${today}"></label>
      <div class="download-range-note"><span>i</span><div>Choose any date range to download the transactions recorded in that period.</div></div>
      <div id="downloadRangePreview" class="download-range-preview"></div>
    </section>

    <button class="primary wide download-main-btn" id="downloadRange">↓&nbsp; Download</button>
  </section>`;

  const f=document.getElementById("downloadFrom");
  const t=document.getElementById("downloadTo");
  const first=transactions.length?iso(new Date(Math.min(...transactions.map(x=>new Date(x.date).getTime())))):today;
  f.value=first;

  const preview=()=>{
    const valid=f.value&&t.value&&f.value<=t.value;
    const rows=valid?dailyRows(f.value,t.value):[];
    const selected=valid?range(f.value,t.value):[];
    const {credit,debit}=totals(selected);
    document.getElementById("downloadRangePreview").innerHTML=valid
      ? `<div><span>Selected range</span><b>${dateText(f.value)} – ${dateText(t.value)}</b></div><div><span>Transactions</span><b>${selected.length}</b></div><div><span>Remaining</span><b>${money(credit-debit)}</b></div>`
      : `<div class="invalid">Please select a valid From and To date.</div>`;
  };

  f.onchange=t.onchange=preview;
  preview();

  document.getElementById("downloadBack").onclick=()=>{
    downloadMode="choose";
    renderPage();
  };

  document.getElementById("downloadRange").onclick=()=>{
    if(!f.value||!t.value||f.value>t.value)return toast("Please select a valid date range","error");
    const rows=range(f.value,t.value);
    if(!rows.length)return toast("No transactions in this range","error");
    downloadCsvReport(f.value,t.value,rows,"Date Range");
  };
}

function downloadCsvReport(fromDate,toDate,rows,label){
  const daily=dailyRows(fromDate,toDate);
  const {credit,debit}=totals(rows);
  const generated=new Date().toLocaleString("en-IN");
  const csv=[
    ["MONEYFLOW TRANSACTION REPORT"],
    ["Report",label],
    ["From",fromDate,"To",toDate],
    ["Generated",generated],
    [],
    ["Date","Positive (₹)","Negative (₹)","Remaining (₹)"],
    ...daily.map(x=>[x.date,x.credit.toFixed(2),x.debit.toFixed(2),x.balance.toFixed(2)]),
    [],
    ["TOTAL",credit.toFixed(2),debit.toFixed(2),(credit-debit).toFixed(2)],
    [],
    ["TRANSACTION DETAILS"],
    ["Date","Type","Description","Amount (₹)"],
    ...rows.map(x=>[x.date,x.type==="credit"?"Positive":"Negative",x.note,Number(x.amount).toFixed(2)])
  ].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");

  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
  a.download=fromDate===toDate
    ? `moneyflow_${fromDate}.csv`
    : `moneyflow_${fromDate}_to_${toDate}.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("Report downloaded successfully","success");
}
function range(f,t){return transactions.filter(x=>x.date>=f&&x.date<=t).sort((a,b)=>b.date.localeCompare(a.date))}

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(!user){if(unsubscribe)unsubscribe();if(dailyTimer)clearTimeout(dailyTimer);dailyTimer=null;authView();return}
  currentPage="home"; shell();
  scheduleDailyRefresh();
  const q=query(collection(db,"users",user.uid,"transactions"),orderBy("date","desc"));
  unsubscribe=onSnapshot(q,s=>{transactions=s.docs.map(d=>({id:d.id,...d.data()}));renderPage()},e=>toast("Sync error: "+e.message,"error"));
});
