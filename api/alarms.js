import { sql, ensureDB } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).end();
  const me = verifyToken(req, res); if (!me) return;
  await ensureDB();

  const { alarms } = req.body || {};
  await sql`DELETE FROM user_alarms WHERE user_id = ${me.userId}`;

  for (const [eventId, mins] of Object.entries(alarms || {})) {
    await sql`
      INSERT INTO user_alarms (user_id, event_id, minutes_before)
      VALUES (${me.userId}, ${eventId}, ${mins})`;
  }

  return res.status(200).json({ ok: true });
}
