# MoneyFlow V9 — Admin User Reports

V9 base with the existing Firebase/Auth/Firestore/admin functionality plus:
- Admin can open any user's transactions.
- A **Download Report** button appears in the user's transaction section.
- Admin can choose **One date** or **Date range**.
- Export is day-wise and keeps Positive and Negative transactions in separate columns with their descriptions/source.
- Each day has a daily total and the report ends with overall Positive, Negative and Net Balance totals.

Vercel server-side admin environment variables remain unchanged.
