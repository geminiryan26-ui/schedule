import { sql } from '@vercel/postgres';
import crypto from 'crypto';

export { sql };

// ─── 테이블 초기화 (최초 1회) ──────────────────────────────────────────────────
let _ready = false;
export async function ensureDB() {
  if (_ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL UNIQUE,
      pin_hash   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS schedule_groups (
      id          SERIAL PRIMARY KEY,
      invite_code TEXT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES schedule_groups(id) ON DELETE CASCADE,
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role     TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (group_id, user_id)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS group_data (
      group_id   INTEGER PRIMARY KEY REFERENCES schedule_groups(id) ON DELETE CASCADE,
      school     TEXT NOT NULL DEFAULT '{}',
      events     TEXT NOT NULL DEFAULT '[]',
      periods    TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS user_alarms (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id       TEXT NOT NULL,
      minutes_before INTEGER NOT NULL,
      PRIMARY KEY (user_id, event_id)
    )`;
  _ready = true;
}

// ─── 그룹 정보 조회 ────────────────────────────────────────────────────────────
export async function getGroupInfo(groupId) {
  const g = await sql`SELECT invite_code FROM schedule_groups WHERE id = ${groupId}`;
  const m = await sql`
    SELECT u.email FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ${groupId}`;
  return {
    inviteCode: g.rows[0]?.invite_code || '',
    members:    m.rows.map(r => r.email),
  };
}

// ─── 유니크 초대 코드 생성 ─────────────────────────────────────────────────────
export async function createGroupForUser(userId) {
  let group;
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
      const r = await sql`
        INSERT INTO schedule_groups (invite_code) VALUES (${code}) RETURNING id, invite_code`;
      group = r.rows[0]; break;
    } catch (e) { if (!e.message.includes('unique')) throw e; }
  }
  if (!group) throw new Error('초대 코드 생성 실패');
  await sql`INSERT INTO group_members (group_id, user_id, role) VALUES (${group.id}, ${userId}, 'admin')`;
  await sql`INSERT INTO group_data (group_id) VALUES (${group.id})`;
  return group;
}
