# Toxic Friend Admin Page

Single-page dashboard to review login names and feedback submitted via the Toxic Friend backend.

## Setup

1. Serve this folder with any static server (e.g. `npx serve "admin page website"`).
2. Make sure the Flask backend is running and accessible.
3. Open `index.html` in a browser.

### API URL

- Use the `API Base URL` field at the top-right to point the dashboard to your backend (e.g. `https://toxic-friend-backend.onrender.com`).
- The value is saved to `localStorage` (`adminDashboardApiUrl`) so you only need to set it once per browser.
- Optionally, define `window.__TOXIC_FRIEND_API_URL__` in a separate script before `app.js` to provide a default.

## Features

- **Recent Logins**: shows every stored name with timestamp.
- **Feedback**: displays rating, message, and submission time.
- Manual refresh buttons for both sections and contextual toasts for success/error states.

