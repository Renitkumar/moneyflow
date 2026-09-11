import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById("app");
let currentUser = null, transactions = [], unsubscribe = null, currentPage = "home";

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
      <button class="link-btn" id="switch">${register?"Already have an account? Login":"New here? Create an account"}</button>
      <small>Your financial data is stored securely per account.</small>
    </section>
  </main>`;
  document.getElementById("switch").onclick=()=>authView(register?"login":"register");
  document.getElementById("authForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const email=document.getElementById("email").value.trim(), password=document.getElementById("password").value;
      if(register){
        const name=document.getElementById("name").value.trim();
        const c=await createUserWithEmailAndPassword(auth,email,password);
        await updateProfile(c.user,{displayName:name});
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
  root.innerHTML=`<div class="app-shell">
    <header class="topbar glass">
      <div class="brand"><span>₹</span><div><b>MoneyFlow</b><small>Track Today, Build Tomorrow</small></div></div>
      <div class="user-chip">${esc(currentUser?.displayName||currentUser?.email||"User")}</div>
    </header>
    <main class="content"><section id="page"></section></main>
    <nav class="bottom-nav glass">
      <button data-page="positive"><i>↗</i><span>Positive</span></button>
      <button data-page="negative"><i>↘</i><span>Negative</span></button>
      <button data-page="history" class="add-nav"><i>＋</i><span>Add</span></button>
      <button data-page="download"><i>↓</i><span>Download</span></button>
      <button id="logout"><i>↪</i><span>Log out</span></button>
    </nav>
  </div>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{currentPage=b.dataset.page;renderPage()});
  document.getElementById("logout").onclick=()=>signOut(auth);
  renderPage();
}

function renderPage(){
  const p=document.getElementById("page"); if(!p)return;
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage));
  if(currentPage==="home")renderHome(p);
  if(currentPage==="positive")renderPositive(p);
  if(currentPage==="negative")renderNegative(p);
  if(currentPage==="history")renderHistory(p);
  if(currentPage==="download")renderDownload(p);
}

function renderHome(p){
  const {credit,debit}=totals(), balance=credit-debit;
  p.innerHTML=`<section class="hero">
    <div><div class="eyebrow">OVERVIEW</div>
      <h1>Good ${new Date().getHours()<12?"Morning":new Date().getHours()<18?"Afternoon":"Evening"}<br>
      <strong>${esc(currentUser?.displayName?.split(" ")[0]||"there")}</strong> 👋</h1>
      <p>Small steps. Big results.</p>
    </div>
    <div class="floating-cube">₹<span>✦</span></div>
  </section>
  <section class="dashboard-grid">
    <article class="stat-card positive">
      <div class="stat-icon">↗</div><div class="label">POSITIVE</div>
      <strong>${money(credit)}</strong><small>Total credits</small>
    </article>
    <article class="stat-card negative">
      <div class="stat-icon">↘</div><div class="label">NEGATIVE</div>
      <strong>${money(debit)}</strong><small>Total debits</small>
    </article>
  </section>
  <article class="balance-card ${balance<0?"down":""}">
    <div class="balance-icon">▣</div><div>
      <div class="label">CURRENT BALANCE</div><strong>${money(balance)}</strong>
      <small>${balance>=0?"You're on track":"Watch your spending"}</small>
    </div><div class="balance-arrow">${balance>=0?"↑":"↓"}</div>
  </article>
  <div class="quote">✦<br><b>Discipline today,<br>financial freedom tomorrow.</b></div>`;
}

function renderPositive(p){
  const rows=transactions.filter(t=>t.type==="credit"), total=rows.reduce((a,t)=>a+Number(t.amount),0);
  p.innerHTML=`<div class="page-head"><div><div class="eyebrow">POSITIVE</div><h2>Money received</h2></div><button class="primary" id="addC">＋ Credit</button></div>
  <div class="summary-strip positive-text"><span>Total positive</span><b>${money(total)}</b></div>${list(rows)}`;
  document.getElementById("addC").onclick=()=>openTx("credit");
}

function renderNegative(p){
  const rows=transactions.filter(t=>t.type==="debit"), total=rows.reduce((a,t)=>a+Number(t.amount),0);
  p.innerHTML=`<div class="page-head"><div><div class="eyebrow">NEGATIVE</div><h2>Money spent</h2></div><button class="primary" id="addD">＋ Debit</button></div>
  <div class="summary-strip negative-text"><span>Total negative</span><b>${money(total)}</b></div>${list(rows)}`;
  document.getElementById("addD").onclick=()=>openTx("debit");
}

function renderHistory(p){
  p.innerHTML=`<div class="page-head">
    <div><div class="eyebrow">ADD TRANSACTION</div><h2>Add Credit / Debit</h2>
    <p class="muted">Choose one and record your money movement.</p></div>
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
  <div class="add-hint glass">
    <span>✦</span><div><b>Real-time sync</b><small>Your saved transaction instantly updates your Positive, Negative and Balance totals.</small></div>
  </div>`;

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
        type,
        amount:Number(document.getElementById("txAmount").value),
        note:document.getElementById("txNote").value.trim(),
        date:document.getElementById("txDate").value,
        uid:currentUser.uid,
        createdAt:serverTimestamp()
      });
      e.target.reset();
      document.getElementById("txDate").value=iso(new Date());
      toast(type==="credit"?"Credit added":"Debit added","success");
    }catch(err){toast(err.message,"error")}
  };
}

function openTx(type){
  currentPage="history"; renderPage();
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
  p.innerHTML=`<div class="page-head"><div><div class="eyebrow">EXPORT</div><h2>Download report</h2></div></div>
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