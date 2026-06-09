import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import {
  sendEmail,
  appBaseUrl,
  WELCOME_SUBJECT,
  welcomeEmailHtml,
} from "../lib/email.js";

const router = Router();

router.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body as {
    email?: string;
    password?: string;
    username?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: username ?? "" },
    },
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Fire-and-forget welcome email. sendEmail never throws (it logs and returns
  // false when email is not configured), so signup is never blocked or failed.
  const base = appBaseUrl();
  void sendEmail({
    to: email,
    subject: WELCOME_SUBJECT,
    html: welcomeEmailHtml(base ? `${base}/` : undefined),
  });

  res.status(201).json({
    user: {
      id: data.user?.id ?? "",
      email: data.user?.email ?? "",
      username: (data.user?.user_metadata?.username as string) ?? "",
    },
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? 0,
        }
      : null,
  });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
      username: (data.user.user_metadata?.username as string) ?? "",
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? 0,
    },
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const { error } = await supabase.auth.admin.signOut(token);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ message: "Logged out successfully" });
});

router.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body as { refresh_token?: string };

  if (!refresh_token) {
    res.status(400).json({ error: "refresh_token is required" });
    return;
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({
    session: {
      access_token: data.session?.access_token ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      expires_at: data.session?.expires_at ?? 0,
    },
  });
});

export default router;
