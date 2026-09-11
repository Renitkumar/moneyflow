import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const root = document.getElementById("app");
let currentUser = null;
let transactions = [];
let unsubscribe = null;
let currentPage = "home";

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const formatDate = d => new Date(d).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"});
const localISO = d => {
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  return new Date(x.getTime() - off*60000).toISOString().slice(0,10);
};

function toast(msg, type="info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function authView(mode="login") {
  const register = mode === "register";
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand-mark">₹</div>
        <h1>MoneyFlow</h1>
        <p class="muted">${register ? "Create your account" : "Track your money in real time"}</p>
        <form id="authForm">
          ${register ? `<input id="name" type="text" placeholder="Full name" required>` : ""}
          <input id="email" type="email" placeholder="Email address" required>
          <input id="password" type="password" placeholder="Password" minlength="6" required>
          <button class="primary wide" type="submit">${register ? "Create account" : "Login"}</button>
        </form>
        <button class="link-btn" id="switchAuth">${register ? "Already have an account? Login" : "New here? Create an account"}</button>
        <p class="tiny">Your transactions are stored per account in Firebase.</p>
      </section>
    </main>`;
  document.getElementById("switchAuth").onclick = () => authView(register ? "login" : "register");
  document.getElementById("authForm").onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    try {
      if (register) {
        const name = document.getElementById("name").value.trim();
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, {displayName: name});
        toast("Account created!", "success");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      toast(err.message.replace("Firebase: ", ""), "error");
    }
  };
}

function shell() {
  const positive = transactions.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0);
  const negative = transactions.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0);
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="logo">₹ MoneyFlow</div>
          <div class="tiny">Live account tracker</div>
        </div>
        <div class="user-chip">${esc(currentUser?.displayName || currentUser?.email || "User")}</div>
      </header>
      <main class="content">
        <section id="page"></section>
      </main>
      <nav class="bottom-nav">
        <button data-page="home" class="${currentPage==="home"?"active":""}"><span>⌂</span>Positive</button>
        <button data-page="negative" class="${currentPage==="negative"?"active":""}"><span>−</span>Negative</button>
        <button data-page="history" class="${currentPage==="history"?"active":""}"><span>↕</span>History</button>
        <button data-page="download" class="${currentPage==="download"?"active":""}"><span>↓</span>Download</button>
        <button id="logout"><span>↪</span>Log out</button>
      </nav>
    </div>`;
  document.querySelectorAll("[data-page]").forEach(b => b.onclick = () => { currentPage=b.dataset.page; renderPage(); });
  document.getElementById("logout").onclick = async () => {
    if (unsubscribe) unsubscribe();
    await signOut(auth);
  };
  renderPage();
}

function renderPage() {
  const page = document.getElementById("page");
  if (!page) return;
  if (currentPage==="home") renderHome(page);
  if (currentPage==="negative") renderNegative(page);
  if (currentPage==="history") renderHistory(page);
  if (currentPage==="download") renderDownload(page);
  document.querySelectorAll(".bottom-nav button[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page===currentPage));
}

function renderHome(page) {
  const credit = transactions.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0);
  const debit = transactions.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0);
  page.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">OVERVIEW</p><h2>Money dashboard</h2></div><span class="live-dot">● Live</span></div>
    <section class="balance-grid">
      <article class="balance-card positive-card"><div class="card-label">POSITIVE / CREDIT</div><div class="amount">${money(credit)}</div><div class="sub">Total money received</div></article>
      <article class="balance-card negative-card"><div class="card-label">NEGATIVE / DEBIT</div><div class="amount">${money(debit)}</div><div class="sub">Total money spent</div></article>
    </section>
    <article class="net-card">
      <div><div class="card-label">CURRENT BALANCE</div><div class="net">${money(credit-debit)}</div></div>
      <div class="net-symbol">${credit-debit>=0 ? "↑" : "↓"}</div>
    </article>
    <div class="quick-grid">
      <button class="quick" id="addCredit"><b>＋ Credit</b><span>Add money received</span></button>
      <button class="quick" id="addDebit"><b>＋ Debit</b><span>Add money spent</span></button>
    </div>
    <section class="recent"><div class="section-title"><h3>Recent transactions</h3><button class="text-btn" id="seeHistory">View all</button></div>
      ${transactionList(transactions.slice(0,5))}
    </section>`;
  document.getElementById("addCredit").onclick=()=>openTransaction("credit");
  document.getElementById("addDebit").onclick=()=>openTransaction("debit");
  document.getElementById("seeHistory").onclick=()=>{currentPage="history";renderPage();};
}

function renderNegative(page) {
  const debits = transactions.filter(t=>t.type==="debit");
  page.innerHTML = `<div class="page-head"><div><p class="eyebrow">NEGATIVE</p><h2>Money spent</h2></div><button class="primary" id="addDebit2">＋ Add debit</button></div>
    <div class="summary-strip"><span>Total debit</span><b>${money(debits.reduce((a,t)=>a+Number(t.amount),0))}</b></div>
    ${transactionList(debits)}`;
  document.getElementById("addDebit2").onclick=()=>openTransaction("debit");
}

function renderHistory(page) {
  page.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">HISTORY</p><h2>Credit & Debit</h2></div></div>
    <section class="history-form">
      <div class="type-tabs"><button class="type-tab active" data-type="credit">CREDIT<br><small>Money received</small></button><button class="type-tab" data-type="debit">DEBIT<br><small>Money spent</small></button></div>
      <form id="txForm">
        <input type="hidden" id="txType" value="credit">
        <label>Amount (₹)<input id="txAmount" type="number" min="0.01" step="0.01" placeholder="e.g. 1500" required></label>
        <label>What is it for?<input id="txNote" type="text" maxlength="120" placeholder="Salary, food, travel..." required></label>
        <label>Date<input id="txDate" type="date" value="${localISO(new Date())}" required></label>
        <button class="primary wide" type="submit">Save transaction</button>
      </form>
    </section>
    <div class="section-title"><h3>All transactions</h3><span class="tiny">${transactions.length} records</span></div>
    ${transactionList(transactions)}`;
  document.querySelectorAll(".type-tab").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".type-tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); document.getElementById("txType").value=btn.dataset.type;
  });
  document.getElementById("txForm").onsubmit=async e=>{
    e.preventDefault();
    const amount=Number(document.getElementById("txAmount").value);
    const note=document.getElementById("txNote").value.trim();
    const date=document.getElementById("txDate").value;
    const type=document.getElementById("txType").value;
    try {
      await addDoc(collection(db,"users",currentUser.uid,"transactions"), {
        type, amount, note, date, createdAt: serverTimestamp(), uid: currentUser.uid
      });
      e.target.reset(); document.getElementById("txDate").value=localISO(new Date()); 
      toast(`${type==="credit"?"Credit":"Debit"} added`, "success");
    } catch(err) { toast(err.message, "error"); }
  };
}

function openTransaction(type) {
  currentPage="history"; renderPage();
  setTimeout(()=>{
    document.getElementById("txType").value=type;
    document.querySelectorAll(".type-tab").forEach(x=>x.classList.toggle("active",x.dataset.type===type));
    document.getElementById("txAmount")?.focus();
  }, 0);
}

function transactionList(list) {
  if (!list.length) return `<div class="empty"><div>₹</div><h3>No transactions yet</h3><p>Add a credit or debit to start your history.</p></div>`;
  return `<div class="tx-list">${list.map(t=>`
    <div class="tx">
      <div class="tx-icon ${t.type}">${t.type==="credit"?"↑":"↓"}</div>
      <div class="tx-main"><b>${esc(t.note)}</b><span>${formatDate(t.date)}</span></div>
      <strong class="${t.type}">${t.type==="credit"?"+":"−"}${money(t.amount)}</strong>
    </div>`).join("")}</div>`;
}

function renderDownload(page) {
  page.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">EXPORT</p><h2>Download report</h2></div></div>
    <section class="download-card">
      <p class="muted">Select the date range. The downloaded CSV will contain your credit/debit list and totals at the top.</p>
      <div class="date-grid"><label>From<input id="fromDate" type="date"></label><label>To<input id="toDate" type="date" value="${localISO(new Date())}"></label></div>
      <button class="primary wide" id="downloadBtn">↓ Download CSV</button>
    </section>
    <div class="download-preview" id="preview"></div>`;
  const from=document.getElementById("fromDate");
  const to=document.getElementById("toDate");
  from.value = transactions.length ? localISO(new Date(Math.min(...transactions.map(t=>new Date(t.date).getTime())))) : localISO(new Date());
  const preview=()=>{
    const rows=filterRange(from.value,to.value);
    const c=rows.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0);
    const d=rows.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0);
    document.getElementById("preview").innerHTML=`<div class="summary-strip"><span>Positive ${money(c)}</span><span>Negative ${money(d)}</span><b>Balance ${money(c-d)}</b></div><p class="tiny">${rows.length} transactions selected</p>`;
  };
  from.onchange=to.onchange=preview; preview();
  document.getElementById("downloadBtn").onclick=()=>{
    const rows=filterRange(from.value,to.value);
    if(!rows.length) return toast("No transactions in this date range","error");
    const c=rows.filter(t=>t.type==="credit").reduce((a,t)=>a+Number(t.amount),0);
    const d=rows.filter(t=>t.type==="debit").reduce((a,t)=>a+Number(t.amount),0);
    const csv = [
      ["MONEYFLOW REPORT"],["Positive / Credit",c],["Negative / Debit",d],["Balance",c-d],[],
      ["Date","Type","Description","Amount (₹)"],
      ...rows.map(t=>[t.date,t.type==="credit"?"Credit":"Debit",t.note,Number(t.amount).toFixed(2)])
    ].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`moneyflow_${from.value}_to_${to.value}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
}

function filterRange(from,to) {
  return transactions.filter(t=>t.date>=from && t.date<=to).sort((a,b)=>b.date.localeCompare(a.date));
}

onAuthStateChanged(auth, user => {
  currentUser=user;
  if (!user) { if(unsubscribe) unsubscribe(); authView(); return; }
  currentPage="home";
  shell();
  const q=query(collection(db,"users",user.uid,"transactions"), orderBy("date","desc"));
  unsubscribe=onSnapshot(q, snap=>{
    transactions=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderPage();
  }, err=>toast("Could not sync data: "+err.message,"error"));
});