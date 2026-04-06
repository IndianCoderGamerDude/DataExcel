import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// OAuth Configuration
const getOAuth2Client = (redirectUri?: string) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: "ai-ops-session-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: true,
      sameSite: "none",
      httpOnly: true,
    },
  })
);

// API Routes
app.get("/api/auth/google/url", (req, res) => {
  const { origin } = req.query;
  if (!origin) {
    return res.status(400).json({ error: "Origin is required" });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: "Google OAuth credentials not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the Secrets panel in AI Studio Settings." 
    });
  }

  const redirectUri = `${(origin as string).replace(/\/$/, "")}/auth/google/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: Buffer.from(JSON.stringify({ redirectUri })).toString("base64"),
  });
  res.json({ url });
});

app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code, state } = req.query;
  
  try {
    let redirectUri: string | undefined;
    if (state) {
      const decodedState = JSON.parse(Buffer.from(state as string, "base64").toString());
      redirectUri = decodedState.redirectUri;
    }

    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code as string);
    (req.session as any).tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Error exchanging code for tokens:", error);
    const errorMessage = error.response?.data?.error_description || error.message || "Unknown error";
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem; background: #fff5f5;">
          <h1 style="color: #c53030;">Authentication Failed</h1>
          <p>The Google OAuth exchange failed with the following error:</p>
          <pre style="background: #fff; padding: 1rem; border: 1px solid #feb2b2; border-radius: 0.5rem;">${errorMessage}</pre>
          <p><b>Possible causes:</b></p>
          <ul>
            <li>The <b>GOOGLE_CLIENT_SECRET</b> is incorrect.</li>
            <li>The <b>GOOGLE_CLIENT_ID</b> was deleted or is invalid.</li>
            <li>The redirect URI does not match what is configured in the Google Cloud Console.</li>
          </ul>
          <button onclick="window.close()" style="padding: 0.5rem 1rem; background: #c53030; color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
});

app.get("/api/auth/status", (req, res) => {
  const tokens = (req.session as any).tokens;
  res.json({ isAuthenticated: !!tokens });
});

app.get("/api/gmail/invoices", async (req, res) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    // Search for emails with "invoice" or "receipt" in the subject or body
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "invoice OR receipt",
      maxResults: 10,
    });

    const messages = response.data.messages || [];
    const invoiceData = [];

    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });

      const snippet = msg.data.snippet;
      const subject = msg.data.payload?.headers?.find(h => h.name === "Subject")?.value;
      const from = msg.data.payload?.headers?.find(h => h.name === "From")?.value;
      const date = msg.data.payload?.headers?.find(h => h.name === "Date")?.value;

      invoiceData.push({
        id: message.id,
        snippet,
        subject,
        from,
        date,
      });
    }

    res.json({ invoices: invoiceData });
  } catch (error) {
    console.error("Error fetching Gmail messages:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
