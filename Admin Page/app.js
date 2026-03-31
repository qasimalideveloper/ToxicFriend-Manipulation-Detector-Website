const DEFAULT_API_URL = "https://toxicfriend.pythonanywhere.com";
const STORAGE_KEY = "adminDashboardApiUrl";
const AUTH_STORAGE_KEY = "adminAuthenticated";

// Check authentication on page load
if (sessionStorage.getItem(AUTH_STORAGE_KEY) !== "true") {
    window.location.href = "login.html";
}

const state = {
    baseUrl: (() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        if (typeof window !== "undefined" && window.__TOXIC_FRIEND_API_URL__) {
            return window.__TOXIC_FRIEND_API_URL__;
        }
        return DEFAULT_API_URL;
    })(),
    isFetchingLogins: false,
    isFetchingFeedback: false,
};

const dom = {
    apiInput: document.getElementById("api-url-input"),
    apiSaveBtn: document.getElementById("api-save-btn"),
    logoutBtn: document.getElementById("logout-btn"),
    loginsCount: document.getElementById("logins-count"),
    loginsEmpty: document.getElementById("logins-empty"),
    loginsTableWrapper: document.getElementById("logins-table-wrapper"),
    loginsTableBody: document.getElementById("logins-table-body"),
    refreshLoginsBtn: document.getElementById("refresh-logins-btn"),
    feedbackCount: document.getElementById("feedback-count"),
    feedbackEmpty: document.getElementById("feedback-empty"),
    feedbackList: document.getElementById("feedback-list"),
    refreshFeedbackBtn: document.getElementById("refresh-feedback-btn"),
    toastContainer: document.getElementById("toast-container"),
};

function normalizeBaseUrl(url) {
    if (!url) return "";
    return url.replace(/\/$/, "");
}

function setBaseUrl(url) {
    const normalized = normalizeBaseUrl(url);
    if (!normalized) {
        showToast("Please enter a valid URL.", "error");
        return;
    }
    state.baseUrl = normalized;
    localStorage.setItem(STORAGE_KEY, normalized);
    showToast("API base URL saved.", "success");
}

function buildUrl(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${state.baseUrl}${normalizedPath}`;
}

async function fetchJson(endpoint) {
    const url = buildUrl(endpoint);
    const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        mode: "cors",
        credentials: "omit",
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
    }
    return response.json();
}

function showToast(message, type = "info") {
    if (!dom.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 250);
    }, 2800);
}

function formatTimestamp(value) {
    if (!value) return "—";
    try {
        return new Date(value).toUTCString();
    } catch {
        return value;
    }
}

function renderLogins(data) {
    if (!dom.loginsTableBody) return;
    dom.loginsTableBody.innerHTML = "";
    if (!data.length) {
        dom.loginsEmpty.hidden = false;
        dom.loginsTableWrapper.hidden = true;
        dom.loginsCount.textContent = "0";
        return;
    }

    dom.loginsEmpty.hidden = true;
    dom.loginsTableWrapper.hidden = false;
    dom.loginsCount.textContent = data.length;

    data.forEach((item, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.name || "—"}</td>
            <td>${formatTimestamp(item.created_at)}</td>
        `;
        dom.loginsTableBody.appendChild(row);
    });
}

function renderFeedback(data) {
    if (!dom.feedbackList) return;
    dom.feedbackList.innerHTML = "";
    if (!data.length) {
        dom.feedbackEmpty.hidden = false;
        dom.feedbackList.hidden = true;
        dom.feedbackCount.textContent = "0";
        return;
    }

    dom.feedbackEmpty.hidden = true;
    dom.feedbackList.hidden = false;
    dom.feedbackCount.textContent = data.length;

    data.forEach((item) => {
        const card = document.createElement("div");
        card.className = "feedback-card";
        const stars = "★".repeat(item.stars || 0).padEnd(5, "☆");
        card.innerHTML = `
            <div class="feedback-meta">
                <div>
                    <p class="feedback-name">${item.name || "Anonymous"}</p>
                    <p class="feedback-timestamp">${formatTimestamp(item.created_at)}</p>
                </div>
                <div class="feedback-stars" aria-label="Rating">${stars}</div>
            </div>
            <p class="feedback-message">${item.message ? item.message : "<em>No message provided.</em>"}</p>
        `;
        dom.feedbackList.appendChild(card);
    });
}

async function loadLogins() {
    if (state.isFetchingLogins) return;
    state.isFetchingLogins = true;
    dom.refreshLoginsBtn.disabled = true;
    dom.refreshLoginsBtn.textContent = "Loading...";
    try {
        const data = await fetchJson("/api/logins");
        renderLogins(data);
        if (!data.length) {
            showToast("No login records yet.", "info");
        }
    } catch (error) {
        console.error(error);
        showToast("Failed to load logins.", "error");
    } finally {
        state.isFetchingLogins = false;
        dom.refreshLoginsBtn.disabled = false;
        dom.refreshLoginsBtn.textContent = "Refresh";
    }
}

async function loadFeedback() {
    if (state.isFetchingFeedback) return;
    state.isFetchingFeedback = true;
    dom.refreshFeedbackBtn.disabled = true;
    dom.refreshFeedbackBtn.textContent = "Loading...";
    try {
        const data = await fetchJson("/api/feedback");
        renderFeedback(data);
        if (!data.length) {
            showToast("No feedback yet.", "info");
        }
    } catch (error) {
        console.error(error);
        showToast("Failed to load feedback.", "error");
    } finally {
        state.isFetchingFeedback = false;
        dom.refreshFeedbackBtn.disabled = false;
        dom.refreshFeedbackBtn.textContent = "Refresh";
    }
}

function logout() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.href = "login.html";
}

function init() {
    if (dom.apiInput) {
        dom.apiInput.value = state.baseUrl;
    }

    dom.apiSaveBtn?.addEventListener("click", () => {
        setBaseUrl(dom.apiInput.value.trim());
    });

    dom.logoutBtn?.addEventListener("click", logout);

    dom.refreshLoginsBtn?.addEventListener("click", loadLogins);
    dom.refreshFeedbackBtn?.addEventListener("click", loadFeedback);

    loadLogins();
    loadFeedback();
}

document.addEventListener("DOMContentLoaded", init);

