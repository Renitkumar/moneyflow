# MoneyFlow Profile + Feedback Fix

This version fixes profile photo/name persistence and feedback sending/admin feedback retrieval.

Firebase setup required:
- Enable Cloud Storage for Firebase and create the default bucket.
- Deploy `storage.rules`.
- Deploy `firestore.rules`.
- Deploy the included `api/admin.js` to Vercel.

Cloud Storage currently requires the Firebase project to be on the Blaze pay-as-you-go plan.
