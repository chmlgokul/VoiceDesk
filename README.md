# VoiceDesk

**VoiceDesk** is a voice-enabled office request and task management application. It helps staff report workplace issues and lets the Admin and IT Support roles review and manage office requests from a shared workspace.

## Live application

- **Frontend:** https://frontend-blush-omega-35.vercel.app/
- **Backend API:** https://voicedesk-2k7j.onrender.com
- **Source code:** https://github.com/chmlgokul/VoiceDesk

> Availability of the live services may depend on the hosting platforms and their current status.

## Key features

- **Role-based access:** Staff, Admin, and IT Support have different views and permissions.
- **Create requests:** Staff, Admin, and IT Support can submit office requests.
- **My Requests:** Staff can view their own submitted requests.
- **All Tasks:** Admin and IT Support can view office requests.
- **Status updates:** IT Support can update request status.
- **Categories:** Requests can be organized by category; administrators can manage categories where enabled.
- **Voice assistant:** Supports voice-driven navigation and request-related actions, including commands such as “Open dashboard,” “Show my requests,” “Show all tasks,” and “Create request.” Available actions can depend on the signed-in role.
- **Activity tracking:** Records relevant application activity.
- **Persistent storage:** Uses SQLite for local development and can use Turso/libSQL when the required environment variables are configured.

## Technology stack

### Frontend
- React
- TypeScript
- Vite

### Backend
- Python
- FastAPI
- Uvicorn
- Pydantic
- PyJWT and `pwdlib` for authentication-related functionality

### Database
- SQLite for local development
- Turso/libSQL for a configured hosted database

## Project structure

```text
voicedesk/
├── main.py                 # FastAPI application and API routes
├── database.py             # Database connection and table setup
├── requirements.txt        # Python dependencies
├── migrate_to_turso.py     # Database migration utility (if needed)
├── frontend/
│   ├── src/                # React and TypeScript application
│   ├── public/             # Public assets
│   ├── package.json        # Frontend dependencies and scripts
│   ├── package-lock.json   # Locked frontend dependency versions
│   └── vite.config.ts      # Vite configuration
└── README.md
```

Local databases, credentials, virtual environments, dependency folders, and build output should not be included in a source-code submission.

## Requirements

Install the following before running the project locally:

- Python 3.11 recommended
- Node.js and npm
- Git (optional, for cloning the repository)

## Run locally

### 1. Get the source code

```bash
git clone https://github.com/chmlgokul/VoiceDesk.git
cd VoiceDesk
```

Alternatively, download the repository ZIP and extract it.

### 2. Set up the backend

Create and activate a virtual environment from the project root.

**Windows PowerShell:**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

**macOS/Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Configure the environment variables described below before running a deployment. For local development, the application code provides a local-development secret fallback; do not use that fallback for a deployed environment.

Start the API from the project root:

```bash
uvicorn main:app --reload
```

The local API will normally be available at `http://127.0.0.1:8000`. FastAPI's interactive API documentation is normally available at `http://127.0.0.1:8000/docs`.

### 3. Set up the frontend

Open a second terminal and move into the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local frontend URL in the terminal (commonly `http://localhost:5173`). Keep the backend running while using the frontend.

For a production build:

```bash
npm run build
```

The build output is generated in `frontend/dist/`; it can be regenerated and does not need to be included in the source submission.

## Environment configuration

Do not commit real credentials to Git or include them in a public/shared source-code ZIP. Set environment variables in your local environment or hosting provider's secret/environment-variable settings.

| Variable | Purpose |
|---|---|
| `VOICEDESK_SECRET_KEY` | Secret used by the backend for signing/authentication. Use a long, random, private value in deployment. |
| `TURSO_DATABASE_URL` | Turso database URL. |
| `TURSO_AUTH_TOKEN` | Authentication token for the Turso database. Keep it private. |

The database code can use Turso/libSQL when both Turso variables are configured; otherwise it uses the local SQLite database for development. Confirm the current code and hosting configuration before changing database settings.

For local development, create a private `.env` file only if your current setup loads it. Never upload `.env`. If you provide an `.env.example` file for other developers, use blank or clearly fake placeholder values only—never copy real tokens into it.

## Database and data safety

- The local SQLite database may contain real application data. Do not include `voicedesk.db` or older database backups in a source-code submission unless a reviewer explicitly requests a database export and it has been safely sanitized.
- Back up the database before making schema changes or running a migration.
- Do not delete or replace an existing database as part of ordinary setup.
- Run `migrate_to_turso.py` only when you intentionally need to migrate data and have reviewed the script, destination, and backup. It is not required for a normal local startup.

## Security checklist

- Keep `.env`, database files, API tokens, signing secrets, passwords, and backup files out of Git and shared ZIP files.
- Use a unique, randomly generated `VOICEDESK_SECRET_KEY` in deployment.
- Do not share production credentials in screenshots, documentation, or email.
- Review environment variables in the hosting dashboard if credentials may have been exposed; rotate affected credentials.
- Use test accounts and non-sensitive sample requests when demonstrating the project.

## Deployment notes

The current project uses a separately hosted frontend and backend. The frontend must be configured to call the correct backend URL, and the backend CORS allow-list must include the intended frontend origin. When changing domains, update the relevant hosting settings and verify sign-in, request creation, role-based visibility, status updates, and voice commands after deployment.

Required secrets and database credentials should be configured in the hosting provider's environment-variable settings, not hard-coded into source files.

## Testing checklist

After starting or deploying the application, verify:

- [ ] Users can sign in with the intended test accounts.
- [ ] Staff can create a request and see it in **My Requests**.
- [ ] Admin and IT Support can create requests and access **All Tasks**.
- [ ] Staff cannot view other users' private requests.
- [ ] IT Support can update request status and the change persists.
- [ ] Categories and existing requests remain available.
- [ ] Voice commands navigate to the appropriate views and trigger supported actions.
- [ ] The browser console and backend logs show no unexpected errors.

## Project status

VoiceDesk is a full-stack office request management project with voice-assistant functionality. Refer to the live application and repository for the current implementation. Verify all features in the target deployment before relying on them in production.

## Maintainer

**Gokulakkannan**
