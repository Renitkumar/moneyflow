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
