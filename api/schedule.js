import { sql, ensureDB, getGroupInfo } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  const me = verifyToken(req, res); if (!me) return;
  await ensureDB();

  // ── GET: 전체 스케줄 데이터 ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const dataRes   = await sql`SELECT * FROM group_data WHERE group_id = ${me.groupId}`;
    const alarmsRes = await sql`SELECT event_id, minutes_before FROM user_alarms WHERE user_id = ${me.userId}`;
    const { inviteCode, members } = await getGroupInfo(me.groupId);
    const row = dataRes.rows[0];

    return res.status(200).json({
      school:     JSON.parse(row?.school  || '{}'),
      events:     JSON.parse(row?.events  || '[]'),
      periods:    JSON.parse(row?.periods || '[]'),
      alarms:     Object.fromEntries(alarmsRes.rows.map(a => [a.event_id, a.minutes_before])),
      inviteCode,
      members,
    });
  }

  // ── PUT: 스케줄 저장 ────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { school, events, periods } = req.body || {};
    await sql`
      UPDATE group_data
      SET school   = ${JSON.stringify(school)},
          events   = ${JSON.stringify(events)},
          periods  = ${JSON.stringify(periods)},
          updated_at = NOW()
      WHERE group_id = ${me.groupId}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
