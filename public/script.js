const API_BASE = "";

// ===== State =====
const state = {
  token: null,
  currentUser: null,
  posts: [],
  stories: [],
  highlights: [],
  chats: [],
  activeChatId: null
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function authHeaders() {
  return state.token ? { "x-auth-token": state.token, "Content-Type": "application/json" } : {};
}

function isValidUsername(username) {
  if (!username) return false;
  if (/\s/.test(username)) return false;
  return /^[a-zA-Z0-9._]+$/.test(username);
}

// ===== Auth UI =====
function handleAuthTabs() {
  const tabs = $$(".auth-tab");
  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.authTab;
      if (target === "login") {
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
      } else {
        registerForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
      }
    });
  });
}

async function registerUser(e) {
  e.preventDefault();
  const username = $("#registerUsername").value.trim();
  const password = $("#registerPassword").value.trim();
  const avatarInput = $("#registerAvatar");

  if (!isValidUsername(username)) {
    alert("Tên đăng nhập không hợp lệ (không có dấu cách, chỉ chữ, số, ., _).");
    return;
  }
  if (!password) {
    alert("Vui lòng nhập mật khẩu.");
    return;
  }

  let avatarUrl = "";
  const file = avatarInput.files[0];
  if (file) {
    avatarUrl = await fileToBase64(file);
  }

  try {
    const res = await fetch(API_BASE + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, avatarUrl })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Đăng ký thất bại.");
      return;
    }
    state.token = data.token;
    state.currentUser = data.user;
    afterLogin();
  } catch (err) {
    console.error(err);
    alert("Lỗi kết nối server.");
  }
}

async function loginUser(e) {
  e.preventDefault();
  const username = $("#loginUsername").value.trim();
  const password = $("#loginPassword").value.trim();

  try {
    const res = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Đăng nhập thất bại.");
      return;
    }
    state.token = data.token;
    state.currentUser = data.user;
    afterLogin();
  } catch (err) {
    console.error(err);
    alert("Lỗi kết nối server.");
  }
}

function afterLogin() {
  $("#currentUsername").textContent = state.currentUser.username;
  $("#profileUsername").textContent = state.currentUser.username;

  const avatarEls = [$("#currentUserAvatar"), $("#composerAvatar"), $("#profileAvatar")];
  avatarEls.forEach((el) => {
    if (!el) return;
    if (state.currentUser.avatarUrl) {
      el.style.backgroundImage = `url(${state.currentUser.avatarUrl})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
    }
  });

  if (state.currentUser.role === "admin") {
    $("#adminNav").style.display = "flex";
  } else {
    $("#adminNav").style.display = "none";
  }

  $("#authScreen").classList.add("hidden");
  $("#appLayout").classList.remove("hidden");

  loadAllData();
}

function initAuth() {
  handleAuthTabs();
  $("#registerForm").addEventListener("submit", registerUser);
  $("#loginForm").addEventListener("submit", loginUser);
  $("#logoutButton").addEventListener("click", () => {
    state.token = null;
    state.currentUser = null;
    $("#authScreen").classList.remove("hidden");
    $("#appLayout").classList.add("hidden");
  });
}

// ===== API helpers =====
async function loadAllData() {
  await Promise.all([loadPosts(), loadStories(), loadHighlights(), loadChats()]);
  renderAll();
}

async function loadPosts() {
  try {
    const res = await fetch(API_BASE + "/api/posts", { headers: authHeaders() });
    if (!res.ok) return;
    state.posts = await res.json();
  } catch (e) {
    console.error(e);
  }
}

async function loadStories() {
  try {
    const res = await fetch(API_BASE + "/api/stories", { headers: authHeaders() });
    if (!res.ok) return;
    state.stories = await res.json();
  } catch (e) {
    console.error(e);
  }
}

async function loadHighlights() {
  try {
    const res = await fetch(API_BASE + "/api/highlights", { headers: authHeaders() });
    if (!res.ok) return;
    state.highlights = await res.json();
  } catch (e) {
    console.error(e);
  }
}

async function loadChats() {
  try {
    const res = await fetch(API_BASE + "/api/chats", { headers: authHeaders() });
    if (!res.ok) return;
    state.chats = await res.json();
  } catch (e) {
    console.error(e);
  }
}

// ===== Navigation =====
function initNavigation() {
  const navItems = $$(".nav-item");
  const pages = {
    feed: $("#page-feed"),
    chat: $("#page-chat"),
    story: $("#page-story"),
    profile: $("#page-profile"),
    admin: $("#page-admin")
  };

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pageKey = btn.dataset.page;
      navItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(pages).forEach((p) => p && p.classList.add("hidden"));
      pages[pageKey] && pages[pageKey].classList.remove("hidden");

      if (pageKey === "admin" && state.currentUser?.role === "admin") {
        loadAdminMessages();
      }
    });
  });
}

// ===== Posts / Feed =====
function initComposer() {
  const textarea = $("#postContent");
  const charCount = $("#postCharCount");
  const imageInput = $("#postImage");
  const postButton = $("#postButton");

  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    charCount.textContent = `${len}/280`;
    charCount.style.color = len > 280 ? "#f97373" : "";
  });

  postButton.addEventListener("click", async () => {
    if (!state.currentUser) return;
    const text = textarea.value.trim();
    const file = imageInput.files[0];

    if (!text && !file) {
      alert("Hãy nhập nội dung hoặc chọn ảnh.");
      return;
    }

    let imageUrl = "";
    if (file) {
      imageUrl = await fileToBase64(file);
    }

    try {
      const res = await fetch(API_BASE + "/api/posts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text, imageUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không đăng được bài.");
        return;
      }
      state.posts.unshift(data);
      textarea.value = "";
      imageInput.value = "";
      charCount.textContent = "0/280";
      renderFeed();
      renderProfilePosts();
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối server.");
    }
  });
}

function renderFeed() {
  const container = $("#feedList");
  container.innerHTML = "";
  state.posts.forEach((post) => {
    const div = document.createElement("article");
    div.className = "post-card";
    const date = new Date(post.createdAt);
    div.innerHTML = `
      <header class="post-header">
        <div class="post-author">
          <div class="avatar avatar-sm" style="${
            post.avatarUrl
              ? `background-image:url(${post.avatarUrl});background-size:cover;background-position:center;`
              : ""
          }"></div>
          <div>
            <div class="post-author-name">${post.username}</div>
            <div class="post-meta">${date.toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit"
            })}</div>
          </div>
        </div>
      </header>
      <div class="post-content">${post.text || ""}</div>
      ${
        post.imageUrl
          ? `<div class="post-image"><img src="${post.imageUrl}" alt="Ảnh bài viết" /></div>`
          : ""
      }
      <footer class="post-footer">
        <span>👍 Thích</span>
        <span>💬 Bình luận</span>
      </footer>
    `;
    container.appendChild(div);
  });
}

// ===== Story =====
function initStories() {
  $("#addStoryFromFeed").addEventListener("click", () => {
    const navBtn = document.querySelector('.nav-item[data-page="story"]');
    navBtn && navBtn.click();
  });

  const storyForm = $("#storyForm");
  const storyImageInput = $("#storyImage");

  storyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const text = $("#storyText").value.trim();
    const file = storyImageInput.files[0];

    if (!text && !file) {
      alert("Hãy nhập nội dung hoặc chọn ảnh cho story.");
      return;
    }

    let imageUrl = "";
    if (file) {
      imageUrl = await fileToBase64(file);
    }

    try {
      const res = await fetch(API_BASE + "/api/stories", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text, imageUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không đăng được story.");
        return;
      }
      state.stories.unshift(data);
      $("#storyText").value = "";
      storyImageInput.value = "";
      renderStoriesEverywhere();
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối server.");
    }
  });

  const highlightForm = $("#highlightForm");
  highlightForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#highlightName").value.trim();
    if (!name) return;
    try {
      const res = await fetch(API_BASE + "/api/highlights", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không tạo được highlight.");
        return;
      }
      state.highlights.push(data);
      $("#highlightName").value = "";
      renderHighlights();
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối server.");
    }
  });
}

async function addStoryToFirstHighlight(storyId) {
  if (!state.highlights.length) {
    alert("Hãy tạo highlight trước.");
    return;
  }
  const first = state.highlights[0];
  try {
    const res = await fetch(API_BASE + `/api/highlights/${first.id}/addStory`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ storyId })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Không thêm được vào highlight.");
      return;
    }
    // cập nhật local
    const idx = state.highlights.findIndex((h) => h.id === first.id);
    if (idx >= 0) state.highlights[idx] = data;
    renderHighlights();
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối server.");
  }
}

function renderStoriesEverywhere() {
  const feedList = $("#storiesFeedList");
  const activeStories = $("#activeStories");
  const archivedStories = $("#archivedStories");
  feedList.innerHTML = "";
  activeStories.innerHTML = "";
  archivedStories.innerHTML = "";

  const now = Date.now();

  state.stories.forEach((story) => {
    const isArchived = story.archived || new Date(story.expiresAt).getTime() < now;

    if (!isArchived) {
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = "story-card";
      bubble.innerHTML = `
        <div class="avatar avatar-md" style="${
          story.avatarUrl
            ? `background-image:url(${story.avatarUrl});background-size:cover;background-position:center;`
            : ""
        }"></div>
        <span>@${story.username}</span>
      `;
      feedList.appendChild(bubble);
    }

    const item = document.createElement("div");
    item.className = "story-list-item";
    const created = new Date(story.createdAt);
    item.innerHTML = `
      <div class="avatar avatar-sm" style="${
        story.avatarUrl
          ? `background-image:url(${story.avatarUrl});background-size:cover;background-position:center;`
          : ""
      }"></div>
      <div>
        <div class="story-list-text">${story.text || "(Story chỉ có ảnh)"}</div>
        <div class="story-list-meta">${created.toLocaleString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit"
        })}</div>
      </div>
      <button class="btn subtle" type="button">Thêm vào highlight</button>
    `;
    const btn = item.querySelector("button");
    btn.addEventListener("click", () => addStoryToFirstHighlight(story.id));

    if (!isArchived) {
      activeStories.appendChild(item);
    } else {
      archivedStories.appendChild(item);
    }
  });

  feedList.scrollLeft = 0;
}

function renderHighlights() {
  const list = $("#highlightList");
  const strip = $("#profileHighlightStrip");
  list.innerHTML = "";
  strip.innerHTML = "";

  state.highlights.forEach((hl) => {
    const pill = document.createElement("div");
    pill.className = "highlight-pill";
    pill.textContent = hl.name;
    list.appendChild(pill);

    const bubble = document.createElement("div");
    bubble.className = "highlight-bubble";
    bubble.innerHTML = `<div class="avatar"></div><span>${hl.name}</span>`;
    strip.appendChild(bubble);
  });
}

// ===== Profile =====
function initProfileAvatarChange() {
  const input = $("#profileAvatarInput");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file || !state.currentUser) return;
    const avatarUrl = await fileToBase64(file);
    try {
      const res = await fetch(API_BASE + "/api/users/me/avatar", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ avatarUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không đổi được avatar.");
        return;
      }
      state.currentUser.avatarUrl = data.avatarUrl;
      afterLogin(); // cập nhật avatar trên UI
      await loadStories();
      await loadPosts();
      renderStoriesEverywhere();
      renderFeed();
      renderProfilePosts();
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối server.");
    }
  });
}

function renderProfilePosts() {
  const container = $("#profilePosts");
  if (!container || !state.currentUser) return;
  container.innerHTML = "";
  const posts = state.posts.filter((p) => p.username === state.currentUser.username);
  posts.forEach((p) => {
    const div = document.createElement("div");
    div.className = "post-card";
    const date = new Date(p.createdAt);
    div.innerHTML = `
      <div class="post-author-name">${p.text || "(Bài viết chỉ có ảnh)"}</div>
      <div class="post-meta">${date.toLocaleString("vi-VN")}</div>
    `;
    container.appendChild(div);
  });
}

// ===== Chat =====
function initChat() {
  $("#chatForm").addEventListener("submit", sendChatMessage);
  $("#newChatGroup").addEventListener("click", createChatGroup);
  $("#audioCallButton").addEventListener("click", () => {
    if (!state.activeChatId) return;
    alert("Mô phỏng gọi thoại tới " + $("#chatTargetName").textContent);
  });
  $("#videoCallButton").addEventListener("click", () => {
    if (!state.activeChatId) return;
    alert("Mô phỏng gọi video tới " + $("#chatTargetName").textContent);
  });
  $("#callButton").addEventListener("click", () => {
    alert("Nút gọi nhanh (mô phỏng, không có backend realtime).");
  });
}

function renderChatList() {
  const list = $("#chatList");
  list.innerHTML = "";
  state.chats.forEach((chat) => {
    const last = chat.messages[chat.messages.length - 1];
    const item = document.createElement("div");
    item.className = "chat-list-item";
    if (chat.id === state.activeChatId) item.classList.add("active");
    item.innerHTML = `
      <div class="avatar avatar-sm"></div>
      <div>
        <div class="chat-list-name">${chat.name}</div>
        <div class="chat-list-last">${last ? last.text.slice(0, 32) : "Chưa có tin nhắn"}</div>
      </div>
      <div class="chat-list-meta">${last ? new Date(last.at).toLocaleTimeString("vi-VN", {hour:"2-digit",minute:"2-digit"}) : ""}</div>
    `;
    item.addEventListener("click", () => {
      state.activeChatId = chat.id;
      renderChatList();
      renderChatWindow(chat.id);
    });
    list.appendChild(item);
  });
}

function renderChatWindow(chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  $("#chatEmptyState").classList.add("hidden");
  $("#chatWindow").classList.remove("hidden");

  $("#chatTargetName").textContent = chat.name;
  $("#chatTargetMeta").textContent = chat.isGroup
    ? "Nhóm chat"
    : "Có thể nhắn tin & gọi điện không cần kết bạn";

  const messagesEl = $("#chatMessages");
  messagesEl.innerHTML = "";
  chat.messages.forEach((m) => {
    const row = document.createElement("div");
    const fromMe = m.from === state.currentUser.id;
    row.className = `chat-message-row ${fromMe ? "me" : "them"}`;
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${fromMe ? "me" : "them"}`;
    bubble.textContent = m.text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendChatMessage(e) {
  e.preventDefault();
  if (!state.currentUser || !state.activeChatId) return;
  const input = $("#chatMessageInput");
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(API_BASE + `/api/chats/${state.activeChatId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Không gửi được tin nhắn.");
      return;
    }
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    chat.messages.push(data);
    input.value = "";
    renderChatWindow(chat.id);
    renderChatList();
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối server.");
  }
}

async function createChatGroup() {
  const name = prompt("Tên nhóm chat mới:");
  if (!name) return;
  try {
    const res = await fetch(API_BASE + "/api/chats", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name, isGroup: true, memberUsernames: [] })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Không tạo được nhóm.");
      return;
    }
    state.chats.unshift(data);
    renderChatList();
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối server.");
  }
}

// ===== Admin view =====
async function loadAdminMessages() {
  try {
    const res = await fetch(API_BASE + "/api/admin/messages", { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Không tải được dữ liệu admin.");
      return;
    }
    const container = $("#adminMessages");
    container.innerHTML = "";
    data.forEach((chat) => {
      const div = document.createElement("div");
      div.className = "story-list-item";
      div.innerHTML = `
        <div>
          <div class="story-list-text"><strong>${chat.name}</strong> (${chat.isGroup ? "Nhóm" : "1-1"})</div>
          <div class="story-list-meta">Thành viên: ${chat.members.join(", ")}</div>
          <div class="story-list-meta">Tin nhắn:</div>
          <ul style="margin:4px 0 0;padding-left:18px;font-size:0.8rem;">
            ${
              chat.messages.length
                ? chat.messages
                    .map(
                      (m) =>
                        `<li>[${new Date(m.at).toLocaleString("vi-VN")}] <strong>${m.from}</strong>: ${m.text}</li>`
                    )
                    .join("")
                : "<li>(Chưa có tin nhắn)</li>"
            }
          </ul>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối server.");
  }
}

// ===== Utils =====
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAll() {
  renderFeed();
  renderStoriesEverywhere();
  renderHighlights();
  renderProfilePosts();
  renderChatList();
}

// ===== Init =====
window.addEventListener("DOMContentLoaded", () => {
  initAuth();
  initNavigation();
  initComposer();
  initStories();
  initProfileAvatarChange();
  initChat();
  initSearch();
});
function initSearch() {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  input.addEventListener("input", () => {
    const keyword = input.value.toLowerCase().trim();

    if (!keyword) {
      results.innerHTML = "";
      return;
    }

    let html = "";

    // tìm bài viết
    const postResults = state.posts.filter(p =>
      (p.text && p.text.toLowerCase().includes(keyword)) ||
      (p.username && p.username.toLowerCase().includes(keyword))
    );

    if (postResults.length > 0) {
      html += "<h3>Kết quả bài viết</h3>";

      postResults.forEach(p => {
        html += `
        <div class="search-item">
          <b>${p.username}</b><br>
          ${p.text || ""}
        </div>
        `;
      });
    }

    if (html === "") {
      html = "<p>Không tìm thấy kết quả</p>";
    }

    results.innerHTML = html;
  });
}


