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
