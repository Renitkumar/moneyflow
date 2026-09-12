const admin = require("firebase-admin");

function getAdminApp(){
  if(admin.apps.length) return admin.app();
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
  if(!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey)
    throw new Error("Firebase Admin environment variables are not configured in Vercel.");
  return admin.initializeApp({credential:admin.credential.cert(serviceAccount)});
}

function json(res,status,body){res.status(status).json(body)}
function isAdmin(decoded){
  return !!process.env.ADMIN_UID && decoded.uid === process.env.ADMIN_UID;
}

async function verify(req){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer "))throw new Error("Missing authentication token.");
  const app=getAdminApp();
  const decoded=await admin.auth(app).verifyIdToken(h.slice(7));
  if(!isAdmin(decoded))throw new Error("Admin access denied.");
  return {app,decoded};
}

async function totalsFor(app,uid){
  const snap=await admin.firestore(app).collection("users").doc(uid).collection("transactions").get();
  let credit=0,debit=0;
  snap.forEach(d=>{const x=d.data();if(x.type==="credit")credit+=Number(x.amount||0);if(x.type==="debit")debit+=Number(x.amount||0)});
  return {credit,debit,balance:credit-debit};
}

module.exports = async (req,res)=>{
  try{
    if(req.method!=="POST")return json(res,405,{error:"POST required"});
    const {app}=await verify(req);
    const action=req.query.action;
    const body=req.body||{};
    const db=admin.firestore(app);

    if(action==="me")return json(res,200,{isAdmin:true});
    if(action==="users"){
      const list=await admin.auth(app).listUsers(1000);
      const users=[];
      for(const u of list.users){
        const t=await totalsFor(app,u.uid);
        const profile=(await db.collection("users").doc(u.uid).get()).data()||{};
        const locked=profile.lockedUntil && profile.lockedUntil.toMillis()>Date.now();
        users.push({uid:u.uid,email:u.email||"",displayName:u.displayName||"",disabled:u.disabled,locked:!!locked,...t});
      }
      return json(res,200,{users});
    }

    const uid=String(body.uid||"");
    if(!uid)throw new Error("User UID is required.");
    if(uid===process.env.ADMIN_UID && action!=="transactions" && action!=="deleteTransaction")
      throw new Error("The admin account cannot be modified.");

    if(action==="transactions"){
      const snap=await db.collection("users").doc(uid).collection("transactions").orderBy("date","desc").get();
      return json(res,200,{transactions:snap.docs.map(d=>({id:d.id,...d.data()}))});
    }
    if(action==="deleteTransaction"){
      if(!body.transactionId)throw new Error("Transaction ID is required.");
      if(uid===process.env.ADMIN_UID){
        const expected=String(process.env.ADMIN_SELF_DELETE_PASSCODE||"");
        if(!expected)throw new Error("Admin self-delete passcode is not configured.");
        if(String(body.passcode||"")!==expected)throw new Error("Invalid admin self-delete passcode.");
      }
      await db.collection("users").doc(uid).collection("transactions").doc(body.transactionId).delete();
      return json(res,200,{ok:true});
    }
    if(action==="disableUser"){await admin.auth(app).updateUser(uid,{disabled:true});return json(res,200,{ok:true})}
    if(action==="enableUser"){await admin.auth(app).updateUser(uid,{disabled:false});return json(res,200,{ok:true})}
    if(action==="lockUser"){
      await db.collection("users").doc(uid).set({lockedUntil:admin.firestore.Timestamp.fromMillis(Date.now()+24*60*60*1000)},{merge:true});
      return json(res,200,{ok:true,lockedForHours:24});
    }
    if(action==="unlockUser"){
      await db.collection("users").doc(uid).set({lockedUntil:null},{merge:true});
      return json(res,200,{ok:true});
    }
    if(action==="deleteUser"){
      await db.recursiveDelete(db.collection("users").doc(uid));
      await admin.auth(app).deleteUser(uid);
      return json(res,200,{ok:true});
    }
    throw new Error("Unknown admin action.");
  }catch(e){
    console.error(e);
    return json(res,e.message==="Admin access denied."?403:400,{error:e.message||"Server error"});
  }
};
