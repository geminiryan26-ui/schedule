import { sql, ensureDB, getGroupInfo } from '../../lib/db.js';
import { makeToken, verifyToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const me = verifyToken(req, res); if (!me) return;
  await ensureDB();

  const code = req.body?.inviteCode?.trim().toUpperCase();
  const grpRes = await sql`SELECT * FROM schedule_groups WHERE invite_code = ${code}`;
  const group  = grpRes.rows[0];
  if (!group) return res.status(404).json({ error: '초대 코드를 다시 확인해주세요' });

  const cntRes = await sql`SELECT COUNT(*) as n FROM group_members WHERE group_id = ${group.id}`;
  if (parseInt(cntRes.rows[0].n) >= 3)
    return res.status(400).json({ error: '이미 3명이 참여 중인 그룹이에요' });

  const dupRes = await sql`SELECT 1 FROM group_members WHERE group_id = ${group.id} AND user_id = ${me.userId}`;
  if (dupRes.rows.length > 0)
    return res.status(400).json({ error: '이미 이 그룹에 속해있어요' });

  // 기존 그룹 탈퇴 (혼자이면 그룹 삭제)
  const oldRes = await sql`SELECT group_id FROM group_members WHERE user_id = ${me.userId}`;
  const oldId  = oldRes.rows[0]?.group_id;
  if (oldId && oldId !== group.id) {
    const oldCnt = await sql`SELECT COUNT(*) as n FROM group_members WHERE group_id = ${oldId}`;
    if (parseInt(oldCnt.rows[0].n) === 1) {
      await sql`DELETE FROM group_data WHERE group_id = ${oldId}`;
      await sql`DELETE FROM schedule_groups WHERE id = ${oldId}`;
    } else {
      await sql`DELETE FROM group_members WHERE user_id = ${me.userId} AND group_id = ${oldId}`;
    }
  }

  await sql`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (${group.id}, ${me.userId}, 'member')
    ON CONFLICT DO NOTHING`;

  const { inviteCode, members } = await getGroupInfo(group.id);
  const token = makeToken(me.userId, group.id, me.email);

  return res.status(200).json({ token, inviteCode, members });
}
