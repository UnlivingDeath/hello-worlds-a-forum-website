## Deploy to Vercel

Set the Vercel project root to this directory (`forum-app`) because it contains
`vercel.json` and `api/index.js`.

Add these Production environment variables in Vercel:

- `MONGODB_URI`: MongoDB connection string, including its database name.
- `SESSION_SECRET`: long random secret.
- `NODE_ENV`: `production`.

Allow Vercel to reach MongoDB Atlas. Vercel Serverless Functions do not use
your local machine's public IP. Use Vercel Static IPs if your plan supports
them, or allow `0.0.0.0/0` in Atlas and protect the database with a dedicated
least-privilege user and a strong password.

Redeploy after changing the Atlas Network Access list or Vercel variables.

The Vercel handler connects once per warm function and reuses that MongoDB
client for both Mongoose and session storage. Failed connections return HTTP
503 within five seconds instead of hanging until the function times out.
