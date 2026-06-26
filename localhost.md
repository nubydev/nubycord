# Running Nubycord on Localhost — Full Setup Guide

This guide walks you through every single step needed to run Nubycord on your own Windows, Mac, or Linux machine, even if you have never run a Node.js app before.

---

## What You Will Need

| Requirement | Details |
|---|---|
| **Node.js** | Version 18 or higher. Download from [nodejs.org](https://nodejs.org) — use the LTS version |
| **npm** | Comes bundled with Node.js automatically |
| **Supabase account** | Free. Sign up at [supabase.com](https://supabase.com) |
| **A terminal / command prompt** | Terminal on Mac/Linux, Command Prompt or PowerShell on Windows |
| **A code editor** | Optional but helpful — [VS Code](https://code.visualstudio.com/) is recommended |

---

## Step 1 — Verify Node.js is Installed

Open a terminal and run these two commands to confirm Node and npm are installed:

```
node --version
npm --version
```

You should see version numbers like `v20.x.x` and `10.x.x`. If you see an error like "command not found", go to [nodejs.org](https://nodejs.org), download the installer for your OS, and run it. Then reopen your terminal and try again.

---

## Step 2 — Get the Project Files

**Option A — Download as a ZIP:**
1. Download the project as a ZIP file
2. Extract it anywhere on your machine (e.g. your Desktop or Documents folder)
3. Open your terminal and navigate into the extracted folder:
   ```
   cd path/to/nubycord
   ```

**Option B — Clone with Git (if you have Git installed):**
```
git clone <your-repo-url>
cd nubycord
```

To confirm you are in the right folder, run `ls` (Mac/Linux) or `dir` (Windows). You should see `app.js` listed.

---

## Step 3 — Install All Dependencies

While inside the project folder in your terminal, run:

```
npm install
```

This reads the `package.json` file and downloads all required packages into a `node_modules` folder. It may take 30–60 seconds. You will see a progress log — this is normal.

---

## Step 4 — Create Your Supabase Project

If you do not already have a Supabase project, follow these steps:

1. Go to [supabase.com](https://supabase.com) and sign in or create a free account
2. Click **New Project**
3. Give it a name (e.g. `nubycord`), choose a region close to you, and set a database password
4. Wait about 1–2 minutes for the project to finish setting up

---

## Step 5 — Create the Database Table

Nubycord stores user accounts in Supabase. You need to create the table manually once.

1. Inside your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Paste the following SQL and click **Run**:

```sql
create table if not exists nubycord_users (
  id uuid primary key default gen_random_uuid(),
  mutex text unique not null,
  password_hash text,
  is_admin boolean default false,
  created_by text,
  created_at timestamptz default now()
);
```

You should see a success message. This table is where all admin and user accounts are stored.

---

## Step 6 — Get Your Supabase API Keys

1. Inside your Supabase project, click **Settings** (gear icon) in the left sidebar
2. Click **API** in the settings menu
3. You will see two things you need:
   - **Project URL** — looks like `https://xxxxxxxxxxx.supabase.co`
   - **Project API Keys** — there are two keys listed. You need the **service_role** key (not the `anon` key). Click the eye icon to reveal it and copy it.

Keep these values ready for the next step. Do not share your service_role key with anyone.

---

## Step 7 — Create Your .env File

In the root of your project folder (the same folder that contains `app.js`), create a new plain text file named exactly:

```
.env
```

Note: There is no other extension — not `.env.txt`, just `.env`. On Windows, make sure your file explorer is showing file extensions so you name it correctly.

Open the `.env` file in your code editor and add the following three lines, replacing the placeholder values with your real ones:

```
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SESSION_SECRET=choose_any_long_random_string_here
```

**SUPABASE_URL** — Paste the Project URL you copied from Supabase Settings → API.

**SUPABASE_SERVICE_KEY** — Paste the service_role key (the long one, starts with `eyJ`).

**SESSION_SECRET** — This can be anything you choose. It is used to sign session cookies and just needs to be long and hard to guess. For example:
```
SESSION_SECRET=nubycord_local_s3cr3t_k3y_xyz_2024_abc!
```

Save the file when done.

---

## Step 8 — Start the App

In your terminal (inside the project folder), run:

```
node app.js
```

If everything is set up correctly, you will see:

```
Server running on http://localhost:5000
```

Open any web browser and go to:

```
http://localhost:5000
```

You should see the Nubycord login page.

---

## Step 9 — First-Time Admin Setup

When the app starts fresh with no users, it will redirect the setup page. In your browser, go to:

```
http://localhost:5000/setup
```

On this page:
1. Set your admin password (minimum 8 characters)
2. You will be given a **mutex** (access key) — this is your unique login key. It looks like `XXXXXX-XXXXXXX-XXXXXX-XXXXXXX-XXXXXX`
3. **Save this mutex key somewhere safe** — you cannot recover it if you lose it. You will need it every time you log in.
4. After saving your mutex, go to `http://localhost:5000/login.html` and log in with your mutex + password

Once logged in as admin, you can generate mutex keys for other users from the **Panel** tab.

---

## Stopping and Restarting the App

To stop the app, go to your terminal and press:
```
Ctrl + C
```

To start it again:
```
node app.js
```

---

## Troubleshooting

**"Cannot find module" error on startup**
You have not run `npm install` yet, or you ran it in the wrong folder. Make sure your terminal is inside the project folder and run `npm install` again.

**"Missing required environment variables" error**
Your `.env` file is either missing, in the wrong folder, or the `require('dotenv').config()` line was not added to the top of `app.js`. Double-check all three.

**"address already in use" error on port 5000**
Another process is already using port 5000. Either stop that process, or change the port by adding `PORT=3000` (or any free port) to your `.env` file.

**Login page loads but login fails**
The `nubycord_users` table may not exist in Supabase. Go back to Step 6 and run the SQL again. Also confirm your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct and have no extra spaces.

**Can't see the .env file in Windows Explorer**
Windows hides files starting with a dot. In File Explorer, click **View → Show → Hidden Items**. Alternatively, just create and edit it directly from VS Code.

---

## Important Notes

- The `.env` file contains sensitive credentials. Never share it or commit it to Git. If you use Git, add `.env` to your `.gitignore` file.
- All user data (tokens, members, campaign config, history) is stored in the `userdata/` folder inside the project.
- Session data is stored in the `.sessions/` folder inside the project.
- The `userdata/` and `.sessions/` folders are created automatically on first run.
- Nubycord uses Discord self-bot tokens (user account tokens). Use at your own risk as this is against Discord's Terms of Service.
