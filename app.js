import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, getIdToken } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById("app");
let currentUser = null, transactions = [], unsubscribe = null, currentPage = "home", dailyTimer = null;

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
        await setDoc(doc(db,"users",c.user.uid),{displayName:name,lockedUntil:null},{merge:true});
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
        <div class="user-chip">${esc(currentUser?.displayName||currentUser?.email||"User")}</div>
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
  lens.style.borderRadius="20px";
  lens.style.transition="transform .45s cubic-bezier(.16,1,.3,1),height .2s ease";
  lens.style.transform=`translate3d(${ar.left-nr.left}px,${ar.top-nr.top}px,0) scaleX(1) scaleY(1)`;
}

function setupLiquidNavigation(){
  const nav=document.getElementById("bottomNav"), lens=document.getElementById("liquidLens");
  if(!nav || !lens)return;
  const pages=["home","history","add","download"];
  let dragging=false,moved=false,pointerId=null,startX=0,startY=0,startIndex=0;
  let ignoreClickUntil=0;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const buttons=()=>pages.map(p=>nav.querySelector(`[data-page="${p}"]`)).filter(Boolean);

  function placeLens(index,animate=true){
    const bs=buttons(); if(!bs.length)return;
    index=clamp(index,0,bs.length-1);
    const b=bs[index],nr=nav.getBoundingClientRect(),br=b.getBoundingClientRect();
    lens.style.width=`${br.width}px`;
    lens.style.height=`${br.height}px`;
    lens.style.borderRadius="20px";
    lens.style.transition=animate?"transform .45s cubic-bezier(.16,1,.3,1),height .2s ease":"none";
    lens.style.transform=`translate3d(${br.left-nr.left}px,${br.top-nr.top}px,0) scaleX(1) scaleY(1)`;
  }

  function paintLens(centerX,heightScale=1){
    const base=buttons()[startIndex]; if(!base)return;
    const nr=nav.getBoundingClientRect(),br=base.getBoundingClientRect();
    const h=br.height*heightScale;
    const left=clamp(centerX-nr.left-br.width/2,6,nr.width-br.width-6);
    lens.style.width=`${br.width}px`;                 // WIDTH NEVER CHANGES
    lens.style.height=`${h}px`;                       // HEIGHT stretches only
    lens.style.borderRadius="20px";
    lens.style.transition="none";
    lens.style.transform=`translate3d(${left}px,${br.top-nr.top-(h-br.height)/2}px,0) scaleX(1) scaleY(1)`;
  }

  function nearestIndexFromX(x){
    let best=0,dist=Infinity;
    buttons().forEach((b,i)=>{const r=b.getBoundingClientRect(),d=Math.abs(x-(r.left+r.width/2));if(d<dist){dist=d;best=i;}});
    return best;
  }

  function openPage(index){
    currentPage=pages[clamp(index,0,pages.length-1)];
    renderPage();
  }

  // Normal click/tap always opens the selected page.
  nav.addEventListener("click",e=>{
    const button=e.target.closest?.("[data-page]");
    if(!button)return;
    if(performance.now()<ignoreClickUntil){e.preventDefault();e.stopPropagation();return;}
    const i=pages.indexOf(button.dataset.page);
    if(i>=0)openPage(i);
  });

  nav.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse" && e.button!==0)return;
    const button=e.target.closest?.("[data-page]");
    if(!button)return;
    const i=pages.indexOf(button.dataset.page); if(i<0)return;
    const r=button.getBoundingClientRect();
    dragging=true;moved=false;pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;startIndex=i;
    nav.classList.add("swiping","dragging");
    paintLens(r.left+r.width/2,1);
  });

  function move(e){
    if(!dragging || e.pointerId!==pointerId)return;
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if(!moved){
      if(Math.abs(dx)<8)return;
      if(Math.abs(dx)<Math.abs(dy)*0.7)return;
      moved=true;
    }
    e.preventDefault();
    const travel=Math.abs(dx);
    const heightScale=1+Math.min(.10,(travel/180)*.10); // max +10% height
    const base=buttons()[startIndex]; if(!base)return;
    paintLens(base.getBoundingClientRect().left+base.getBoundingClientRect().width/2+dx,heightScale);
  }

  function end(e){
    if(!dragging || e.pointerId!==pointerId)return;
    const wasMoved=moved;
    dragging=false;nav.classList.remove("swiping","dragging");
    if(wasMoved){
      e.preventDefault();
      ignoreClickUntil=performance.now()+350;
      // IMPORTANT: choose the page from the ACTUAL release position.
      openPage(nearestIndexFromX(e.clientX));
    }
    moved=false;pointerId=null;
    requestAnimationFrame(()=>placeLens(pages.indexOf(currentPage),true));
  }

  // Listen on the document so release still works even if the finger leaves the bar.
  document.addEventListener("pointermove",move,{passive:false});
  document.addEventListener("pointerup",end,{passive:false});
  document.addEventListener("pointercancel",end,{passive:false});
  window.addEventListener("resize",()=>requestAnimationFrame(()=>placeLens(pages.indexOf(currentPage),false)));
  requestAnimationFrame(()=>placeLens(pages.indexOf(currentPage),false));
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

function renderPage(){
  const p=document.getElementById("page"); if(!p)return;
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage));
  requestAnimationFrame(updateLiquidLens);
  if(currentPage==="home")renderHome(p);
  if(currentPage==="history")renderHistory(p);
  if(currentPage==="add")renderAdd(p);
  if(currentPage==="download")renderDownload(p);
  if(currentPage==="admin")renderAdmin(p);
}

function renderHome(p){
  const {credit,debit}=totals(todayTransactions()), balance=credit-debit;
  const today=dateText(todayKey());
  p.innerHTML=`<section class="hero">
    <div><div class="eyebrow">OVERVIEW · ${today}</div>
      <h1>Good ${new Date().getHours()<12?"Morning":new Date().getHours()<18?"Afternoon":"Evening"}<br>
      <strong>${esc(currentUser?.displayName?.split(" ")[0]||"there")}</strong> 👋</h1>
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
`;
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

function renderDownload(p){
  p.innerHTML=`<div class="page-head">
    <div><div class="eyebrow">EXPORT</div><h2>Download report</h2><p class="muted">Create a day-wise Positive / Negative report.</p></div>
  </div>
  <section class="download-card glass"><p class="muted">Select dates. The downloaded report keeps each day separate instead of mixing the whole range.</p>
    <div class="input-grid"><label>From<input id="from" type="date"></label><label>To<input id="to" type="date" value="${iso(new Date())}"></label></div>
    <div id="preview"></div><button class="primary wide" id="download">↓ Download Daily Report</button>
  </section>`;
  const f=document.getElementById("from"),t=document.getElementById("to");
  f.value=transactions.length?iso(new Date(Math.min(...transactions.map(x=>new Date(x.date).getTime())))):iso(new Date());
  const preview=()=>{
    const rows=dailyRows(f.value,t.value);
    const c=rows.reduce((a,x)=>a+x.credit,0),d=rows.reduce((a,x)=>a+x.debit,0),count=rows.reduce((a,x)=>a+x.count,0);
    document.getElementById("preview").innerHTML=`<div class="report-total"><span>Positive<b>${money(c)}</b></span><span>Negative<b>${money(d)}</b></span><span>Remaining<b>${money(c-d)}</b></span></div>
      <div class="daily-preview">${rows.slice(-7).reverse().map(x=>`<div><b>${dateText(x.date)}</b><span class="positive-text">+${money(x.credit)}</span><span class="negative-text">−${money(x.debit)}</span><strong>${money(x.balance)}</strong></div>`).join("")}${rows.length>7?`<small>Showing latest 7 days in preview · ${rows.length} days in the report</small>`:""}</div>
      <small>${count} transactions across ${rows.length} day${rows.length===1?"":"s"}</small>`;
  };
  f.onchange=t.onchange=preview; preview();
  document.getElementById("download").onclick=()=>{
    const rows=dailyRows(f.value,t.value);
    const r=range(f.value,t.value);
    if(!r.length)return toast("No transactions in this range","error");
    const totalC=rows.reduce((a,x)=>a+x.credit,0),totalD=rows.reduce((a,x)=>a+x.debit,0);
    const generated=new Date().toLocaleString("en-IN");
    const csv=[
      ["MONEYFLOW DAILY REPORT"],
      ["From",f.value,"To",t.value],
      ["Generated",generated],
      [],
      ["Date","Positive (₹)","Negative (₹)","Remaining (₹)"],
      ...rows.map(x=>[x.date,x.credit.toFixed(2),x.debit.toFixed(2),x.balance.toFixed(2)]),
      [],
      ["TOTAL",totalC.toFixed(2),totalD.toFixed(2),(totalC-totalD).toFixed(2)],
      [],
      ["TRANSACTION DETAILS"],
      ["Date","Type","Description","Amount (₹)"],
      ...r.map(x=>[x.date,x.type==="credit"?"Positive":"Negative",x.note,Number(x.amount).toFixed(2)])
    ].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
    a.download=`moneyflow_daily_${f.value}_to_${t.value}.csv`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
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