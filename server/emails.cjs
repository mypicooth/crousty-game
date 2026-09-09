const { randomUUID } = require('node:crypto');

const render = (text, game, player) => text.replaceAll('{{prenom}}', player.firstName).replaceAll('{{score}}', String(player.highScore || 0)).replaceAll('{{jeu}}', game.name);

async function sendRecap(db, game, gameId, id, player) {
  if (!game.emailsEnabled || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return;
  const mailRef = db.ref(`studio/emails/${gameId}/${id}`);
  const attemptId = randomUUID();
  const payload = {
    from: process.env.RESEND_FROM, to: [player.email],
    subject: render(game.emailSubject, game, player),
    text: render(game.emailBody, game, player)
  };
  const attempt = await mailRef.transaction(previous => {
    if (previous?.sentAt || (previous?.lockedAt && Date.now() - previous.lockedAt < 60000)) return;
    // Preserve the payload on retry to match the provider's idempotency contract.
    return { ...previous, payload: previous?.payload || payload, lockedAt: Date.now(), attemptId };
  });
  if (!attempt.committed) return;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `game-recap/${gameId}/${id}` },
      body: JSON.stringify(attempt.snapshot.val().payload)
    });
    if (!response.ok) throw new Error('Email provider rejected request');
    const result = await response.json();
    await mailRef.update({ sentAt: Date.now(), providerId: result.id, lockedAt: null, error: null });
  } catch {
    await mailRef.update({ lockedAt: null, error: 'delivery_failed' });
  }
}
module.exports = { sendRecap, render };
