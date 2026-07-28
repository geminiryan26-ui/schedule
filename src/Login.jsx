import { useState } from "react";
import { api, setToken } from "./api.js";

const S = {
  wrap: { minHeight:"100vh", background:"linear-gradient(160deg,#f5f0ff,#eef4ff)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif" },
  card: { width:"100%", maxWidth:360, background:"#fff", borderRadius:24, padding:"28px 22px 24px", boxShadow:"0 8px 40px #6c5ce71a" },
  tab:  (on) => ({ flex:1, padding:"9px 0", borderRadius:12, border:`2px solid ${on?"#6c5ce7":"#e0d9ff"}`, background:on?"#6c5ce7":"#fff", color:on?"#fff":"#8e84c8", fontWeight:700, fontSize:14, cursor:"pointer" }),
  inp:  { width:"100%", boxSizing:"border-box", padding:"11px 14px", borderRadius:11, border:"1.5px solid #e0d9ff", fontSize:14, color:"#2d3436", outline:"none", background:"#faf9ff" },
  lbl:  { fontSize:11, fontWeight:700, color:"#a29bfe", marginBottom:6, display:"block" },
  dot:  (filled) => ({ width:16, height:16, borderRadius:"50%", background:filled?"#6c5ce7":"transparent", border:`2px solid ${filled?"#6c5ce7":"#c0b8e8"}`, transition:"all .15s" }),
  pad:  (empty)  => ({ height:52, borderRadius:14, border:"1.5px solid #e0d9ff", background:empty?"transparent":"#faf9ff", color:"#2d3436", fontSize:20, fontWeight:700, cursor:empty?"default":"pointer", opacity:empty?0:1 }),
  err:  { background:"#fff5f5", border:"1.5px solid #ffccc7", borderRadius:10, padding:"8px 12px", fontSize:12, color:"#d63031", textAlign:"center", marginBottom:12 },
  btn:  (ok)     => ({ width:"100%", padding:13, borderRadius:14, border:"none", background:ok?"linear-gradient(135deg,#6c5ce7,#a29bfe)":"#e0d9ff", color:ok?"#fff":"#c0b8e8", fontWeight:800, fontSize:15, cursor:ok?"pointer":"default" }),
};

const PAD = [["1","2","3"],["4","5","6"],["7","8","9"],["","0","del"]];

export default function Login({ onLogin }) {
  const [tab,     setTab]     = useState("login");
  const [email,   setEmail]   = useState("");
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const switchTab = (t) => { setTab(t); setPin(""); setError(""); };

  const pressKey = (k) => {
    if (k === "del") setPin(p => p.slice(0,-1));
    else if (pin.length < 4) setPin(p => p + k);
  };

  const submit = async () => {
    if (!email.trim() || pin.length !== 4) return;
    setLoading(true); setError("");
    try {
      const result = tab === "login"
        ? await api.login(email, pin)
        : await api.register(email, pin);
      setToken(result.token);
      onLogin(result);
    } catch (e) {
      setError(e.message);
      setPin("");
    }
    setLoading(false);
  };

  const ready = !!email.trim() && pin.length === 4 && !loading;

  return (
    <div style={S.wrap}>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:52 }}>🎒</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#2d3436", marginTop:8 }}>내 스케줄</div>
        <div style={{ fontSize:13, color:"#a29bfe", marginTop:4 }}>우리 가족 일정 관리</div>
      </div>

      <div style={S.card}>
        {/* 탭 */}
        <div style={{ display:"flex", gap:8, marginBottom:22 }}>
          <button style={S.tab(tab==="login")}    onClick={()=>switchTab("login")}>로그인</button>
          <button style={S.tab(tab==="register")} onClick={()=>switchTab("register")}>가입하기</button>
        </div>

        {/* 이메일 */}
        <label style={S.lbl}>이메일</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
          placeholder="example@email.com" style={{ ...S.inp, marginBottom:18 }}
          onKeyDown={e=>e.key==="Enter"&&ready&&submit()}/>

        {/* PIN 도트 표시 */}
        <label style={S.lbl}>PIN 번호 (4자리)</label>
        <div style={{ display:"flex", justifyContent:"center", gap:18, marginBottom:16 }}>
          {[0,1,2,3].map(i=><div key={i} style={S.dot(i < pin.length)}/>)}
        </div>

        {/* 숫자 패드 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
          {PAD.flat().map((k,i) => (
            <button key={i} onClick={()=>k&&pressKey(k)} style={S.pad(!k)}>
              {k==="del" ? "⌫" : k}
            </button>
          ))}
        </div>

        {error && <div style={S.err}>{error}</div>}

        <button onClick={submit} disabled={!ready} style={S.btn(ready)}>
          {loading ? "처리 중..." : tab==="login" ? "로그인" : "가입하기"}
        </button>

        <div style={{ textAlign:"center", marginTop:14, fontSize:12, color:"#b2bec3" }}>
          {tab==="login"
            ? "처음 사용하시나요? 상단 '가입하기'를 눌러주세요"
            : "가입 후 초대 코드로 가족과 일정을 공유할 수 있어요"}
        </div>
      </div>
    </div>
  );
}
