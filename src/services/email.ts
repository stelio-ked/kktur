/**
 * Serviço de E-mail — KK TUR
 *
 * Usa Nodemailer com Gmail SMTP via App Password (gratuito, até ~500 e-mails/dia).
 *
 * Configuração necessária nas variáveis de ambiente:
 *   GMAIL_USER=seuemail@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← Senha de App de 16 dígitos
 *
 * Como gerar uma Senha de App do Gmail:
 *   1. Acesse: https://myaccount.google.com/security
 *   2. Ative "Verificação em 2 etapas" se ainda não estiver ativa
 *   3. Acesse: https://myaccount.google.com/apppasswords
 *   4. Crie uma senha para "Outro (nome personalizado)" → "KK TUR"
 *   5. Copie os 16 caracteres gerados e defina GMAIL_APP_PASSWORD no .env
 *
 * Em desenvolvimento (sem GMAIL_APP_PASSWORD), os e-mails são registrados
 * no console e salvos em memória (simulatedEmails) como antes.
 */

import nodemailer from "nodemailer";

// ─── Configuração do transportador ──────────────────────────────────────────

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null; // modo dev: sem envio real
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ─── Interface de e-mail ─────────────────────────────────────────────────────

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// ─── Função principal de envio ───────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<{ sent: boolean; messageId?: string }> {
  const transporter = createTransporter();
  const from = process.env.GMAIL_USER || "noreply@kktur.app";

  if (!transporter) {
    // Dev fallback: apenas loga no console
    console.log(`[DEV EMAIL] Para: ${payload.to} | Assunto: ${payload.subject}`);
    return { sent: false };
  }

  try {
    const info = await transporter.sendMail({
      from: `"KK TUR" <${from}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    console.log(`[EMAIL ENVIADO] Para: ${payload.to} | MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[EMAIL ERRO] Falha ao enviar para ${payload.to}:`, err.message);
    throw err;
  }
}

// ─── Templates de e-mail ─────────────────────────────────────────────────────

export function buildPasswordSetupEmail(opts: {
  name: string;
  email: string;
  resetUrl: string;
  isNewAccount: boolean;
}): EmailPayload {
  const { name, email, resetUrl, isNewAccount } = opts;
  const title = isNewAccount
    ? "Crie sua senha de acesso — KK TUR"
    : "Defina ou atualize sua senha — KK TUR";

  const callToAction = isNewAccount
    ? "Você foi cadastrado na KK TUR! Para ativar sua conta, crie sua senha de acesso clicando no botão abaixo."
    : "Recebemos uma solicitação para configurar o acesso à sua conta. Clique no botão para definir sua senha.";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                ✈️ KK TUR
              </h1>
              <p style="margin:6px 0 0;color:#a0aec0;font-size:13px;">Roteiro & Custos de Viagem</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#2d3748;">Olá, <strong>${name || "Viajante"}</strong>!</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a5568;line-height:1.6;">${callToAction}</p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:8px;">
                    <a href="${resetUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                      🔐 Definir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Warning -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="background:#fffbeb;border:1px solid #f6d860;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#92400e;">
                      ⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou este e-mail, ignore-o com segurança.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f7f8fa;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a0aec0;">
                KK TUR — Seu diário de bordo de viagens.<br />
                Este é um e-mail automático, não responda a esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `Olá, ${name || "Viajante"}!\n\n${callToAction}\n\nLink para definir sua senha:\n${resetUrl}\n\nEste link expira em 1 hora.\n\nKK TUR`;

  return { to: email, subject: title, html, text };
}
