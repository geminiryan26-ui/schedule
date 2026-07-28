import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-please-change';

export function makeToken(userId, groupId, email) {
  return jwt.sign({ userId, groupId, email }, SECRET, { expiresIn: '30d' });
}

export function verifyToken(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '로그인이 필요해요' });
    return null;
  }
  try {
    return jwt.verify(token, SECRET);
  } catch {
    res.status(401).json({ error: '세션이 만료됐어요. 다시 로그인해주세요' });
    return null;
  }
}
