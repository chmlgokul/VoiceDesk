import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import VoiceDeskRobot3D from "./VoiceDeskRobot3D";
import "./app.css";

type Status = "Pending" | "In Progress" | "Completed";

type Priority = "High" | "Medium" | "Low";

type Filter = "All" | Status;
type VoiceMode = "ready" | "listening" | "thinking" | "speaking" | "error";

type Task = {

  id: string;

  title: string;

  category: string;

  priority: Priority;

  status: Status;

  date: string;

};

type ApiTask = {
  id: number;
  title: string;
  status: Status;
  priority: Priority | "Normal" | "Critical";
  category?: string;
  location?: string | null;
  deadline?: string | null;
  created_at?: string | null;
};

type TaskDraft = {
  title: string;
  category: string;
  priority: "Low" | "Normal" | "High" | "Critical";
  original_request: string;
  location: string;
  deadline: string;
};

type AuthUser = {
  id: number;
  email: string;
  full_name: string;
  role: "employee" | "it_support" | "admin";
};

type AdminUser = AuthUser & { is_active?: boolean };
type WorkspaceCategory = { id: number; name: string; is_active: boolean | number; created_at?: string | null };


const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const REQUEST_CATEGORIES = [
  "IT Support",
  "Equipment",
  "Maintenance",
  "Facility",
  "Administrative",
  "General Service",
];
const REQUEST_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;


const menuItems = [

  { icon: "▦", label: "Dashboard" },

  { icon: "◉", label: "My Requests" },

  { icon: "☷", label: "All Tasks" },

  { icon: "◷", label: "Activity" },
  { icon: "♙", label: "User Management" },
  { icon: "▤", label: "Categories" },

];

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

const pageCopy: Record<

  string,

  {

    title: string;

    subtitle: string;

    panelTitle: string;

    panelSubtitle: string;

  }

> = {

  Dashboard: {

    title: "Dashboard",

    subtitle: "Your personal AI assistant is ready when you are.",

    panelTitle: "Recent requests",

    panelSubtitle: "A quick look at your latest workspace updates.",

  },

  "My Requests": {

    title: "My Requests",

    subtitle: "Track your submitted requests and their status.",

    panelTitle: "My submitted requests",

    panelSubtitle: "Requests you have created in this session.",

  },

  "All Tasks": {

    title: "All Tasks",

    subtitle: "Browse tasks and filter by their current status.",

    panelTitle: "All workspace tasks",

    panelSubtitle: "Choose a status filter to find specific tasks.",

  },

  Activity: {

    title: "Activity",

    subtitle: "Review your completed work and finished tasks.",

    panelTitle: "Completed activity",

    panelSubtitle: "Tasks that have been successfully completed.",

  },

};

type StatCardProps = {

  title: string;

  number: number;

  caption: string;

  icon: string;

  tone: "purple" | "amber" | "blue" | "green";

};

function StatCard({

  title,

  number,

  caption,

  icon,

  tone,

}: StatCardProps) {

  return (

    <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}>

      <div className="stat-top">

        <span>{title}</span>

        <span className={`stat-icon ${tone}`}>{icon}</span>

      </div>

      <div className="stat-number">{number}</div>

      <div className="stat-caption">{caption}</div>

    </div>

  );

}

function App() {

  const [token, setToken] = useState(
    () => sessionStorage.getItem("voicedesk_token") || ""
  );
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [greeting, setGreeting] = useState(getTimeBasedGreeting);

  // Refresh the greeting periodically so an open dashboard follows local time.
  useEffect(() => {
    const updateGreeting = () => setGreeting(getTimeBasedGreeting());
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [isListening, setIsListening] = useState(false);

  const voiceLanguage = "en-IN" as const;

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ready");

  const [voiceTranscript, setVoiceTranscript] = useState("");

  // Keep the assistant card hidden until the user clicks the robot.
  const [showAssistantPanel, setShowAssistantPanel] = useState(false);
  // Preserve the draggable floating robot while keeping click-to-open behaviour.
  const [robotOffset, setRobotOffset] = useState({ x: 0, y: 0 });
  const robotDragStart = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const robotDidMove = useRef(false);

  const [showModal, setShowModal] = useState(false);

  const [requestText, setRequestText] = useState("");
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);

  const [notice, setNotice] = useState("");

  const [taskFilter, setTaskFilter] = useState<Filter>("All");

  const [apiLoading, setApiLoading] = useState(true);

  const [apiError, setApiError] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<AdminUser["role"]>("employee");
  const [usersError, setUsersError] = useState("");
  const [usersNotice, setUsersNotice] = useState("");
  const [openUserActions, setOpenUserActions] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [workspaceCategories, setWorkspaceCategories] = useState<WorkspaceCategory[]>([]);
  const [activeCategories, setActiveCategories] = useState<string[]>(REQUEST_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoriesNotice, setCategoriesNotice] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryEditId, setCategoryEditId] = useState<number | null>(null);
  const [categoryEditName, setCategoryEditName] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {

    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(""), 3500);

    return () => window.clearTimeout(timer);

  }, [notice]);

useEffect(() => {
  let cancelled = false;

  async function validateSession() {
    if (!token) {
      setCurrentUser(null);
      setAuthChecked(true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Session expired. Please sign in again.");
      const user: AuthUser = await response.json();
      if (!cancelled) {
        setCurrentUser(user);
        setActiveMenu(user.role === "admin" ? "User Management" : user.role === "it_support" ? "All Tasks" : "Dashboard");
        setAuthError("");
      }
    } catch (error) {
      console.error("Session validation failed:", error);
      if (!cancelled) {
        sessionStorage.removeItem("voicedesk_token");
        setToken("");
        setCurrentUser(null);
        setTasks([]);
        setAuthError("Unable to validate your session. Please sign in again and check that the backend is running.");
      }
    } finally {
      if (!cancelled) setAuthChecked(true);
    }
  }

  void validateSession();
  return () => { cancelled = true; };
}, [token]);

useEffect(() => {
  let cancelled = false;

  async function loadTasks() {
    if (!token || !currentUser) {
      setTasks([]);
      setApiLoading(false);
      return;
    }

    try {
      setApiLoading(true);
      setApiError("");
      const response = await fetch(`${API_BASE}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem("voicedesk_token");
          if (!cancelled) {
            setToken("");
            setCurrentUser(null);
            setTasks([]);
            setAuthError("Your session expired. Please sign in again.");
          }
        }
        throw new Error("Unable to load tasks from the server.");
      }

      const data: { total: number; tasks: ApiTask[] } = await response.json();
      const backendTasks: Task[] = data.tasks.map((task) => ({
        id: String(task.id),
        title: task.title,
        category: task.category || "General Service",
        priority:
          task.priority === "Critical" || task.priority === "High"
            ? "High"
            : task.priority === "Low"
              ? "Low"
              : "Medium",
        status: task.status,
        date: task.created_at
          ? new Date(task.created_at).toLocaleDateString("en-US", {
              month: "short", day: "2-digit", year: "numeric",
            })
          : new Date().toLocaleDateString("en-US", {
              month: "short", day: "2-digit", year: "numeric",
            }),
      }));
      if (!cancelled) setTasks(backendTasks);
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      if (!cancelled) setApiError("Could not load tasks. Check your session and backend.");
    } finally {
      if (!cancelled) setApiLoading(false);
    }
  }

  void loadTasks();
  return () => { cancelled = true; };
}, [token, currentUser?.id]);

  const pending = tasks.filter(

    (task) => task.status === "Pending"

  ).length;

  const inProgress = tasks.filter(

    (task) => task.status === "In Progress"

  ).length;

  const completed = tasks.filter(

    (task) => task.status === "Completed"

  ).length;

  const completionRate = tasks.length

    ? Math.round((completed / tasks.length) * 100)

    : 0;

  const visibleTasks = useMemo(() => {

    if (activeMenu === "Activity") {

      return tasks.filter((task) => task.status === "Completed");

    }

    if (activeMenu === "All Tasks" && taskFilter !== "All") {

      return tasks.filter((task) => task.status === taskFilter);

    }

    if (activeMenu === "Dashboard") {

      return tasks.slice(0, 4);

    }

    return tasks;

  }, [activeMenu, taskFilter, tasks]);

  const copy = pageCopy[activeMenu] ?? pageCopy.Dashboard;
  const isAdmin = currentUser?.role === "admin";
  const canManageTasks = currentUser?.role === "admin" || currentUser?.role === "it_support";
  const roleMenuItems = menuItems.filter((item) => {
    if (currentUser?.role === "admin") return ["Dashboard", "All Tasks", "Activity", "User Management", "Categories"].includes(item.label);
    if (currentUser?.role === "it_support") return ["Dashboard", "All Tasks", "Activity"].includes(item.label);
    return ["Dashboard", "My Requests", "Activity"].includes(item.label);
  });

  useEffect(() => {
    if (!token || currentUser?.role !== "admin" || activeMenu !== "User Management") return;
    let cancelled = false;
    async function loadUsers() {
      setUsersLoading(true);
      setUsersError("");
      try {
        const response = await fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load users.");
        if (!cancelled) setAdminUsers(data.users || []);
      } catch (error) {
        if (!cancelled) setUsersError(error instanceof Error ? error.message : "Could not load users.");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }
    void loadUsers();
    return () => { cancelled = true; };
  }, [token, currentUser?.role, activeMenu]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function loadActiveCategories() {
      try {
        const response = await fetch(`${API_BASE}/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        const names = Array.isArray(data.categories)
          ? data.categories.map((item: WorkspaceCategory) => item.name).filter((name: unknown): name is string => typeof name === "string" && name.trim().length > 0)
          : [];
        if (!cancelled && names.length > 0) setActiveCategories(names);
      } catch {
        // Keep the built-in fallback categories available if the API is temporarily unavailable.
      }
    }
    void loadActiveCategories();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || currentUser?.role !== "admin" || activeMenu !== "Categories") return;
    let cancelled = false;
    async function loadCategories() {
      setCategoriesLoading(true);
      setCategoriesError("");
      try {
        const response = await fetch(`${API_BASE}/admin/categories`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load categories.");
        if (!cancelled) setWorkspaceCategories(Array.isArray(data.categories) ? data.categories : []);
      } catch (error) {
        if (!cancelled) setCategoriesError(error instanceof Error ? error.message : "Could not load categories.");
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    }
    void loadCategories();
    return () => { cancelled = true; };
  }, [token, currentUser?.role, activeMenu]);

  async function createWorkspaceCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoriesError(""); setCategoriesNotice("");
    try {
      const response = await fetch(`${API_BASE}/admin/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create category.");
      setWorkspaceCategories((items) => [...items, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName(""); setCategoriesNotice("Category created successfully.");
    } catch (error) {
      setCategoriesError(error instanceof Error ? error.message : "Could not create category.");
    }
  }

  async function updateWorkspaceCategory(categoryId: number, updates: { name?: string; is_active?: boolean }) {
    setCategoriesError(""); setCategoriesNotice("");
    try {
      const response = await fetch(`${API_BASE}/admin/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not update category.");
      setWorkspaceCategories((items) => items.map((item) => item.id === categoryId ? { ...item, ...(data.category || updates) } : item));
      setCategoryEditId(null); setCategoryEditName("");
      setCategoriesNotice(updates.name !== undefined ? "Category renamed successfully." : `Category ${updates.is_active ? "activated" : "deactivated"}.`);
    } catch (error) {
      setCategoriesError(error instanceof Error ? error.message : "Could not update category.");
    }
  }

  async function createWorkspaceUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUsersError("");
    setUsersNotice("");
    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newUserEmail.trim(), full_name: newUserName.trim(), password: newUserPassword, role: newUserRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create account.");
      setAdminUsers((users) => [...users, data.user]);
      setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("employee");
      setUsersNotice("User account created successfully.");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not create account.");
    }
  }

  async function changeWorkspaceUserRole(userId: number, role: AdminUser["role"]) {
    setUsersError(""); setUsersNotice("");
    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}/role?role=${encodeURIComponent(role)}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not update role.");
      setAdminUsers((users) => users.map((user) => user.id === userId ? { ...user, role } : user));
      setUsersNotice("User role updated.");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not update role.");
    }
  }

  async function changeOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword.length < 10) {
      setPasswordError("New password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not change password.");
      setPasswordNotice("Password changed successfully.");
      setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("");
      window.setTimeout(() => { setShowPasswordModal(false); setPasswordNotice(""); }, 1000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function rpZELkorMwhkkpShF5PvT8YnqRCupnLTNG(userId: number, fullName: string) {
    const newPassword = window.prompt(`Enter a temporary password for ${fullName} (at least 10 characters):`);
    if (newPassword === null) return;
    if (newPassword.length < 10 || newPassword.length > 128) {
      setUsersError("Temporary password must be between 10 and 128 characters.");
      return;
    }
    const confirmed = window.confirm(`Set a new temporary password for ${fullName}?`);
    if (!confirmed) return;
    setUsersError(""); setUsersNotice("");
    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not reset user password.");
      setUsersNotice(`Temporary password updated for ${fullName}. Share it securely and ask them to change it after login.`);
      setOpenUserActions(null);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not reset user password.");
    }
  }

  async function deleteWorkspaceUser(userId: number, fullName: string) {
    const confirmed = window.confirm(
      `Delete the account for "${fullName}"? This action cannot be undone. Existing task history will be preserved where the backend supports it.`
    );
    if (!confirmed) return;

    setUsersError("");
    setUsersNotice("");

    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not delete user."
        );
      }

      setAdminUsers((users) => users.filter((item) => item.id !== userId));
      setUsersNotice(`User "${fullName}" deleted successfully.`);
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Could not delete user."
      );
    }
  }

  async function updateTaskStatus(taskId: string, status: Status) {
    setApiError("");
    try {
      const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not update task status.");
      setTasks((items) => items.map((task) => task.id === taskId ? { ...task, status: data.status || status } : task));
      setNotice("Task status updated.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update task status.");
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    if (authMode === "register" && !authName.trim()) {
      setAuthError("Please enter your full name.");
      return;
    }
    setAuthBusy(true);
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload = authMode === "login"
        ? { email: authEmail.trim(), password: authPassword }
        : { email: authEmail.trim(), full_name: authName.trim(), password: authPassword };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? data.detail : "Authentication failed. Check your details.";
        throw new Error(detail);
      }
      if (authMode === "register") {
        setAuthMode("login");
        setAuthPassword("");
        setAuthError("Account created successfully. Please sign in.");
      } else {
        sessionStorage.setItem("voicedesk_token", data.access_token);
        setCurrentUser(data.user as AuthUser);
        setToken(data.access_token as string);
        setTasks([]);
        setAuthChecked(true);
        setAuthPassword("");
        setActiveMenu(data.user?.role === "admin" ? "User Management" : data.user?.role === "it_support" ? "All Tasks" : "Dashboard");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to connect to VoiceDesk.");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("voicedesk_token");
    setToken("");
    setCurrentUser(null);
    setTasks([]);
    setTaskDraft(null);
    setRequestText("");
    setAuthPassword("");
    setAuthError("");
    setAuthMode("login");
    setAuthChecked(true);
    setActiveMenu("Dashboard");
    setShowModal(false);
    setShowAssistantPanel(false);
    setVoiceMode("ready");
    setIsListening(false);
  }

  function showNotification(message: string) {

    setNotice(message);

  }

  function speak(message: string) {

    if (!("speechSynthesis" in window)) {
      showNotification(message);
      setVoiceMode("ready");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;
    utterance.pitch = 1.04;
    utterance.volume = 1;

    // Prefer an English (India) voice when the browser provides one.
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => /en-IN/i.test(voice.lang)) ||
      voices.find((voice) => /en-GB|en-US/i.test(voice.lang));
    if (preferredVoice) utterance.voice = preferredVoice;

    setVoiceMode("speaking");
    utterance.onend = () => setVoiceMode("ready");
    utterance.onerror = () => setVoiceMode("ready");
    window.speechSynthesis.speak(utterance);

  }

async function createRequest() {
  const transcript = requestText.trim();
  if (!transcript) {
    showNotification("Please enter a request description.");
    return;
  }

  setRequestBusy(true);
  try {
    const response = await fetch(`${API_BASE}/assistant/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transcript }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Unable to prepare the request preview.");
    }

    const data: { requires_confirmation: boolean; draft: Partial<TaskDraft>; original_request: string; note?: string } = await response.json();
    setTaskDraft({
      title: data.draft?.title || transcript,
      category: activeCategories.includes(data.draft?.category ?? "")
  ? data.draft!.category!
  : (activeCategories.includes("General Service") ? "General Service" : (activeCategories[0] || "General Service")),

priority: REQUEST_PRIORITIES.includes(
  data.draft?.priority as typeof REQUEST_PRIORITIES[number]
)
  ? data.draft!.priority!
  : "Normal",
      original_request: data.original_request || transcript,
      location: data.draft?.location || "",
      deadline: data.draft?.deadline || "",
    });
    showNotification("Review the request details before confirming.");
    speak("Your request preview is ready. Please review and confirm it.");
  } catch (error) {
    console.error("Failed to prepare request preview:", error);
    showNotification("Could not prepare preview. Please check that the backend is running.");
  } finally {
    setRequestBusy(false);
  }
}

async function confirmRequest() {
  if (!taskDraft || !taskDraft.title.trim()) {
    showNotification("Please enter a task title before confirming.");
    return;
  }

  setRequestBusy(true);
  try {
    const response = await fetch(`${API_BASE}/assistant/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: taskDraft.title.trim(),
        original_request: taskDraft.original_request,
        category: taskDraft.category,
        priority: taskDraft.priority,
        location: taskDraft.location.trim() || null,
        deadline: taskDraft.deadline || null,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "Unable to confirm the request.");
    }

    const data = await response.json();
    const savedTask: ApiTask = data.task;
    const newTask: Task = {
      id: String(savedTask.id),
      title: savedTask.title,
      category: savedTask.category || data.category || taskDraft.category,
      priority: savedTask.priority === "Critical" ? "High" : savedTask.priority === "Normal" ? "Medium" : savedTask.priority,
      status: savedTask.status,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    };

    setTasks((current) => [newTask, ...current.filter((task) => task.id !== newTask.id)]);
    setRequestText("");
    setTaskDraft(null);
    setShowModal(false);
    setActiveMenu(currentUser?.role === "employee" ? "My Requests" : "All Tasks");
    setTaskFilter("All");
    showNotification("Request confirmed and saved successfully.");
    speak("Your request has been confirmed and saved.");
  } catch (error) {
    console.error("Failed to confirm request:", error);
    showNotification("Could not save the request. Check the backend and try again.");
  } finally {
    setRequestBusy(false);
  }
}

  function handleVoiceCommand(rawCommand: string) {
    setVoiceMode("thinking");
    const command = rawCommand
      .toLowerCase()
      .normalize("NFC")
      .trim()
      .replace(/[.!?,;:]/g, " ")
      .replace(/\s+/g, " ");
    setVoiceTranscript(rawCommand);

    // Voice commands are intentionally English-only for this version.
    const createIntent =
      /\b(create|new|add|make)\b.*\b(task|request)\b/.test(command) ||
      /\b(task|request)\b.*\b(create|add|make)\b/.test(command);

    // Filter pending tasks
    if (
      command.includes("search pending") ||
      command.includes("show pending") ||
      command.includes("pending tasks") ||
      command.includes("pending task") ||
      command.includes("pending requests")
    ) {
      setActiveMenu("All Tasks");
      setTaskFilter("Pending");
      showNotification("Showing pending tasks.");
      speak("Showing pending tasks.");
      return;
    }

    // Filter in-progress tasks
    if (
      command.includes("show in progress") ||
      command.includes("in progress tasks") ||
      command.includes("in progress task") ||
      command.includes("ongoing tasks")
    ) {
      setActiveMenu("All Tasks");
      setTaskFilter("In Progress");
      showNotification("Showing in-progress tasks.");
      speak("Showing in-progress tasks.");
      return;
    }

    // Filter completed tasks
    if (
      command.includes("show completed") ||
      command.includes("completed tasks") ||
      command.includes("completed task") ||
      command.includes("finished tasks")
    ) {
      setActiveMenu("All Tasks");
      setTaskFilter("Completed");
      showNotification("Showing completed tasks.");
      speak("Showing completed tasks.");
      return;
    }

    // Submit a request only when the form has a description.
    if (
      command.includes("submit request") ||
      command.includes("send request") ||
      command.includes("submit task")
    ) {
      if (showModal && requestText.trim()) {
        void createRequest();
      } else {
        showNotification("Open Create Request and add a description first.");
        speak("Please open create request and add a description first.");
      }
      return;
    }

    // Close request modal
    if (
      command === "close modal" ||
      command === "cancel request" ||
      command === "close request" ||
      command === "cancel task"
    ) {
      setShowModal(false);
      showNotification("Request window closed.");
      speak("Request window closed.");
      return;
    }

    // Navigation commands
    if (
      command.includes("dashboard") ||
      command.includes("home page") ||
      command === "home"
    ) {
      setActiveMenu("Dashboard");
      setTaskFilter("All");
      showNotification("Opening Dashboard.");
      speak("Opening dashboard.");
      return;
    }

    if (
      command.includes("my requests") ||
      command.includes("my request")
    ) {
      if (currentUser?.role === "employee") {
        setActiveMenu("My Requests");
        showNotification("Opening My Requests.");
        speak("Opening my requests.");
      } else {
        // Admin and IT Support see the office-wide task list in this workspace.
        setActiveMenu("All Tasks");
        showNotification("Opening All Tasks. Your role can view office requests here.");
        speak("Opening all tasks. Your role can view office requests here.");
      }
      setTaskFilter("All");
      return;
    }

    if (
      command.includes("all tasks") ||
      command.includes("all task")
    ) {
      setActiveMenu("All Tasks");
      setTaskFilter("All");
      showNotification("Opening All Tasks.");
      speak("Opening all tasks.");
      return;
    }

    if (command.includes("activity")) {
      setActiveMenu("Activity");
      setTaskFilter("All");
      showNotification("Opening Activity.");
      speak("Opening activity.");
      return;
    }

    // Create a task/request from English voice commands. If a title is spoken after the command, prefill the form.
    if (createIntent) {
      let description = command
        .replace(/^\s*(please\s+)?/i, "")
        .replace(/\b(?:please|create|new|add|make|task|tasks|request|requests|for|a|the)\b/gi, " ")

        .replace(/\s+/g, " ")
        .trim();

      // A bare create command should open the form without guessing a title.
      if (/^(?:task|request|create|new|add|make)$/i.test(description)) {
        description = "";
      }
      setRequestText(description);
      setTaskDraft(null);
      setShowModal(true);
      setActiveMenu(currentUser?.role === "employee" ? "My Requests" : "All Tasks");
      showNotification(
        description
          ? `Request description added: ${description}`
          : "Opening Create Request. Please tell me or type the task description."
      );
      speak(
        description
          ? "I added your task description. Review it, then say submit request when ready."
          : "Create request is open. Tell me or type the task description."
      );
      return;
    }

    // Help command
    if (
      command.includes("help") ||
      command.includes("what can you do") ||
      false
    ) {
      const helpMessage =
        "I can open the dashboard, show your requests and tasks, check pending or completed work, and help you create a request. Say create task, show pending tasks, show completed tasks, or help.";
      showNotification(helpMessage);
      speak(helpMessage);
      return;
    }

    showNotification(
      `I heard: “${rawCommand}”. I couldn't match that to a command. Try “create task” or “show pending tasks”.`
    );
    speak("Sorry, I did not understand that command. Please try again, or say help.");
  }

  function startVoiceAssistant() {
    const SpeechAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechAPI) {
      setVoiceMode("error");
      showNotification(
        "Speech recognition is not available in this browser. Please use the latest Google Chrome or Microsoft Edge."
      );
      return;
    }

    if (isListening) return;

    let recognition: any;
    try {
      recognition = new SpeechAPI();
      recognition.lang = voiceLanguage;
      recognition.continuous = false;
      // Show words while the user is speaking instead of waiting silently.
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;

      setIsListening(true);
      setVoiceMode("listening");
      setVoiceTranscript("Listening… speak now");

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceMode("listening");
        setVoiceTranscript("Listening… speak now");
      };

      recognition.onaudiostart = () => {
        console.debug("VoiceDesk: microphone audio capture started");
      };

      recognition.onspeechstart = () => {
        setVoiceTranscript("Hearing you…");
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript?.trim();
          if (!text) continue;
          if (result.isFinal) finalTranscript += `${text} `;
          else interimTranscript += `${text} `;
        }

        const visibleTranscript = (finalTranscript || interimTranscript).trim();
        if (visibleTranscript) {
          setVoiceTranscript(visibleTranscript);
          console.debug("VoiceDesk recognized speech:", visibleTranscript);
        }

        if (finalTranscript.trim()) {
          const command = finalTranscript.trim();
          setVoiceMode("thinking");
          handleVoiceCommand(command);
        }
      };

      recognition.onnomatch = () => {
        setVoiceMode("error");
        setVoiceTranscript("I heard something, but couldn't understand it.");
        showNotification("I couldn't understand that. Try a short command and try again.");
      };

      recognition.onerror = (event: any) => {
        console.error("VoiceDesk speech recognition error:", event.error, event);
        setIsListening(false);
        setVoiceMode("error");

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setVoiceTranscript("Microphone permission blocked.");
          showNotification("Allow microphone access for localhost in Chrome site settings, then refresh VoiceDesk.");
        } else if (event.error === "no-speech") {
          setVoiceTranscript("No speech detected. Click the microphone and speak after it says Listening.");
          showNotification("No speech detected. Please click the microphone and try again.");
        } else if (event.error === "audio-capture") {
          setVoiceTranscript("No microphone detected.");
          showNotification("No microphone detected. Check your Windows input device and try again.");
        } else if (event.error === "network") {
          setVoiceTranscript("Speech service network error.");
          showNotification("Chrome's speech service could not connect. Check internet access and try again.");
        } else if (event.error !== "aborted") {
          setVoiceTranscript(`Speech recognition error: ${event.error}`);
          showNotification(`Voice recognition error: ${event.error}. Please try again.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceMode((current: VoiceMode) =>
          current === "listening" ? "ready" : current
        );
      };

      recognition.start();
    } catch (error) {
      console.error("Unable to start VoiceDesk speech recognition:", error);
      setIsListening(false);
      setVoiceMode("error");
      setVoiceTranscript("Could not start microphone listening.");
      showNotification("Unable to start voice recognition. Check microphone permission and try again.");
    }
  }

  if (!authChecked) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <span className="brand-mark">V</span>
          <h1>VoiceDesk</h1>
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!token || !currentUser) {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <span className="brand-mark">V</span>
          <h1>VoiceDesk</h1>
          <p>AI-powered workspace</p>
          <h2>{authMode === "login" ? "Welcome back" : "Create account"}</h2>
          {authMode === "register" && (
            <input className="auth-input" placeholder="Full name" value={authName}
              onChange={(event) => setAuthName(event.target.value)} autoComplete="name" required />
          )}
          <input className="auth-input" type="email" placeholder="Email address" value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" required />
          <input className="auth-input" type="password" placeholder="Password (minimum 10 characters)" value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={10} required />
          {authError && <p className={authError.startsWith("Account created") ? "auth-success" : "auth-error"} role="status">{authError}</p>}
          <button className="primary-button" type="submit" disabled={authBusy}>
            {authBusy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}
          </button>
          <button className="secondary-button auth-switch" type="button" disabled={authBusy}
            onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>
            {authMode === "login" ? "New here? Create an account" : "Already registered? Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (

    <div className="app-shell">

      <aside className="sidebar">

        <button

          className="brand"

          onClick={() => {

            setActiveMenu("Dashboard");

            setTaskFilter("All");

          }}

        >

          <span className="brand-mark">V</span>

          <span className="brand-copy">

            <strong>VoiceDesk</strong>

            <small>AI WORKSPACE</small>

          </span>

        </button>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav">

          {roleMenuItems.map((item) => (

            <button

              key={item.label}

              className={`nav-item ${

                activeMenu === item.label ? "active" : ""

              }`}

              onClick={() => {

                setActiveMenu(item.label);

                setTaskFilter("All");

              }}

            >

              <span className="nav-icon">{item.icon}</span>

              <span>{item.label}</span>

              {item.label === "My Requests" && (

                <span className="nav-count">{tasks.length}</span>

              )}

            </button>

          ))}

        </nav>

        <div className="sidebar-bottom">

          <div className="help-card">

            <div className="help-icon">✦</div>

            <strong>Your AI assistant</strong>

            <p>

              Have a task in mind? Tell VoiceDesk what you need.

            </p>

            {currentUser && <button

              onClick={() => {

                setRequestText("");
                setTaskDraft(null);

                setShowModal(true);

              }}

            >

              Create request ↗

            </button>}

          </div>

          <div className="profile">
            <div className="avatar">{(currentUser?.full_name || "U").charAt(0).toUpperCase()}</div>
            <div className="profile-info">
              <strong>{currentUser?.full_name || "Workspace User"}</strong>
              <small>{currentUser?.role === "it_support" ? "IT Support" : currentUser?.role === "admin" ? "Administrator" : "Employee"}</small>
            </div>
            <button className="secondary-button" type="button" onClick={() => { setPasswordError(""); setPasswordNotice(""); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); setShowPasswordModal(true); }} title="Account settings: change your password" aria-label="Account settings">Account Settings</button>
            <button className="logout-button" onClick={handleLogout} title="Sign out" aria-label="Sign out">↪</button>
          </div>

        </div>

      </aside>

      <main className="main-content">

        <header className="topbar">

          <div className="breadcrumb">

            Workspace <span>/</span> <strong>{activeMenu}</strong>

          </div>

          <div className="topbar-right">

            <span className="system-status">

              <span className="status-dot" />

              UI preview

            </span>

            <button

              className="icon-button"

              aria-label="Notifications"

              onClick={() =>

                showNotification("You're all caught up!")

              }

            >

              ♧

            </button>

            <div className="avatar top-avatar">G</div>

          </div>

        </header>

        <div className="page-content">

          <section className="welcome-row">

            <div>

              <div className="eyebrow">

                <span className="sparkle">✳</span>

                YOUR AI WORKSPACE

              </div>

              <h1>

                {activeMenu === "Dashboard" ? greeting : copy.title}

                {activeMenu === "Dashboard" && (

                  <span className="wave"> ✨</span>

                )}

              </h1>

              <p className="subtitle">{copy.subtitle}</p>

            </div>

            {currentUser?.role === "employee" && <button

              className="primary-button"

              onClick={() => {

                setRequestText("");
                setTaskDraft(null);

                setShowModal(true);

              }}

            >

              <span className="plus">＋</span>

              Create request

            </button>}

          </section>

          {activeMenu === "Dashboard" && (

            <section className="stats-grid">

              <StatCard

                title="Total requests"

                number={tasks.length}

                caption="Across your workspace"

                icon="▤"

                tone="purple"

              />

              <StatCard

                title="Pending"

                number={pending}

                caption="Awaiting action"

                icon="◷"

                tone="amber"

              />

              <StatCard

                title="In progress"

                number={inProgress}

                caption="Currently being handled"

                icon="↗"

                tone="blue"

              />

              <StatCard

                title="Completed"

                number={completed}

                caption="Successfully resolved"

                icon="✓"

                tone="green"

              />

            </section>

          )}

          {activeMenu === "My Requests" && (

            <section className="stats-grid">

              <StatCard

                title="My requests"

                number={tasks.length}

                caption="Requests submitted"

                icon="▤"

                tone="purple"

              />

              <StatCard

                title="Awaiting action"

                number={pending}

                caption="Pending requests"

                icon="◷"

                tone="amber"

              />

              <StatCard

                title="Being handled"

                number={inProgress}

                caption="In progress"

                icon="↗"

                tone="blue"

              />

              <StatCard

                title="Resolved"

                number={completed}

                caption="Completed requests"

                icon="✓"

                tone="green"

              />

            </section>

          )}

          {activeMenu === "All Tasks" && (

            <section className="stats-grid">

              <StatCard

                title="All tasks"

                number={tasks.length}

                caption="Tasks in workspace"

                icon="▤"

                tone="purple"

              />

              <StatCard

                title="Pending"

                number={pending}

                caption="Not started yet"

                icon="◷"

                tone="amber"

              />

              <StatCard

                title="In progress"

                number={inProgress}

                caption="Currently active"

                icon="↗"

                tone="blue"

              />

              <StatCard

                title="Completed"

                number={completed}

                caption="Finished tasks"

                icon="✓"

                tone="green"

              />

            </section>

          )}

          {activeMenu === "Activity" && (

            <section className="stats-grid">

              <StatCard

                title="Completed activities"

                number={completed}

                caption="Finished successfully"

                icon="✓"

                tone="green"

              />

              <StatCard

                title="Total requests"

                number={tasks.length}

                caption="Across your workspace"

                icon="▤"

                tone="purple"

              />

              <StatCard

                title="Completion rate"

                number={completionRate}

                caption="Percent of tasks completed"

                icon="◉"

                tone="blue"

              />

              <StatCard

                title="Still open"

                number={pending + inProgress}

                caption="Pending or in progress"

                icon="◷"

                tone="amber"

              />

            </section>

          )}

          {apiLoading && (

            <p role="status">Loading tasks from database...</p>

          )}

          {apiError && (

            <p role="alert">{apiError}</p>

          )}

          {activeMenu === "Categories" && isAdmin && (
            <section className="panel tasks-panel" style={{ padding: "24px", marginBottom: "24px" }}>
              <div className="panel-header"><div><h2>Categories management</h2><p>Create and maintain the request categories available across your VoiceDesk workspace.</p></div></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", margin: "18px 0" }}>
                <div style={{ padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><small>Total categories</small><h2 style={{ margin: "8px 0 0" }}>{workspaceCategories.length}</h2></div>
                <div style={{ padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><small>Active</small><h2 style={{ margin: "8px 0 0" }}>{workspaceCategories.filter((item) => item.is_active === true || item.is_active === 1).length}</h2></div>
                <div style={{ padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><small>Inactive</small><h2 style={{ margin: "8px 0 0" }}>{workspaceCategories.filter((item) => item.is_active === false || item.is_active === 0).length}</h2></div>
              </div>
              <div className="panel-header"><div><h2>Add a category</h2><p>Use a clear name employees can recognise when submitting a request.</p></div></div>
              <form onSubmit={createWorkspaceCategory} style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "16px 0 24px" }}>
                <input className="auth-input" style={{ flex: "1 1 240px" }} placeholder="Category name" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={80} required />
                <button className="primary-button" type="submit" disabled={!newCategoryName.trim()}>Add category</button>
              </form>
              {categoriesError && <p role="alert" className="auth-error">{categoriesError}</p>}
              {categoriesNotice && <p role="status" className="auth-success">{categoriesNotice}</p>}
              <div className="panel-header"><div><h2>Category directory</h2><p>Inactive categories remain in the directory but should not be offered for new requests.</p></div></div>
              {categoriesLoading ? <p>Loading categories…</p> : <div className="task-table-wrap"><table className="task-table"><thead><tr><th>NAME</th><th>STATUS</th><th>ID</th><th>ACTIONS</th></tr></thead><tbody>
                {workspaceCategories.map((category) => <tr key={category.id}>
                  <td>{categoryEditId === category.id ? <form onSubmit={(event) => { event.preventDefault(); void updateWorkspaceCategory(category.id, { name: categoryEditName.trim() }); }} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><input className="auth-input" aria-label={`New name for ${category.name}`} value={categoryEditName} onChange={(event) => setCategoryEditName(event.target.value)} maxLength={80} required autoFocus /><button type="submit" className="primary-button" disabled={!categoryEditName.trim()}>Save</button><button type="button" onClick={() => { setCategoryEditId(null); setCategoryEditName(""); }}>Cancel</button></form> : category.name}</td>
                  <td>{category.is_active === true || category.is_active === 1 ? "Active" : "Inactive"}</td><td>{category.id}</td>
                  <td>{categoryEditId !== category.id && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><button type="button" onClick={() => { setCategoryEditId(category.id); setCategoryEditName(category.name); }}>Rename</button><button type="button" onClick={() => void updateWorkspaceCategory(category.id, { is_active: !(category.is_active === true || category.is_active === 1) })}>{category.is_active === true || category.is_active === 1 ? "Deactivate" : "Activate"}</button></div>}</td>
                </tr>)}
                {workspaceCategories.length === 0 && !categoriesLoading && <tr><td colSpan={4}>No categories found. Add your first category above.</td></tr>}
              </tbody></table></div>}
            </section>
          )}
          {activeMenu === "User Management" && isAdmin && (
            <section className="panel tasks-panel" style={{ padding: "24px", marginBottom: "24px" }}>
              <div className="panel-header"><div><h2>Admin workspace</h2><p>Manage accounts, review access levels, and monitor workspace activity.</p></div></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", margin: "18px 0" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><span>Total users</span><strong>{adminUsers.length}</strong><small>Registered accounts</small></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><span>Administrators</span><strong>{adminUsers.filter((u) => u.role === "admin").length}</strong><small>Admin access</small></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><span>IT Support</span><strong>{adminUsers.filter((u) => u.role === "it_support").length}</strong><small>Task management access</small></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", border: "1px solid var(--border, rgba(140,140,160,.25))", borderRadius: "14px" }}><span>Total tasks loaded</span><strong>{tasks.length}</strong><small>{tasks.filter((t) => t.status === "Completed").length} completed</small></div>
              </div>
              <div className="panel-header"><div><h2>Create workspace user</h2><p>Use a temporary password and assign the minimum required role.</p></div></div>
              <form onSubmit={createWorkspaceUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", margin: "18px 0" }}>
                <input className="auth-input" placeholder="Full name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
                <input className="auth-input" type="email" placeholder="Email address" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                <input className="auth-input" type="password" placeholder="Temporary password (10+ chars)" minLength={10} value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required />
                <select className="auth-input" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as AdminUser["role"])}><option value="employee">Employee</option><option value="it_support">IT Support</option><option value="admin">Admin</option></select>
                <button className="primary-button" type="submit">Create user</button>
              </form>
              <div className="panel-header" style={{ marginTop: "22px" }}><div><h2>User directory</h2><p>Search accounts and update roles. Your own admin role is locked to prevent accidental lockout.</p></div></div>
              <input className="auth-input" style={{ width: "100%", maxWidth: "420px", margin: "12px 0 16px" }} placeholder="Search by name, email, role, or ID…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              {usersError && <p role="alert" className="auth-error">{usersError}</p>}
              {usersNotice && <p role="status" className="auth-success">{usersNotice}</p>}
              {usersLoading ? <p>Loading users…</p> : <div className="task-table-wrap"><table className="task-table"><thead><tr><th>USER</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>ID</th><th>ACTIONS</th></tr></thead><tbody>
                {adminUsers.filter((user) => `${user.full_name} ${user.email} ${user.role} ${user.id}`.toLowerCase().includes(userSearch.trim().toLowerCase())).map((user) => <tr key={user.id}><td>{user.full_name}</td><td>{user.email}</td><td><select aria-label={`Role for ${user.email}`} value={user.role} disabled={user.id === currentUser?.id} onChange={(e) => void changeWorkspaceUserRole(user.id, e.target.value as AdminUser["role"])}><option value="employee">Employee</option><option value="it_support">IT Support</option><option value="admin">Admin</option></select></td><td>{user.is_active === false ? "Inactive" : "Active"}</td><td>{user.id}</td><td><div style={{ position: "relative", display: "inline-block" }}><button type="button" className="secondary-button" aria-expanded={openUserActions === user.id} aria-haspopup="menu" disabled={user.id === currentUser?.id} onClick={() => setOpenUserActions((id) => id === user.id ? null : user.id)}>Actions ▾</button>{openUserActions === user.id && <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: "210px", padding: "6px", background: "var(--panel, #fff)", border: "1px solid var(--border, #d9ddeb)", borderRadius: "10px", boxShadow: "0 10px 28px rgba(20,30,60,.16)" }}><button role="menuitem" type="button" className="secondary-button" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "5px" }} onClick={() => void rpZELkorMwhkkpShF5PvT8YnqRCupnLTNG(user.id, user.full_name)}>🔑 Change User Password</button><button role="menuitem" type="button" className="secondary-button" style={{ display: "block", width: "100%", textAlign: "left", color: "#c62828" }} disabled={user.role === "admin"} title={user.role === "admin" ? "Admin accounts are protected" : `Delete ${user.full_name}`} onClick={() => { setOpenUserActions(null); void deleteWorkspaceUser(user.id, user.full_name); }}>🗑 Delete User</button></div>}</div></td></tr>)}
                {adminUsers.filter((user) => `${user.full_name} ${user.email} ${user.role} ${user.id}`.toLowerCase().includes(userSearch.trim().toLowerCase())).length === 0 && <tr><td colSpan={6}>No matching users found.</td></tr>}
              </tbody></table></div>}
            </section>
          )}
          {activeMenu !== "User Management" && activeMenu !== "Categories" && (
          <section className="content-grid">

            <div className="panel tasks-panel">

              <div className="panel-header">

                <div>

                  <h2>{copy.panelTitle}</h2>

                  <p>{copy.panelSubtitle}</p>

                </div>

                {(activeMenu === "Dashboard" ||

                  activeMenu === "Activity") && (

                  <button

                    className="text-button"

                    onClick={() => {

                      setActiveMenu(

                        activeMenu === "Activity"

                          ? "All Tasks"

                          : "My Requests"

                      );

                      setTaskFilter("All");

                    }}

                  >

                    {activeMenu === "Activity"

                      ? "All tasks"

                      : "View my requests"}{" "}

                    <span>→</span>

                  </button>

                )}

              </div>

              {activeMenu === "All Tasks" && (

                <div className="task-filters">

                  {(

                    [

                      "All",

                      "Pending",

                      "In Progress",

                      "Completed",

                    ] as const

                  ).map((filter) => (

                    <button

                      key={filter}

                      type="button"

                      className={`task-filter ${

                        taskFilter === filter ? "selected" : ""

                      }`}

                      onClick={() => setTaskFilter(filter)}

                    >

                      {filter}

                      <span>

                        {filter === "All"

                          ? tasks.length

                          : tasks.filter(

                              (task) => task.status === filter

                            ).length}

                      </span>

                    </button>

                  ))}

                </div>

              )}

              <div className="task-table-wrap">

                <table className="task-table">

                  <thead>

                    <tr>

                      <th>REQUEST</th>

                      <th>PRIORITY</th>

                      <th>STATUS</th>

                      <th>DATE</th>

                    </tr>

                  </thead>

                  <tbody>

                    {visibleTasks.map((task) => (

                      <tr key={task.id}>

                        <td>

                          <div className="task-name">{task.title}</div>

                          <div className="task-meta">

                            {task.id} · {task.category}

                          </div>

                        </td>

                        <td>

                          <span

                            className={`priority ${task.priority.toLowerCase()}`}

                          >

                            <span />

                            {task.priority}

                          </span>

                        </td>

                        <td>
                          {canManageTasks ? (
                            <select aria-label={`Update status for ${task.title}`} value={task.status} onChange={(event) => void updateTaskStatus(task.id, event.target.value as Status)}>
                              <option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className={`status-pill ${task.status.toLowerCase().replace(" ", "-")}`}>{task.status}</span>
                          )}
                        </td>

                        <td className="date-cell">{task.date}</td>

                      </tr>

                    ))}

                    {visibleTasks.length === 0 && (

                      <tr>

                        <td colSpan={4} className="empty-state">

                          No tasks match this filter.

                        </td>

                      </tr>

                    )}

                  </tbody>

                </table>

              </div>

              <div className="table-footer">

                Showing {visibleTasks.length}{" "}

                {activeMenu === "Activity"

                  ? "completed activities"

                  : "tasks"}

                <span>{currentUser?.role === "employee" ? "Your requests only" : "Workspace tasks"}</span>

              </div>

            </div>

            {activeMenu === "Dashboard" && (

              <div className="right-column">

                <section className="panel quick-panel">

                  <div className="panel-header">

                    <div>

                      <h2>Task overview</h2>

                      <p>Your completion snapshot</p>

                    </div>

                    <span className="overview-icon">◉</span>

                  </div>

                  <div className="progress-heading">

                    <span>Completion rate</span>

                    <strong>{completionRate}%</strong>

                  </div>

                  <div

                    className="progress-track"

                    role="progressbar"

                    aria-valuenow={completionRate}

                    aria-valuemin={0}

                    aria-valuemax={100}

                  >

                    <div

                      className="progress-fill"

                      style={{ width: `${completionRate}%` }}

                    />

                  </div>

                  <div className="overview-footer">

                    <span>

                      <i className="legend-dot green-dot" />

                      Completed

                    </span>

                    <span>

                      {completed} of {tasks.length} tasks

                    </span>

                  </div>

                </section>

              </div>

            )}

          </section>
          )}

          <footer className="page-footer">

            <span>© 2026 VoiceDesk</span>

            <span>Designed for clarity. Powered by AI.</span>

          </footer>

        </div>

      </main>

      {/* One floating 3D robot. The greeting and robot move together. */}
      <style>{`
        @keyframes vdRobotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .vd-robot-float {
          animation: vdRobotFloat 2.8s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .vd-robot-greeting {
          position: absolute;
          right: 0;
          bottom: 195px;
          width: min(285px, calc(100vw - 40px));
          box-sizing: border-box;
          z-index: 5;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.98);
          color: #282442;
          border: 1px solid #e4ddff;
          box-shadow: 0 8px 28px rgba(42, 30, 92, 0.15);
          font-size: 12px;
          line-height: 1.45;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .vd-robot-float { animation: none; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          right: "18px",
          bottom: showAssistantPanel ? "350px" : "18px",
          zIndex: 900,
          width: "170px",
          height: "205px",
          pointerEvents: "auto",
          cursor: "grab",
          touchAction: "none",
          transform: `translate(${robotOffset.x}px, ${robotOffset.y}px)`,
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
        aria-label="VoiceDesk robot assistant. Drag to move; click to open or close the voice assistant."
        role="button"
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          robotDidMove.current = false;
          robotDragStart.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            offsetX: robotOffset.x,
            offsetY: robotOffset.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = robotDragStart.current;
          if (!drag) return;
          const dx = event.clientX - drag.pointerX;
          const dy = event.clientY - drag.pointerY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) robotDidMove.current = true;
          setRobotOffset({ x: drag.offsetX + dx, y: drag.offsetY + dy });
        }}
        onPointerUp={() => { robotDragStart.current = null; }}
        onPointerCancel={() => { robotDragStart.current = null; }}
        onClick={() => {
          if (robotDidMove.current) {
            robotDidMove.current = false;
            return;
          }
          // One robot click opens the panel and immediately starts listening.
          setShowAssistantPanel(true);
          startVoiceAssistant();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setShowAssistantPanel(true);
            startVoiceAssistant();
          }
        }}
      >
        <div className="vd-robot-greeting">
          <strong style={{ display: "block", marginBottom: "3px", color: "#6548df" }}>
            Hi there! 👋 I'm VoiceDesk.
          </strong>
          Click me to talk. I can create requests, show your tasks, and check task status.
        </div>

        <div
          className="vd-robot-float"
          style={{
            position: "relative",
            width: "165px",
            height: "170px",
            display: "grid",
            placeItems: "center",
            filter: "drop-shadow(0 12px 18px rgba(113, 74, 220, 0.22))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <VoiceDeskRobot3D speaking={isListening || voiceMode === "speaking"} />
        </div>

        <div
          style={{
            marginTop: "-2px",
            padding: "4px 12px",
            borderRadius: "999px",
            color: "#8a67f5",
            background: "rgba(239, 232, 255, 0.9)",
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "2px",
          }}
        >
          ✦ READY
        </div>
      </div>

      {/* The voice assistant card opens only when the robot is clicked. */}
      {showAssistantPanel && (
      <section

        aria-label="VoiceDesk voice assistant"

        style={{

          position: "fixed",

          right: "22px",

          bottom: "22px",

          zIndex: 1000,

          width: "min(330px, calc(100vw - 32px))",

          padding: "16px",

          borderRadius: "18px",

          border: "1px solid rgba(133, 115, 255, 0.45)",

          background: "rgba(18, 20, 38, 0.97)",

          color: "#f5f4ff",

          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",

          backdropFilter: "blur(16px)",

        }}

      >

        <div

          style={{

            display: "flex",

            alignItems: "center",

            justifyContent: "space-between",

            gap: "12px",

            marginBottom: "8px",

          }}

        >

          <strong style={{ fontSize: "14px" }}>

            ✦ VoiceDesk Assistant

          </strong>

          <span

            style={{

              fontSize: "11px",

              color:
              voiceMode === "error"
                ? "#ff8298"
                : voiceMode === "listening"
                  ? "#55e6ff"
                  : voiceMode === "thinking"
                    ? "#ffd27a"
                    : voiceMode === "speaking"
                      ? "#b7a6ff"
                      : "#8ee6bf",
          }}
        >
          {voiceMode === "listening"
            ? "● LISTENING"
            : voiceMode === "thinking"
              ? "● THINKING"
              : voiceMode === "speaking"
                ? "● SPEAKING"
                : voiceMode === "error"
                  ? "● CHECK MIC"
                  : "● READY"}

          </span>
          <button
            type="button"
            className="vd-robot-close"
            aria-label="Close VoiceDesk assistant panel"
            title="Close assistant"
            onClick={() => setShowAssistantPanel(false)}
            style={{ border: 0, borderRadius: "8px", background: "transparent", color: "#f5f4ff", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 7px", marginLeft: "4px" }}
          >×</button>

        </div>

        <p

          style={{

            margin: "0 0 12px",

            fontSize: "12px",

            lineHeight: 1.5,

            color: "#c3c2d8",

          }}

        >

          Hi there! 👋 I'm your VoiceDesk assistant. I can help you create requests, check your tasks, and update task status. Choose “Talk to VoiceDesk” and tell me what you need. Try “show pending tasks” or “create task”.

        </p>

        <div style={{ fontSize: "12px", marginBottom: "10px", color: "#c3c2d8" }}>
          Voice language: English (India)
        </div>
        <button
          type="button"
          className="voice-button"
          onClick={startVoiceAssistant}

          disabled={isListening}

          style={{

            width: "100%",

            justifyContent: "center",

            opacity: isListening ? 0.75 : 1,

          }}

        >

          <span>{isListening ? "🎙️" : "🎤"}</span>

          {isListening ? "Listening..." : voiceTranscript ? "🎤 Talk again" : "🎤 Talk to VoiceDesk"}

        </button>

        {voiceTranscript && (

          <div

            aria-live="polite"

            style={{

              marginTop: "10px",

              fontSize: "12px",

              color: "#dedcff",

              overflowWrap: "anywhere",

            }}

          >

            {voiceTranscript === "Listening..."
            ? "I'm listening..."
            : `You said: ${voiceTranscript}`}

          </div>

        )}

      </section>
      )}

      {notice && (

        <div className="toast" role="status">

          <span>✓</span>

          {notice}

          <button

            onClick={() => setNotice("")}

            aria-label="Dismiss notice"

          >

            ×

          </button>

        </div>

      )}

      {showPasswordModal && currentUser && (
        <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !passwordBusy) setShowPasswordModal(false); }}>
          <section className="panel" role="dialog" aria-modal="true" aria-labelledby="change-password-title" style={{ width: "min(100% - 32px, 480px)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: "24px", margin: "auto" }}>
            <div className="panel-header"><div><h2 id="change-password-title">Change password</h2><p>Use your current password and choose a new one (at least 10 characters).</p></div></div>
            <form onSubmit={changeOwnPassword} style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              <input className="auth-input" type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <input className="auth-input" type="password" autoComplete="new-password" placeholder="New password (10+ characters)" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <input className="auth-input" type="password" autoComplete="new-password" placeholder="Confirm new password" minLength={10} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
              {passwordError && <p role="alert" className="auth-error">{passwordError}</p>}
              {passwordNotice && <p role="status" className="auth-success">{passwordNotice}</p>}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="secondary-button" type="button" disabled={passwordBusy} onClick={() => setShowPasswordModal(false)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={passwordBusy}>{passwordBusy ? "Changing…" : "Change password"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showModal && currentUser && (

        <div

          className="modal-backdrop"

          style={{ overflowY: "auto", overscrollBehavior: "contain" }}

          onClick={() => { setShowModal(false); setTaskDraft(null); }}

        >

          <div

            className="request-modal"

            style={{
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              overscrollBehavior: "contain",
              boxSizing: "border-box",
            }}

            role="dialog"

            aria-modal="true"

            aria-labelledby="request-title"

            onClick={(event) => event.stopPropagation()}

          >

            <button

              className="modal-close"

              onClick={() => setShowModal(false)}

              aria-label="Close"

            >

              ×

            </button>

            <div className="modal-symbol">✦</div>

            <div className="eyebrow">NEW REQUEST</div>

            <h2 id="request-title">What needs to get done?</h2>

            <p>

              Describe your request below. You can type it or use the

              VoiceDesk Assistant.

            </p>

            {!taskDraft ? (
              <>
                <label htmlFor="request-text">Request description</label>
                <textarea
                  id="request-text"
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="e.g. Fix my laptop"
                  rows={4}
                  autoFocus
                />
                <p style={{ fontSize: "12px", opacity: 0.75, marginTop: "8px" }}>
                  VoiceDesk will prepare a draft. Nothing is saved until you review and confirm it.
                </p>
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => { setShowModal(false); setTaskDraft(null); }}>Cancel</button>
                  <button className="primary-button" onClick={() => void createRequest()} disabled={!requestText.trim() || requestBusy}>
                    {requestBusy ? "Preparing preview…" : "Review request →"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ border: "1px solid #d9d5ff", borderRadius: "12px", padding: "14px", margin: "12px 0", background: "rgba(125, 110, 255, 0.06)" }}>
                  <strong style={{ display: "block", marginBottom: "10px" }}>Review request draft</strong>
                  <p style={{ fontSize: "12px", margin: "0 0 12px", opacity: 0.75 }}>This is a rule-based draft, not an LLM-generated result. Please check the details.</p>
                  <label htmlFor="draft-title">Task title</label>
                  <input id="draft-title" value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px", margin: "6px 0 12px", borderRadius: "8px", border: "1px solid #d5d5e5" }} />
                  <label htmlFor="draft-category">Category</label>
                  <select id="draft-category" value={taskDraft.category} onChange={(event) => setTaskDraft({ ...taskDraft, category: event.target.value })} style={{ width: "100%", padding: "10px", margin: "6px 0 12px", borderRadius: "8px" }}>
                    {(activeCategories.length ? activeCategories : REQUEST_CATEGORIES).map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <label htmlFor="draft-priority">Priority</label>
                  <select id="draft-priority" value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value as TaskDraft["priority"] })} style={{ width: "100%", padding: "10px", margin: "6px 0 12px", borderRadius: "8px" }}>
                    {REQUEST_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                  <label htmlFor="draft-location">Location (optional)</label>
                  <input id="draft-location" value={taskDraft.location} onChange={(event) => setTaskDraft({ ...taskDraft, location: event.target.value })} placeholder="e.g. 2nd floor, meeting room" style={{ width: "100%", boxSizing: "border-box", padding: "10px", margin: "6px 0 12px", borderRadius: "8px", border: "1px solid #d5d5e5" }} />
                  <label htmlFor="draft-deadline">Deadline (optional)</label>
                  <input id="draft-deadline" type="date" value={taskDraft.deadline} onChange={(event) => setTaskDraft({ ...taskDraft, deadline: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px", margin: "6px 0 12px", borderRadius: "8px", border: "1px solid #d5d5e5" }} />
                  <label htmlFor="original-request">Original request</label>
                  <textarea id="original-request" value={taskDraft.original_request} readOnly rows={3} style={{ width: "100%", boxSizing: "border-box", marginTop: "6px" }} />
                </div>
                <div className="modal-actions">
                  <button className="secondary-button" disabled={requestBusy} onClick={() => setTaskDraft(null)}>Back to edit</button>
                  <button className="primary-button" disabled={requestBusy || !taskDraft.title.trim()} onClick={() => void confirmRequest()}>
                    {requestBusy ? "Saving…" : "Confirm & create task ✓"}
                  </button>
                </div>
              </>
            )}

          </div>

        </div>

      )}

    </div>

  );

}

export default App;