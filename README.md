# MoneyFlow — Real-time Credit/Debit Tracker

This is a responsive HTML/CSS/JavaScript money tracker designed to deploy on Vercel.

## Features
- Login + registration with Firebase Authentication
- Real-time Firestore transaction sync
- Positive/Credit total
- Negative/Debit total
- Current balance = credits - debits
- History page with separate Credit/Debit selection and inputs
- Download page with From/To date filters
- CSV report with Positive, Negative and Balance totals at the top
- 5 main options: Positive, Negative, History, Download, Log out
- Responsive mobile/desktop UI

## Firebase setup
1. Open Firebase Console.
2. Create a project.
3. Enable Authentication > Sign-in method > Email/Password.
4. Create Firestore Database.
5. Add a Web App.
6. Copy its config into `firebase-config.js`.
7. Apply the rules in `firestore.rules`.

## Vercel
Upload this folder to GitHub, import the repository into Vercel, and deploy. No build command is needed.

IMPORTANT: HTML/CSS/JS alone cannot provide secure multi-user real-time storage. Firebase is used as the backend/database, while Vercel hosts the frontend.

## Data structure
users/{uid}/transactions/{transactionId}

Each transaction:
- type: credit | debit
- amount: number
- note: string
- date: YYYY-MM-DD
- uid: Firebase Auth UID
- createdAt: Firestore server timestamp
