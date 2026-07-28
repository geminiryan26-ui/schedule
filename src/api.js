// ─── 토큰 관리 ────────────────────────────────────────────────────────────────
let _token = sessionStorage.getItem('sch_token');

export const setToken = (t) => {
  _token = t;
  if (t) sessionStorage.setItem('sch_token', t);
  else    sessionStorage.removeItem('sch_token');
};
export const getToken   = ()  => _token;
export const isLoggedIn = ()  => !!_token;

// ─── fetch 래퍼 ───────────────────────────────────────────────────────────────
async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '오류가 발생했어요');
  return data;
}

// ─── API 목록 ─────────────────────────────────────────────────────────────────
export const api = {
  register:   (email, pin)                     => call('POST', '/auth/register', { email, pin }),
  login:      (email, pin)                     => call('POST', '/auth/login',    { email, pin }),
  join:       (inviteCode)                     => call('POST', '/auth/join',     { inviteCode }),
  getData:    ()                               => call('GET',  '/schedule'),
  saveData:   (school, events, periods)        => call('PUT',  '/schedule',  { school, events, periods }),
  saveAlarms: (alarms)                         => call('PUT',  '/alarms',    { alarms }),
};
