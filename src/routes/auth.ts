import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { authMiddleware, AuthRequest, JWT_SECRET, formatDbError } from "../middleware/auth.js";
import { sendEmail, buildPasswordSetupEmail } from "../services/email.js";

const router = Router();

interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string;
  date: Date;
}
export const simulatedEmails: SimulatedEmail[] = [];

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: "Preencha todos os campos" });
    
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) return res.status(400).json({ error: "E-mail já cadastrado" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [newUser] = await db.insert(users).values({ email, passwordHash, name }).returning();
    
    const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
  } catch (err: any) {
    res.status(500).json({ error: formatDbError(err) });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Preencha e-mail e senha" });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) return res.status(400).json({ error: "Credenciais inválidas" });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: "Credenciais inválidas" });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err: any) {
    res.status(500).json({ error: formatDbError(err) });
  }
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

router.post("/change-my-password", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
    }

    let user;
    if (userId === 0 && email) {
      const [foundUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (foundUser) {
         user = foundUser;
      } else {
         user = { id: 0, email, passwordHash: null };
      }
    } else {
      const [foundUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      user = foundUser;
    }
    
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "A senha atual é obrigatória." });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: "A senha atual está incorreta." });
      }
    }

    const saltRounds = 10;
    const hash = await bcrypt.hash(newPassword, saltRounds);

    if (user.id === 0) {
       await db.insert(users).values({ email: user.email, name: "Viajante", passwordHash: hash });
    } else {
       await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
    }

    res.json({ success: true, message: "Senha alterada com sucesso." });
  } catch (err: any) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Erro interno ao alterar a senha." });
  }
});

router.post("/gmail-signup", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: "E-mail e Nome são obrigatórios." });
    }
    
    const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
    if (!isGmailOfGoogle) {
      return res.status(400).json({ error: "Por favor, utilize uma conta de e-mail do Google (@gmail.com) válida." });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    let targetUserId: number;
    let isNewAccount = false;

    if (!existingUser) {
      const [newUser] = await db.insert(users).values({
        email,
        name,
        passwordHash: null
      }).returning();
      targetUserId = newUser.id;
      isNewAccount = true;
    } else {
      targetUserId = existingUser.id;
      isNewAccount = false;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600 * 1000);

    await db.update(users).set({
      passwordResetToken: token,
      passwordResetExpires: expires
    }).where(eq(users.id, targetUserId));

    // Montar URL com domínio correto
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}?action=setup_password&token=${token}&email=${encodeURIComponent(email)}`;

    // Tentar enviar e-mail real via Gmail; em dev, fallback para simulatedEmails
    const emailPayload = buildPasswordSetupEmail({ name: name || "Viajante", email, resetUrl, isNewAccount });
    const { sent } = await sendEmail(emailPayload);

    if (!sent) {
      // Modo dev: armazena em memória para o endpoint /api/dev/last-emails
      simulatedEmails.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        to: email,
        subject: emailPayload.subject,
        body: emailPayload.text || emailPayload.html,
        link: resetUrl,
        date: new Date()
      });
    }


    res.json({
      success: true,
      message: "E-mail enviado! Um link de configuração foi enviado para o seu e-mail do Google Gmail.",
      email,
      isNewAccount
    });
  } catch (err: any) {
    console.error("Gmail signup error:", err);
    res.status(500).json({ error: "Erro ao registrar com Gmail: " + err.message });
  }
});

router.post("/gmail-verify-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token de verificação ausente." });
    }

    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
    if (!user) {
      return res.status(400).json({ error: "Link de verificação inválido ou já utilizado." });
    }

    if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({ error: "O link de segurança expirou. Solicite um novo envio." });
    }

    res.json({ success: true, email: user.email, name: user.name });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao verificar token: " + err.message });
  }
});

router.post("/gmail-set-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Token e senha de acesso são necessários." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "A senha de segurança deve conter no mínimo 6 caracteres." });
    }

    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
    if (!user) {
      return res.status(400).json({ error: "Token inválido." });
    }

    if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({ error: "O prazo de expiração do link de segurança expirou." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await db.update(users).set({
      passwordHash: passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null
    }).where(eq(users.id, user.id));

    const userEmail = user.email;
    const indexList: number[] = [];
    simulatedEmails.forEach((m, idx) => {
      if (m.to.toLowerCase() === userEmail.toLowerCase()) {
        indexList.push(idx);
      }
    });
    for (let i = indexList.length - 1; i >= 0; i--) {
      simulatedEmails.splice(indexList[i], 1);
    }

    const authToken = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: "Senha definida com sucesso! Acesso concedido.",
      token: authToken,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao definir senha: " + err.message });
  }
});

router.post("/firebase-google-login", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: "E-mail do Firebase é obrigatório." });
    }

    const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
    if (!isGmailOfGoogle) {
      return res.status(400).json({ error: "Apenas e-mails terminados em @gmail.com são permitidos via login do Google." });
    }

    let [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!existingUser) {
      const [newUser] = await db.insert(users).values({
        email,
        name: name || email.split("@")[0],
        passwordHash: null
      }).returning();
      existingUser = newUser;
    }

    const appToken = jwt.sign(
      { id: existingUser.id, email: existingUser.email, name: existingUser.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token: appToken,
      user: { id: existingUser.id, email: existingUser.email, name: existingUser.name }
    });
  } catch (err: any) {
    console.error("Firebase Google Auth login error:", err);
    res.status(500).json({ error: "Erro ao autenticar usuário com Firebase: " + err.message });
  }
});

router.post("/gmail-google-login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
    if (!isGmailOfGoogle) {
      return res.status(400).json({ error: "Por favor, utilize uma conta de e-mail do Google (@gmail.com) válida." });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Conta Gmail não cadastrada. Por favor, clique em criar conta abaixo." });
    }

    if (!user.passwordHash) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600 * 1000);

      await db.update(users).set({
        passwordResetToken: token,
        passwordResetExpires: expires
      }).where(eq(users.id, user.id));

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}?action=setup_password&token=${token}&email=${encodeURIComponent(user.email)}`;

      // Limpar e-mails anteriores do mesmo usuário do buffer em memória
      const indexList: number[] = [];
      simulatedEmails.forEach((m, idx) => {
        if (m.to.toLowerCase() === user.email.toLowerCase()) indexList.push(idx);
      });
      for (let i = indexList.length - 1; i >= 0; i--) simulatedEmails.splice(indexList[i], 1);

      // Tentar enviar e-mail real via Gmail; em dev, fallback para simulatedEmails
      const emailPayload = buildPasswordSetupEmail({
        name: user.name || "Viajante",
        email: user.email,
        resetUrl,
        isNewAccount: false
      });
      const { sent } = await sendEmail(emailPayload);

      if (!sent) {
        simulatedEmails.push({
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
          to: user.email,
          subject: emailPayload.subject,
          body: emailPayload.text || emailPayload.html,
          link: resetUrl,
          date: new Date()
        });
      }


      return res.status(400).json({ 
        error: "Esta conta foi cadastrada, mas sua senha de segurança ainda não está ativa. Como você tentou logar, acabamos de gerar e enviar um link para configurar sua senha na sua Caixa de Entrada Simulada abaixo! Por favor, verifique-a e crie sua senha.",
        requiresPasswordSetup: true
      });
    }

    const appToken = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token: appToken,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro no login com Google: " + err.message });
  }
});

export default router;
