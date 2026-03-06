const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" })); // cho phép gửi base64 ảnh
app.use(express.static(path.join(__dirname, "public"))); // phục vụ frontend

// ====== In-memory DB (RAM) ======
const db = {
  users: [],
  sessions: {}, // token -> userId
  posts: [],
  stories: [],
  highlights: [],
  chats: []
};

// Tạo admin mặc định
const adminUser = {
  id: uuid(),
  username: "admin",
  password: "Huy130609@",
  avatarUrl: "",
  role: "admin"
};
db.users.push(adminUser);

// ====== Helpers ======
function createToken() {
  return uuid();
}

function authMiddleware(req, res, next) {
  const token = req.headers["x-auth-token"];
  if (!token || !db.sessions[token]) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = db.sessions[token];
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

function isValidUsername(username) {
  if (!username) return false;
  if (/\s/.test(username)) return false;
  return /^[a-zA-Z0-9._]+$/.test(username);
}

// ====== Auth APIs ======

// Đăng ký
app.post("/api/auth/register", (req, res) => {
  const { username, password, avatarUrl } = req.body;
  if (!isValidUsername(username)) {
    return res
      .status(400)
      .json({ error: "Tên đăng nhập không hợp lệ (không có dấu cách, chỉ chữ, số, ., _)." });
  }
  if (!password) {
    return res.status(400).json({ error: "Mật khẩu bắt buộc." });
  }
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: "Tên đăng nhập đã tồn tại." });
  }

  const user = {
    id: uuid(),
    username,
    password,
    avatarUrl: avatarUrl || "",
    role: "user"
  };
  db.users.push(user);

  const token = createToken();
  db.sessions[token] = user.id;

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      role: user.role
    }
  });
});

// Đăng nhập
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(400).json({ error: "Sai tên đăng nhập hoặc mật khẩu." });
  }
  const token = createToken();
  db.sessions[token] = user.id;

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      role: user.role
    }
  });
});

// ====== User APIs ======
app.get("/api/users/me", authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    avatarUrl: u.avatarUrl,
    role: u.role
  });
});

app.put("/api/users/me/avatar", authMiddleware, (req, res) => {
  const { avatarUrl } = req.body;
  req.user.avatarUrl = avatarUrl || "";
  res.json({ success: true, avatarUrl: req.user.avatarUrl });
});

// ====== Posts APIs ======
app.get("/api/posts", authMiddleware, (req, res) => {
  // trả về mới nhất trước
  const posts = [...db.posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(posts);
});

app.post("/api/posts", authMiddleware, (req, res) => {
  const { text, imageUrl } = req.body;
  if (!text && !imageUrl) {
    return res.status(400).json({ error: "Cần nội dung hoặc ảnh." });
  }
  const post = {
    id: uuid(),
    userId: req.user.id,
    username: req.user.username,
    avatarUrl: req.user.avatarUrl,
    text: text || "",
    imageUrl: imageUrl || "",
    createdAt: new Date().toISOString()
  };
  db.posts.push(post);
  res.json(post);
});

// ====== Story APIs ======
app.get("/api/stories", authMiddleware, (req, res) => {
  const now = Date.now();
  const stories = db.stories.map((s) => {
    const isExpired = new Date(s.expiresAt).getTime() < now;
    return { ...s, archived: s.archived || isExpired };
  });
  res.json(stories);
});

app.post("/api/stories", authMiddleware, (req, res) => {
  const { text, imageUrl } = req.body;
  if (!text && !imageUrl) {
    return res.status(400).json({ error: "Cần nội dung hoặc ảnh cho story." });
  }
  const story = {
    id: uuid(),
    userId: req.user.id,
    username: req.user.username,
    avatarUrl: req.user.avatarUrl,
    text: text || "",
    imageUrl: imageUrl || "",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    archived: false
  };
  db.stories.push(story);
  res.json(story);
});

// ====== Highlight APIs ======
app.get("/api/highlights", authMiddleware, (req, res) => {
  res.json(db.highlights);
});

app.post("/api/highlights", authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Tên highlight bắt buộc." });
  const hl = {
    id: uuid(),
    userId: req.user.id,
    name,
    storyIds: []
  };
  db.highlights.push(hl);
  res.json(hl);
});

app.post("/api/highlights/:id/addStory", authMiddleware, (req, res) => {
  const { storyId } = req.body;
  const hl = db.highlights.find((h) => h.id === req.params.id);
  if (!hl) return res.status(404).json({ error: "Không tìm thấy highlight." });
  if (!hl.storyIds.includes(storyId)) hl.storyIds.push(storyId);
  res.json(hl);
});

// ====== Chat APIs ======
// Chat = { id, isGroup, name, members: [userId], messages: [{from, to, text, at}] }

app.get("/api/chats", authMiddleware, (req, res) => {
  const userId = req.user.id;
  const chats = db.chats.filter((c) => c.members.includes(userId));
  res.json(chats);
});

app.post("/api/chats", authMiddleware, (req, res) => {
  const { name, isGroup, memberUsernames } = req.body;
  let members = [req.user.id];

  if (Array.isArray(memberUsernames)) {
    memberUsernames.forEach((uname) => {
      const u = db.users.find((x) => x.username === uname);
      if (u && !members.includes(u.id)) members.push(u.id);
    });
  }

  const chat = {
    id: uuid(),
    name: name || "Chat mới",
    isGroup: !!isGroup,
    members,
    messages: []
  };
  db.chats.push(chat);
  res.json(chat);
});

app.post("/api/chats/:id/messages", authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Tin nhắn trống." });
  const chat = db.chats.find((c) => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Không tìm thấy cuộc chat." });
  if (!chat.members.includes(req.user.id)) {
    return res.status(403).json({ error: "Bạn không thuộc cuộc chat này." });
  }
  const msg = {
    id: uuid(),
    from: req.user.id,
    text,
    at: new Date().toISOString()
  };
  chat.messages.push(msg);
  res.json(msg);
});

// ====== Admin APIs ======
// Admin xem toàn bộ tin nhắn
app.get("/api/admin/messages", authMiddleware, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Chỉ admin mới được xem." });
  }
  const all = db.chats.map((c) => ({
    id: c.id,
    name: c.name,
    isGroup: c.isGroup,
    members: c.members.map((id) => {
      const u = db.users.find((x) => x.id === id);
      return u ? u.username : "unknown";
    }),
    messages: c.messages.map((m) => {
      const fromUser = db.users.find((u) => u.id === m.from);
      return {
        id: m.id,
        from: fromUser ? fromUser.username : "unknown",
        text: m.text,
        at: m.at
      };
    })
  }));
  res.json(all);
});

// ====== Serve frontend ======
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("SSC server running on port", PORT);
});
