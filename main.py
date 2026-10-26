import re
from datetime import datetime, timezone, timedelta
import os
from pwdlib import PasswordHash
import jwt
from jwt import InvalidTokenError
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from database import (
    create_all_tables,
    create_tasks_table,
    get_tasks,
    count_tasks,
    add_task,
    update_task_status,
    create_user, get_user_by_email, get_user_by_id, list_users, set_user_role, count_users,
    list_categories, create_category, set_category_active, rename_category, delete_user
)


app = FastAPI(title="VoiceDesk API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://frontend-blush-omega-35.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Safe to call repeatedly: existing task rows are preserved and missing columns are added.
create_all_tables()

# Configure VOICEDESK_SECRET_KEY in the environment before any public deployment.
SECRET_KEY = os.getenv("VOICEDESK_SECRET_KEY")

if not SECRET_KEY:
    if os.getenv("RENDER"):
        raise RuntimeError(
            "VOICEDESK_SECRET_KEY must be configured before deployment."
        )
    SECRET_KEY = "LOCAL-DEV-ONLY-change-this-secret-before-deployment"

ALGORITHM = "HS256"
TOKEN_MINUTES = 60 * 8
password_hasher = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)
VALID_ROLES = {"employee", "it_support", "admin"}


def make_token(user):
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user["id"]), "role": user["role"], "iat": now, "exp": now + timedelta(minutes=TOKEN_MINUTES)}, SECRET_KEY, algorithm=ALGORITHM)


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Please log in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", ""))
    except (InvalidTokenError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired login token.", headers={"WWW-Authenticate": "Bearer"})
    user = get_user_by_id(user_id)
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="This account is unavailable.")
    return user


def require_roles(*roles):
    def checker(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your account does not have permission for this action.")
        return user
    return checker


def tasks_for(user):
    return get_tasks() if user["role"] in {"admin", "it_support"} else get_tasks(user_id=user["id"])


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class AdminUserPasswordReset(BaseModel):
    new_password: str = Field(min_length=10, max_length=128)


class AdminUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=128)
    role: str = "employee"


class AdminCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class AdminCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    is_active: bool | None = None


@app.post("/auth/setup-admin")
def setup_first_admin(request: RegisterRequest):
    # First-run setup only; disabled automatically once any user exists.
    if count_users() != 0:
        raise HTTPException(status_code=403, detail="Initial admin setup is already closed.")
    email = request.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    try:
        user = create_user(email, request.full_name, password_hasher.hash(request.password), "admin")
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Email already registered.")
        raise
    return {"message": "Initial admin account created. Please log in.", "user": user}


@app.post("/auth/register", status_code=201)
def register_employee(request: RegisterRequest):
    email = request.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    try:
        user = create_user(email, request.full_name, password_hasher.hash(request.password), "employee")
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Email already registered.")
        raise
    return {"message": "Account created. Please log in.", "user": user}


@app.post("/auth/login")
def login(request: LoginRequest):
    user = get_user_by_email(request.email.strip().lower())
    if not user or not user["is_active"] or not password_hasher.verify(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    public_user = {"id": user["id"], "email": user["email"], "full_name": user["full_name"], "role": user["role"]}
    return {"access_token": make_token(public_user), "token_type": "bearer", "user": public_user, "expires_in": TOKEN_MINUTES * 60}


@app.post("/auth/change-password")
def change_password(request: ChangePasswordRequest, user=Depends(current_user)):
    # Verify the current password before replacing the stored password hash.
    stored = get_user_by_email(user["email"])
    if not stored or not password_hasher.verify(request.current_password, stored["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current password.")
    from database import update_user_password
    if not update_user_password(user["id"], password_hasher.hash(request.new_password)):
        raise HTTPException(status_code=404, detail="User account not found.")
    return {"message": "Password changed successfully."}


@app.get("/auth/me")
def who_am_i(user=Depends(current_user)):
    return user


@app.get("/admin/users")
def admin_list_users(user=Depends(require_roles("admin"))):
    return {"users": list_users()}


@app.post("/admin/users", status_code=201)
def admin_create_user(request: AdminUserCreate, user=Depends(require_roles("admin"))):
    role = request.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Role must be employee, it_support, or admin.")
    email = request.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    try:
        created = create_user(email, request.full_name, password_hasher.hash(request.password), role)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Email already registered.")
        raise
    return {"user": created}


@app.post("/admin/users/{user_id}/password")
def admin_reset_user_password(user_id: int, request: AdminUserPasswordReset, user=Depends(require_roles("admin"))):
    # Admin may reset another user's password, but cannot use this endpoint on their own account.
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Use Account Settings to change your own password.")
    target = next((item for item in list_users() if int(item.get("id", -1)) == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    from database import update_user_password
    if not update_user_password(user_id, password_hasher.hash(request.new_password)):
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "User password reset successfully. Ask the user to change it after login."}


@app.patch("/admin/users/{user_id}/role")
def admin_change_role(user_id: int, role: str, user=Depends(require_roles("admin"))):
    role = role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Role must be employee, it_support, or admin.")
    if user_id == user["id"] and role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")
    if not set_user_role(user_id, role):
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "Role updated."}



@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    user=Depends(require_roles("admin")),
):
    result = delete_user(user_id, user["id"])

    if result == "not_found":
        raise HTTPException(status_code=404, detail="User not found.")
    if result == "cannot_delete_self":
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account.",
        )
    if result == "last_admin":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the last administrator.",
        )

    return {"message": "User deleted successfully."}



@app.get("/admin/categories")
def admin_list_categories(user=Depends(require_roles("admin"))):
    return {"categories": list_categories(include_inactive=True)}


@app.get("/categories")
def active_categories(user=Depends(current_user)):
    """Authenticated users can read active categories for task creation."""
    return {"categories": list_categories(include_inactive=False)}


@app.post("/admin/categories", status_code=201)
def admin_create_category(request: AdminCategoryCreate, user=Depends(require_roles("admin"))):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name cannot be empty.")
    try:
        return {"category": create_category(name)}
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="A category with this name already exists.")
        raise


@app.patch("/admin/categories/{category_id}")
def admin_update_category(category_id: int, request: AdminCategoryUpdate, user=Depends(require_roles("admin"))):
    if request.name is None and request.is_active is None:
        raise HTTPException(status_code=422, detail="Provide a category name or active status to update.")
    category = None
    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Category name cannot be empty.")
        try:
            category = rename_category(category_id, name)
        except Exception as exc:
            if "UNIQUE" in str(exc).upper():
                raise HTTPException(status_code=409, detail="A category with this name already exists.")
            raise
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found.")
    if request.is_active is not None:
        if not set_category_active(category_id, request.is_active):
            raise HTTPException(status_code=404, detail="Category not found.")
        category = next((item for item in list_categories() if item["id"] == category_id), category)
    return {"category": category}


@app.get("/")
def home():
    return {"message": "VoiceDesk API is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/about")
def about():
    return {"project": "VoiceDesk", "status": "Learning in progress"}


@app.get("/tasks")
def list_tasks(user=Depends(current_user)):
    rows = tasks_for(user)
    tasks = [dict(task) for task in rows]
    return {"total": len(tasks), "tasks": tasks}


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=250)


@app.post("/tasks")
def create_task(task: TaskCreate, user=Depends(current_user)):
    title = task.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Task title cannot be empty.")
    return add_task(title, user_id=user["id"])


class TaskStatusUpdate(BaseModel):
    status: str


@app.patch("/tasks/{task_id}/status")
def change_task_status(task_id: int, update: TaskStatusUpdate, user=Depends(require_roles("admin", "it_support"))):
    allowed = {
        "pending": "Pending",
        "in progress": "In Progress",
        "completed": "Completed",
    }
    requested = update.status.strip().casefold()
    if requested not in allowed:
        raise HTTPException(
            status_code=422,
            detail="Status must be Pending, In Progress, or Completed.",
        )

    new_status = allowed[requested]
    if not update_task_status(task_id, new_status):
        raise HTTPException(status_code=404, detail="Task not found.")

    task = next((dict(row) for row in get_tasks() if row["id"] == task_id), None)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


class AssistantCommand(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class TaskPreviewRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=5000)


class TaskConfirmRequest(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    original_request: str = Field(min_length=1, max_length=5000)
    category: str = "General Service"
    priority: str = "Normal"
    location: str | None = Field(default=None, max_length=250)
    deadline: str | None = Field(default=None, max_length=250)


def assistant_brain(message, user):
    text = message.strip()
    normalized = text.casefold()
    if not text:
        return {"reply": "Please tell me what you need.", "intent": "unknown"}

    if normalized in {"help", "commands", "what can you do?"}:
        return {
            "reply": "I can show all tasks, list pending tasks, create tasks, and update a task's status.",
            "intent": "help",
        }

    if any(p in normalized for p in [
        "show all tasks", "list all tasks", "my tasks", "show tasks", "all tasks"
    ]):
        tasks = [dict(row) for row in tasks_for(user)]
        reply = (
            "You don't have any tasks yet."
            if not tasks
            else "Here are your tasks: "
            + "; ".join(f'{t["title"]}: {t["status"]}' for t in tasks)
        )
        return {"reply": reply, "intent": "list_tasks", "tasks": tasks}

    status_filters = [
        (["pending tasks", "tasks pending", "pending task"], "Pending"),
        (["in progress tasks", "tasks in progress"], "In Progress"),
        (["completed tasks", "finished tasks", "done tasks"], "Completed"),
    ]
    for phrases, status in status_filters:
        if any(p in normalized for p in phrases):
            tasks = [
                dict(row) for row in tasks_for(user)
                if row["status"].casefold() == status.casefold()
            ]
            reply = (
                f"You have {len(tasks)} {status.lower()} task(s): "
                + "; ".join(t["title"] for t in tasks)
                if tasks
                else f"You don't have any {status.lower()} tasks."
            )
            return {"reply": reply, "intent": "list_tasks", "tasks": tasks}

    patterns = [
        r"^(?:please )?(?:create|add|make)\s+(?:a\s+)?task\s+(?:called|named|titled)\s+(.+)$",
        r"^(?:please )?(?:create|add|make)\s+(?:a\s+)?task\s*:\s*(.+)$",
        r"^(?:please )?(?:create|add|make)\s+(?:a\s+)?task\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            title = match.group(1).strip().strip(" \"' .")
            if not title:
                return {"reply": "Please tell me the task title.", "intent": "clarify"}
            saved = add_task(title, original_request=text, user_id=user["id"])
            return {
                "reply": f'I created the task "{saved["title"]}".',
                "intent": "create_task",
                "task": saved,
            }

    status_patterns = [
        r"^(?:please )?(?:mark|move|change|set)\s+(.+?)\s+(?:to|as)\s+(pending|in progress|completed|complete|done)$",
        r"^(.+?)\s+(?:status\s+)?(?:to|as)\s+(pending|in progress|completed|complete|done)$",
    ]
    status_map = {
        "pending": "Pending",
        "in progress": "In Progress",
        "completed": "Completed",
        "complete": "Completed",
        "done": "Completed",
    }
    for pattern in status_patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            wanted = match.group(1).strip().strip(" \"'")
            new_status = status_map[match.group(2).casefold()]
            if user["role"] not in {"admin", "it_support"}:
                return {"reply": "Only IT Support or Admin can update task status.", "intent": "permission_denied"}
            tasks = [dict(row) for row in get_tasks()]
            matches = [
                task for task in tasks
                if task["title"].casefold() == wanted.casefold()
                or wanted.casefold() in task["title"].casefold()
            ]
            if not matches:
                return {
                    "reply": f'I could not find a task matching "{wanted}".',
                    "intent": "task_not_found",
                }
            if len(matches) > 1:
                return {
                    "reply": "I found multiple matching tasks: "
                    + ", ".join(task["title"] for task in matches)
                    + ". Which one do you mean?",
                    "intent": "clarify",
                }
            task = matches[0]
            update_task_status(task["id"], new_status)
            updated = next(
                (dict(row) for row in get_tasks() if row["id"] == task["id"]),
                {**task, "status": new_status},
            )
            return {
                "reply": f'I updated "{task["title"]}" to {new_status}.',
                "intent": "update_task",
                "task": updated,
            }

    return {
        "reply": "I'm not sure how to do that yet. Try asking me to show pending tasks, create a task, or change a task status.",
        "intent": "unknown",
    }


@app.post("/assistant/command")
def assistant_command(command: AssistantCommand, user=Depends(current_user)):
    return assistant_brain(command.message, user)


def extract_task_details(original):
    """Conservative, rule-based extraction; it does not call an external LLM."""
    text = original.strip()
    normalized = text.casefold()

    # Remove common spoken request prefixes when present.
    title = re.sub(
        r"^(?:hey\s+)?(?:voicedesk[, ]*)?(?:please\s+)?"
        r"(?:create|add|make|log|record)\s+(?:a\s+)?"
        r"(?:task|request)\s*"
        r"(?:called|named|titled|for|to|about|:)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip(" \t\r\n.,!?")

    # For natural spoken sentences, use the first sentence as a practical title
    # while preserving the complete transcript separately.
    if title == text:
        title = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0].strip(" \t\r\n.,!?")
    if not title or title.casefold() in {
        "a task", "task", "a request", "request", "something"
    }:
        title = text

    if any(word in normalized for word in ["critical", "urgent", "immediately", "asap"]):
        priority = "Critical"
    elif any(word in normalized for word in ["high priority", "high-priority", "important"]):
        priority = "High"
    elif any(word in normalized for word in ["low priority", "low-priority", "when possible"]):
        priority = "Low"
    else:
        priority = "Normal"

    category = "General Service"
    rules = [
        (("laptop", "computer", "software", "login", "password", "printer",
          "network", "wifi", "wi-fi", "system", "across vpn"), "IT Support"),
        (("chair", "desk", "monitor", "keyboard", "mouse", "equipment"), "Equipment"),
        (("leak", "plumbing", "air conditioning", "air conditioner", " ac ",
          "electric", "light", "repair", "not working"), "Maintenance"),
        (("clean", "cleaning", "room", "building", "facility"), "Facility"),
        (("document", "paperwork", "schedule", "meeting", "admin"), "Administrative"),
    ]
    padded = f" {normalized} "
    for words, candidate in rules:
        if any(word in padded for word in words):
            category = candidate
            break

    # Capture an explicitly spoken room/location only; do not guess one.
    # Accept forms such as "room 203", "room number 203", and "office no. A12".
    location_match = re.search(
        r"\b(?P<kind>room|office|floor|building)\s+"
        r"(?:(?:number|no\.?|#)\s*)?"
        r"(?P<identifier>[A-Za-z0-9][A-Za-z0-9-]*)\b",
        text,
        flags=re.IGNORECASE,
    )
    if location_match:
        location = f"{location_match.group('kind').title()} {location_match.group('identifier')}"
    else:
        location = None

    # Keep deadline as user-spoken text instead of inventing a date/time.
    deadline = None
    deadline_match = re.search(
        r"\b(today|tomorrow|this week|next week|by\s+\w+(?:\s+\d{1,2})?)\b",
        text,
        flags=re.IGNORECASE,
    )
    if deadline_match:
        deadline = deadline_match.group(0)

    return {
        "title": title[:250],
        "category": category,
        "priority": priority,
        "location": location,
        "deadline": deadline,
    }


@app.post("/assistant/preview")
def assistant_preview(request: TaskPreviewRequest, user=Depends(current_user)):
    original = request.transcript.strip()
    if not original:
        raise HTTPException(status_code=422, detail="Transcript cannot be empty.")

    draft = extract_task_details(original)
    return {
        "requires_confirmation": True,
        "draft": draft,
        "original_request": original,
        "note": "Rule-based draft only; review and edit these details before confirming.",
    }


@app.post("/assistant/confirm")
def assistant_confirm(request: TaskConfirmRequest, user=Depends(current_user)):
    title = request.title.strip()
    original = request.original_request.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Task title cannot be empty.")
    if not original:
        raise HTTPException(status_code=422, detail="Original request cannot be empty.")

    # Validate against the active categories managed in this office's database.
    # This supports admin-created categories without changing existing task records.
    active_categories = list_categories(include_inactive=False)
    category_lookup = {
        item["name"].strip().casefold(): item["name"].strip()
        for item in active_categories
        if item.get("name") and item["name"].strip()
    }

    requested_category = request.category.strip()
    category = category_lookup.get(requested_category.casefold())
    if category is None:
        # General Service is seeded by create_categories_table(). If it has been
        # deactivated, choose the first active category rather than saving an inactive one.
        category = category_lookup.get("general service")
        if category is None and active_categories:
            category = active_categories[0]["name"]
        if category is None:
            raise HTTPException(
                status_code=422,
                detail="No active request categories are available. Ask an administrator to activate a category.",
            )

    priorities = {"Low", "Normal", "Medium", "High", "Critical"}

    priority = request.priority.strip().title()
    if priority not in priorities:
        priority = "Normal"

    saved = add_task(
        title=title,
        priority=priority,
        category=category,
        original_request=original,
        location=request.location.strip() if request.location and request.location.strip() else None,
        deadline=request.deadline.strip() if request.deadline and request.deadline.strip() else None,
        user_id=user["id"],
    )
    return {
        "message": "Task confirmed and created.",
        "task": saved,
        "category": saved["category"],
        "original_request": original,
        "created_at": saved["created_at"],
    }