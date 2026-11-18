## Chat assistant setup

The `/chat` page requires a signed-in account and uses Gemini's free API tier. Create an API key in Google AI Studio and set `GEMINI_API_KEY` in the local environment and Vercel project settings. Keep the Google project on the free tier (do not enable billing) to avoid paid model usage. Free-tier requests have provider quotas and provider terms may change.

Chat conversations, including submitted code and prompts, are saved in MongoDB to support follow-up turns and are private to the account that created them. Users can delete saved conversations. Gemini's free tier may use submitted content to improve Google's products; the chat page displays this before sending.
