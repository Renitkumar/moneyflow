# MoneyFlow — 3D Glass Redesign

This version keeps the Firebase real-time backend and redesigns the frontend.

## Changes
- Light grey blurred animated background
- Glassmorphism / frosted-glass bottom navigation
- Rounded navigation corners
- 3D floating decorative element
- More rounded Positive, Negative and Current Balance cards
- Home page shows only Positive, Negative and Current Balance
- History/Add screen contains only the credit/debit entry form; transaction lists are not shown there
- Positive and Negative pages remain accessible from the bottom navigation
- Download page exports date-filtered CSV
- Firebase Authentication + Firestore real-time sync retained

## Deploy
Upload the files to your GitHub repository and Vercel will redeploy automatically.

Do not replace `firestore.rules` with public/test rules.

- Bottom navigation center item is now a large glass/3D `+` Add button.

## Latest navigation and motion
- Bottom navigation: Home, History, Add (+), Download, Log out.
- History has All / Positive / Negative filters.
- Add screen contains only Credit/Debit entry controls; transaction list is not shown there.
- Added visible 3D motion, glowing glass cards, animated background orbs, floating balance cards, and animated center + button.

- Fixed duplicate MoneyFlow header on secondary pages; the global top bar is now the only branding header.

- Added an animated liquid-glass lens that slides between Home, History, Add and Download on taps or left/right swipes.


## Admin panel (V6)

The admin panel is protected server-side with Firebase Admin SDK. It is not secured by a front-end-only password.

### Vercel environment variables required
Set these in Vercel Project Settings → Environment Variables:
- `ADMIN_UID` = the Firebase Auth UID of the admin account
- `FIREBASE_PROJECT_ID` = `moneyflow-9fe6e`
- `FIREBASE_CLIENT_EMAIL` = service account client email
- `FIREBASE_PRIVATE_KEY` = service account private key, preserving newlines (Vercel can store `\n` escapes)

The Firebase service-account values must NEVER be put in `firebase-config.js`, GitHub, or browser code.

### Admin features
- Admin Panel button appears only for the configured admin UID.
- View all registered users and their Positive, Negative and Balance totals.
- Search users.
- Open a user's transaction list.
- Delete an incorrect transaction; totals update automatically.
- Temporarily lock a user for 24 hours, or unlock them.
- Disable/enable Firebase Authentication.
- Permanently delete a user and their transaction data.
- The admin account itself cannot be modified by these controls.

The temporary lock is enforced by Firestore rules as well as shown in the admin UI.
