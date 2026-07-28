import bcrypt from 'bcryptjs';
import { sql, ensureDB, getGroupInfo } from '../../lib/db.js';
import { makeToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensureDB();

  const { email, pin } = req.body || {};
  const normalized = email?.trim().toLowerCase();

  const userRes = await sql`SELECT * FROM users WHERE LOWER(email) = ${normalized}`;
  const user = userRes.rows[0];

  if (!user || !bcrypt.compareSync(pin, user.pin_hash))
    return res.status(401).json({ error: '이메일 또는 PIN이 올바르지 않아요' });

  const memRes = await sql`SELECT group_id FROM group_members WHERE user_id = ${user.id}`;
  const groupId = memRes.rows[0]?.group_id;
  if (!groupId) return res.status(500).json({ error: '그룹 정보를 찾을 수 없어요' });

  const { inviteCode, members } = await getGroupInfo(groupId);
  const token = makeToken(user.id, groupId, user.email);

  return res.status(200).json({ token, inviteCode, members });
}
