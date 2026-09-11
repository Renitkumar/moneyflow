const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };

  if (
    !serviceAccount.projectId ||
    !serviceAccount.clientEmail ||
    !serviceAccount.privateKey
  ) {
    throw new Error(
      "Firebase Admin environment variables are not configured in Vercel."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function json(res, status, body) {
  res.status(status).json(body);
}

function isAdmin(decoded) {
  return !!process.env.ADMIN_UID && decoded.uid === process.env.ADMIN_UID;
}

async function verify(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authentication token.");
  }

  const app = getAdminApp();

  const decoded = await admin
    .auth(app)
    .verifyIdToken(authHeader.slice(7));

  if (!isAdmin(decoded)) {
    throw new Error("Admin access denied.");
  }

  return { app, decoded };
}

async function totalsFor(app, uid) {
  const snap = await admin
    .firestore(app)
    .collection("users")
    .doc(uid)
    .collection("transactions")
    .get();

  let credit = 0;
  let debit = 0;

  snap.forEach((doc) => {
    const data = doc.data();

    if (data.type === "credit") {
      credit += Number(data.amount || 0);
    }

    if (data.type === "debit") {
      debit += Number(data.amount || 0);
    }
  });

  return {
    credit,
    debit,
    balance: credit - debit
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, {
        error: "POST required"
      });
    }

    const { app } = await verify(req);

    const action = req.query.action;
    const body = req.body || {};
    const db = admin.firestore(app);

    // Check admin
    if (action === "me") {
      return json(res, 200, {
        isAdmin: true
      });
    }

    // Get all users
    if (action === "users") {
      const list = await admin.auth(app).listUsers(1000);

      const users = [];

      for (const user of list.users) {
        const totals = await totalsFor(app, user.uid);

        const profileSnapshot = await db
          .collection("users")
          .doc(user.uid)
          .get();

        const profile = profileSnapshot.exists
          ? profileSnapshot.data()
          : {};

        const locked =
          profile.lockedUntil &&
          profile.lockedUntil.toMillis() > Date.now();

        users.push({
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          disabled: user.disabled,
          locked: !!locked,
          ...totals
        });
      }

      return json(res, 200, {
        users
      });
    }

    const uid = String(body.uid || "");

    if (!uid) {
      throw new Error("User UID is required.");
    }



    // Get transactions
    if (action === "transactions") {
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .orderBy("date", "desc")
        .get();

      return json(res, 200, {
        transactions: snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))
      });
    }

    // Delete transaction
    if (action === "deleteTransaction") {
      if (!body.transactionId) {
        throw new Error("Transaction ID is required.");
      }
      if (uid === process.env.ADMIN_UID) {
  const expected = String(
    process.env.ADMIN_SELF_DELETE_PASSCODE || ""
  );

  if (!expected) {
    throw new Error(
      "Admin self-delete passcode is not configured."
    );
  }

  if (String(body.passcode || "") !== expected) {
    throw new Error("Invalid admin self-delete passcode.");
  }
}

      await db
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .doc(body.transactionId)
        .delete();

      return json(res, 200, {
        ok: true
      });
    }

    // Disable user
    if (action === "disableUser") {
      await admin.auth(app).updateUser(uid, {
        disabled: true
      });

      return json(res, 200, {
        ok: true
      });
    }

    // Enable user
    if (action === "enableUser") {
      await admin.auth(app).updateUser(uid, {
        disabled: false
      });

      return json(res, 200, {
        ok: true
      });
    }

    // Lock user for 24 hours
    if (action === "lockUser") {
      await db
        .collection("users")
        .doc(uid)
        .set(
          {
            lockedUntil: admin.firestore.Timestamp.fromMillis(
              Date.now() + 24 * 60 * 60 * 1000
            )
          },
          {
            merge: true
          }
        );

      return json(res, 200, {
        ok: true,
        lockedForHours: 24
      });
    }

    // Unlock user
    if (action === "unlockUser") {
      await db
        .collection("users")
        .doc(uid)
        .set(
          {
            lockedUntil: null
          },
          {
            merge: true
          }
        );

      return json(res, 200, {
        ok: true
      });
    }

    // Delete user completely
    if (action === "deleteUser") {
      await db.recursiveDelete(
        db.collection("users").doc(uid)
      );

      await admin.auth(app).deleteUser(uid);

      return json(res, 200, {
        ok: true
      });
    }

    throw new Error("Unknown admin action.");
  } catch (error) {
    console.error(error);

    return json(
      res,
      error.message === "Admin access denied." ? 403 : 400,
      {
        error: error.message || "Server error"
      }
    );
  }
};
