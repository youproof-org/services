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

export interface EmailContent {
  subject: string;
  htmlContent: string;
  textContent: string;
}

/** @deprecated Use EmailContent — kept so existing imports keep resolving. */
export type ConfirmationEmail = EmailContent;

// Named in the legacy invite's copy. Hardcoded rather than derived from
// SITE_HOST because they are historical facts about the migration, not the
// environment the worker happens to run in — a staging send must still say the
// old list lived at youproof.hu and moved to youproof.org. Shared by both bodies
// so the two cannot disagree.
const LEGACY_SITE_URL = "https://youproof.hu";
const NEW_SITE_URL = "https://youproof.org";

export function buildConfirmationEmail(args: {
  name: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}): EmailContent {
  const name = args.name.trim();
  // One source for the greeting, escaped only where it lands in HTML — the
  // fallback used to be written out separately in each body, so a change to one
  // could silently diverge from the other.
  const greeting = name.length > 0 ? name : "Kedves Olvasó";
  const confirm = escapeHtml(args.confirmUrl);
  const unsub = escapeHtml(args.unsubscribeUrl);

  const subject = "Erősítsd meg a feliratkozásod";

  const htmlContent = `<!doctype html>
<html lang="hu">
  <body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
      <tr><td>
        <p>Szia ${escapeHtml(greeting)}!</p>
        <p>Köszönöm, hogy feliratkoztál a youproof.org hírlevelére. Kérjük, erősítsd meg a feliratkozásod az alábbi gombra kattintva:</p>
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
    `Szia ${greeting}!`,
    "",
    "Köszönöm, hogy feliratkoztál a youproof.org hírlevelére. Kérjük, erősítsd meg a feliratkozásod az alábbi linken:",
    args.confirmUrl,
    "",
    "Ha nem te kezdeményezted ezt a feliratkozást, hagyd figyelmen kívül ezt az e-mailt.",
    "",
    `Leiratkozás: ${args.unsubscribeUrl}`,
  ].join("\n");

  return { subject, htmlContent, textContent };
}

/**
 * The one-shot legacy re-permission invite. Sent once to an address
 * inherited from the defunct site's newsletter, then never again.
 *
 * Written in the first person singular, unlike the "we" voice of the
 * confirmation mail above: this is a personal ask for permission we cannot
 * evidence, not a transactional notice.
 *
 * `retentionDays` is passed in rather than hardcoded so the promise made in the
 * copy is literally the LEGACY_RETENTION_MS constant the cron enforces — the two
 * cannot drift apart. There is no name to greet with (the legacy list is bare
 * addresses), so the greeting is an unadorned "Szia!".
 */
export function buildLegacyInviteEmail(args: {
  resubscribeUrl: string;
  declineUrl: string;
  privacyUrl: string;
  senderName: string;
  retentionDays: number;
}): EmailContent {
  const resubscribe = escapeHtml(args.resubscribeUrl);
  const decline = escapeHtml(args.declineUrl);
  const privacy = escapeHtml(args.privacyUrl);
  const sender = escapeHtml(args.senderName);
  const days = String(args.retentionDays);

  const subject = "Megújult a youproof.hu";

  const htmlContent = `<!doctype html>
<html lang="hu">
  <body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
      <tr><td>
        <p>Szia!</p>
        <p>Azért írok Neked, mert évekkel ezelőtt feliratkoztál a régi, matematikával foglalkozó weboldalam, a <a href="${LEGACY_SITE_URL}" style="color:#0066cc;">${LEGACY_SITE_URL}</a> hírlevelére. A közelmúltban a régi oldal teljesen megújult, és a <a href="${NEW_SITE_URL}" style="color:#0066cc;">${NEW_SITE_URL}</a> címre költözött át.</p>
        <p>Emiatt a régi hírlevél is megszűnt, így most az oda feliratkozók részére egy egyszeri megkeresést küldök. Ennek részeként kérdezlek Téged is: szeretnél továbbra is értesülni az oldallal kapcsolatos újdonságokról? Ha igen, itt tudsz feliratkozni az új hírlevélre:</p>
        <p style="margin:28px 0;">
          <a href="${resubscribe}" style="display:inline-block;padding:12px 20px;background:#000000;color:#ffffff;text-decoration:none;font-weight:600;">Feliratkozom az új hírlevélre</a>
        </p>
        <p style="font-size:14px;color:#555555;">Ha a gomb nem működik, másold be ezt a linket a böngésződbe:<br><a href="${resubscribe}" style="color:#0066cc;">${resubscribe}</a></p>
        <p><strong>Ha nem szeretnél több levelet kapni tőlem, nem kell tenned semmit.</strong> Ebben az esetben a címedet ${days} napon belül automatikusan törlöm. Ha meggondolnád magad, természetesen a jövőben bármikor újra feliratkozhatsz az új honlapon keresztül: <a href="${NEW_SITE_URL}" style="color:#0066cc;">${NEW_SITE_URL}</a></p>
        <p style="font-size:14px;color:#555555;">Ha nem várnád meg a ${days} napot, akkor az alábbi linkre kattintva kérheted a címed azonnali törlését:<br><a href="${decline}" style="color:#0066cc;">${decline}</a></p>
        <p style="font-size:14px;color:#555555;">Üdvözlettel, ${sender}</p>
        <hr style="border:none;border-top:1px solid #dddddd;margin:28px 0;">
        <p style="font-size:12px;color:#888888;">Az új adatkezelési tájékoztatót itt olvashatod: <a href="${privacy}" style="color:#888888;">${privacy}</a></p>
      </td></tr>
    </table>
  </body>
</html>`;

  const textContent = [
    "Szia!",
    "",
    `Azért írok Neked, mert évekkel ezelőtt feliratkoztál a régi, matematikával foglalkozó weboldalam, a ${LEGACY_SITE_URL} hírlevelére. A közelmúltban a régi oldal teljesen megújult, és a ${NEW_SITE_URL} címre költözött át.`,
    "",
    `Emiatt a régi hírlevél is megszűnt, így most az oda feliratkozók részére egy egyszeri megkeresést küldök. Ennek részeként kérdezlek Téged is: szeretnél továbbra is értesülni az oldallal kapcsolatos újdonságokról? Ha igen, itt tudsz feliratkozni az új hírlevélre: ${args.resubscribeUrl}`,
    "",
    `Ha nem szeretnél több levelet kapni tőlem, nem kell tenned semmit. Ebben az esetben a címedet ${days} napon belül automatikusan törlöm. Ha meggondolnád magad, természetesen a jövőben bármikor újra feliratkozhatsz az új honlapon keresztül: ${NEW_SITE_URL}`,
    "",
    `Ha nem várnád meg a ${days} napot, akkor az alábbi linkre kattintva kérheted a címed azonnali törlését: ${args.declineUrl}`,
    "",
    `Az új adatkezelési tájékoztatót itt olvashatod: ${args.privacyUrl}`,
    "",
    `Üdvözlettel, ${args.senderName}`,
  ].join("\n");

  return { subject, htmlContent, textContent };
}
