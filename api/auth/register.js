import bcrypt from 'bcryptjs';
import { sql, ensureDB, createGroupForUser, getGroupInfo } from '../../lib/db.js';
import { makeToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensureDB();

  const { email, pin } = req.body || {};
  if (!email?.trim() || !/^\d{4}$/.test(pin))
    return res.status(400).json({ error: '이메일과 4자리 숫자 PIN을 입력해주세요' });

  try {
    const pinHash = bcrypt.hashSync(pin, 10);
    const userRes = await sql`
      INSERT INTO users (email, pin_hash)
      VALUES (${email.trim().toLowerCase()}, ${pinHash})
      RETURNING id, email`;
    const user = userRes.rows[0];

    const group = await createGroupForUser(user.id);
    const token = makeToken(user.id, group.id, user.email);

    return res.status(200).json({
      token,
      inviteCode: group.invite_code,
      members: [user.email],
    });
  } catch (e) {
    if (e.code === '23505' || e.message?.includes('unique'))
      return res.status(409).json({ error: '이미 가입된 이메일이에요' });
    console.error('register:', e);
    return res.status(500).json({ error: '서버 오류가 발생했어요' });
  }
}
