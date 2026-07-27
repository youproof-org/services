/**
 * Confirmation (double opt-in) email content. Pure builder — no I/O — so it is
 * easily unit-tested. Copy is Hungarian (the only published locale today); the
 * body always carries a visible, fully-controlled unsubscribe link in addition
 * to the List-Unsubscribe header set by the Brevo client.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ConfirmationEmail {
  subject: string;
  htmlContent: string;
  textContent: string;
}

export function buildConfirmationEmail(args: {
  name: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}): ConfirmationEmail {
  const name = args.name.trim();
  const greetingName = name.length > 0 ? escapeHtml(name) : "Kedves Olvasó";
  const confirm = escapeHtml(args.confirmUrl);
  const unsub = escapeHtml(args.unsubscribeUrl);

  const subject = "Erősítsd meg a feliratkozásod";

  const htmlContent = `<!doctype html>
<html lang="hu">
  <body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
      <tr><td>
        <p>Szia ${greetingName}!</p>
        <p>Köszönjük, hogy feliratkoztál a youproof.org hírlevelére. Kérjük, erősítsd meg a feliratkozásod az alábbi gombra kattintva:</p>
        <p style="margin:28px 0;">
          <a href="${confirm}" style="display:inline-block;padding:12px 20px;background:#000000;color:#ffffff;text-decoration:none;font-weight:600;">Feliratkozás megerősítése</a>
        </p>
        <p style="font-size:14px;color:#555555;">Ha a gomb nem működik, másold be ezt a linket a böngésződbe:<br><a href="${confirm}" style="color:#0066cc;">${confirm}</a></p>
        <p style="font-size:14px;color:#555555;">Ha nem te kezdeményezted ezt a feliratkozást, egyszerűen hagyd figyelmen kívül ezt az e-mailt.</p>
        <hr style="border:none;border-top:1px solid #dddddd;margin:28px 0;">
        <p style="font-size:12px;color:#888888;">Bármikor leiratkozhatsz: <a href="${unsub}" style="color:#888888;">leiratkozás</a>.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const textContent = [
    `Szia ${name.length > 0 ? name : "Kedves Olvasó"}!`,
    "",
    "Köszönjük, hogy feliratkoztál a youproof.org hírlevelére. Kérjük, erősítsd meg a feliratkozásod az alábbi linken:",
    args.confirmUrl,
    "",
    "Ha nem te kezdeményezted ezt a feliratkozást, hagyd figyelmen kívül ezt az e-mailt.",
    "",
    `Leiratkozás: ${args.unsubscribeUrl}`,
  ].join("\n");

  return { subject, htmlContent, textContent };
}
