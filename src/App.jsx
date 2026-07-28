import { useState, useEffect, useRef, useCallback } from "react";
import { api, setToken, getToken } from "./api.js";
import Login from "./Login.jsx";

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const DAYS_KR = ["월","화","수","목","금","토","일"];
const DEFAULT_PERIOD_TIMES = [
  { label:"1교시", start:"09:00", end:"09:40" },
  { label:"2교시", start:"09:50", end:"10:30" },
  { label:"3교시", start:"10:40", end:"11:20" },
  { label:"4교시", start:"11:30", end:"12:10" },
  { label:"5교시", start:"13:00", end:"13:40" },
  { label:"6교시", start:"13:50", end:"14:30" },
];
const SUBJECT_COLORS = {
  국어:"#FF6B6B", 수학:"#4ECDC4", 영어:"#45B7D1", 과학:"#96CEB4",
  사회:"#FFD166", 체육:"#A29BFE", 음악:"#FD79A8", 미술:"#FDCB6E",
  도덕:"#55EFC4", 실과:"#74B9FF", 창체:"#E17055", 도서실:"#96CEB4", 과학실:"#00b894",
};
const TYPE_META = {
  hagwon:  { label:"학원", emoji:"🎓", color:"#6c5ce7" },
  homework:{ label:"숙제", emoji:"📝", color:"#e17055" },
  other:   { label:"기타", emoji:"⭐", color:"#00b894" },
};
const COLORS = ["#6c5ce7","#e17055","#00b894","#fdcb6e","#0984e3","#fd79a8","#a29bfe","#55efc4"];
const DEFAULT_SCHOOL = {
  0:{subjects:["국어","과학","수학","체육","국어","도덕"],   dismissal:"14:30"},
  1:{subjects:["국어","음악","영어","사회","실과","실과"],   dismissal:"14:30"},
  2:{subjects:["도서실","수학","과학실","사회","국어",""],   dismissal:"13:40"},
  3:{subjects:["음악","체육","수학","영어","미술","미술"],   dismissal:"14:30"},
  4:{subjects:["국어","수학","과학실","사회","영어","창체"], dismissal:"14:30"},
  5:{subjects:[],dismissal:""}, 6:{subjects:[],dismissal:""},
};

const t2m       = t => { if(!t) return 0; const[h,m]=t.split(":").map(Number); return h*60+m; };
const uid       = () => Math.random().toString(36).slice(2,9);
const nowMin    = () => { const n=new Date(); return n.getHours()*60+n.getMinutes(); };
const todayDow  = () => (new Date().getDay()+6)%7;
const subjColor = s  => SUBJECT_COLORS[s] || "#74B9FF";
function getDatesOfWeek(off=0){
  const now=new Date(),mon=new Date(now);
  mon.setDate(now.getDate()-((now.getDay()+6)%7)+off*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon);d.setDate(mon.getDate()+i);return d; });
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authed,      setAuthed]      = useState(!!getToken());
  const [school,      setSchool]      = useState(DEFAULT_SCHOOL);
  const [events,      setEvents]      = useState([]);
  const [alarms,      setAlarms]      = useState({});
  const [periodTimes, setPeriodTimes] = useState(DEFAULT_PERIOD_TIMES);
  const [members,     setMembers]     = useState([]);
  const [inviteCode,  setInviteCode]  = useState("");
  const [userEmail,   setUserEmail]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [syncStatus,  setSyncStatus]  = useState("idle"); // idle | saving | saved | error
  const [view,        setView]        = useState("daily");
  const [weekOff,     setWeekOff]     = useState(0);
  const [monthOff,    setMonthOff]    = useState(0);
  const [now,         setNow]         = useState(new Date());
  const [toast,       setToast]       = useState(null);
  const [modal,       setModal]       = useState(null);
  const toastRef    = useRef();
  const saveTimer   = useRef(null);
  const alarmsTimer = useRef(null);
  const firstLoad   = useRef(true);
  const schoolRef   = useRef(school);
  const eventsRef   = useRef(events);
  const periodsRef  = useRef(periodTimes);

  useEffect(()=>{ schoolRef.current=school; },  [school]);
  useEffect(()=>{ eventsRef.current=events; },  [events]);
  useEffect(()=>{ periodsRef.current=periodTimes; },[periodTimes]);

  // ── 데이터 로드 ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    try {
      const d = await api.getData();
      firstLoad.current = true;
      setSchool(Object.keys(d.school).length ? d.school : DEFAULT_SCHOOL);
      setEvents(d.events || []);
      setPeriodTimes(d.periods?.length ? d.periods : DEFAULT_PERIOD_TIMES);
      setAlarms(d.alarms || {});
      setMembers(d.members || []);
      setInviteCode(d.inviteCode || "");
      // 토큰에서 이메일 파싱
      try {
        const payload = JSON.parse(atob(getToken().split('.')[1]));
        setUserEmail(payload.email || "");
      } catch {}
      setTimeout(() => { firstLoad.current = false; }, 100);
    } catch (e) {
      if (e.message.includes("만료")) { setToken(null); setAuthed(false); }
      showToast("데이터를 불러오지 못했어요: " + e.message, "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) loadData(); else setLoading(false); }, [authed, loadData]);

  // ── 알람 체크 + 시간 갱신 ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const next = new Date(); setNow(next);
      const nm=next.getHours()*60+next.getMinutes(), dow=(next.getDay()+6)%7;
      events.filter(e=>e.days.includes(dow)).forEach(ev=>{
        const mins=alarms[ev.id];
        if(mins && nm===t2m(ev.startTime)-mins) showToast(`🔔 ${mins}분 후 "${ev.title}" 시작!`,"alarm");
      });
    }, 30000);
    return () => clearInterval(t);
  }, [events, alarms]);

  // ── 자동 저장 (2초 디바운스) ─────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    if (firstLoad.current) return;
    setSyncStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.saveData(schoolRef.current, eventsRef.current, periodsRef.current);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch { setSyncStatus("error"); }
    }, 2000);
  }, []);

  useEffect(() => { triggerSave(); }, [school, events, periodTimes]);

  useEffect(() => {
    if (firstLoad.current) return;
    clearTimeout(alarmsTimer.current);
    alarmsTimer.current = setTimeout(() => {
      api.saveAlarms(alarms).catch(console.error);
    }, 1500);
  }, [alarms]);

  const showToast = (msg, type="info") => {
    clearTimeout(toastRef.current); setToast({msg,type});
    toastRef.current = setTimeout(() => setToast(null), 3500);
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const saveEvent = ev => {
    setEvents(p => p.find(e=>e.id===ev.id) ? p.map(e=>e.id===ev.id?ev:e) : [...p,ev]);
    setModal(null); showToast(`"${ev.title}" 저장됐어요 ✅`, "success");
  };
  const delEvent = id => {
    setEvents(p=>p.filter(e=>e.id!==id)); setModal(null); showToast("일정이 삭제됐어요");
  };
  const saveSchool = (data, newPT) => {
    setSchool(data); if(newPT) setPeriodTimes(newPT);
    setModal(null); showToast("학교 시간표 저장됐어요 ✅","success");
  };
  const setAlarmFor = (evId, mins) => {
    setAlarms(p => { const n={...p}; if(mins===null) delete n[evId]; else n[evId]=mins; return n; });
    setModal(null);
    if(mins) showToast(`🔔 ${mins}분 전 알람 설정 완료`,"success");
  };

  const handleLogin = (result) => {
    setMembers(result.members || []);
    setInviteCode(result.inviteCode || "");
    setAuthed(true);
  };
  const handleLogout = () => {
    setToken(null); setAuthed(false); setModal(null);
    setSchool(DEFAULT_SCHOOL); setEvents([]); setAlarms({}); setPeriodTimes(DEFAULT_PERIOD_TIMES);
  };
  const handleJoin = async (code) => {
    try {
      const result = await api.join(code);
      setToken(result.token);
      setMembers(result.members);
      setInviteCode(result.inviteCode);
      firstLoad.current = true;
      await loadData();
      setModal(null);
      showToast("그룹에 합류했어요 🎉","success");
    } catch (e) { showToast(e.message, "error"); }
  };

  // ── 현황 계산 ─────────────────────────────────────────────────────────────────
  const dow=todayDow(), nm=nowMin();
  const todaySchool=school[dow]||{subjects:[],dismissal:""};
  const todayAfter=events.filter(e=>e.days.includes(dow)).sort((a,b)=>t2m(a.startTime)-t2m(b.startTime));
  let curItem=null, nextItems=[];
  if(todaySchool.dismissal&&nm<t2m(todaySchool.dismissal)){
    let curPi=-1;
    periodTimes.forEach((p,i)=>{ if(nm>=t2m(p.start)&&nm<t2m(p.end)&&todaySchool.subjects[i]) curPi=i; });
    curItem={isSchool:true,subject:curPi>=0?todaySchool.subjects[curPi]:"쉬는 시간",period:curPi>=0?curPi+1:null,dismissal:todaySchool.dismissal};
    nextItems=todayAfter.filter(e=>t2m(e.startTime)>nm);
  } else {
    todayAfter.forEach(ev=>{
      const s=t2m(ev.startTime),e=ev.endTime?t2m(ev.endTime):s+60;
      if(nm>=s&&nm<e&&!curItem) curItem=ev; else if(s>nm) nextItems.push(ev);
    });
  }

  const weekDates=getDatesOfWeek(weekOff);
  const isToday=d=>d&&d.toDateString()===new Date().toDateString();
  const getMonthInfo=()=>{
    const base=new Date(new Date().getFullYear(),new Date().getMonth()+monthOff,1);
    const [y,m]=[base.getFullYear(),base.getMonth()];
    const pad=(new Date(y,m,1).getDay()+6)%7,cnt=new Date(y,m+1,0).getDate();
    return{dates:[...Array(pad).fill(null),...Array.from({length:cnt},(_,i)=>new Date(y,m,i+1))],label:`${y}년 ${m+1}월`};
  };
  const{dates:mDates,label:mLabel}=getMonthInfo();

  // ── 렌더 ─────────────────────────────────────────────────────────────────────
  if (!authed) return <Login onLogin={handleLogin}/>;
  if (loading)  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f5f0ff",flexDirection:"column",gap:12}}>
      <div style={{fontSize:40}}>⏳</div>
      <div style={{fontSize:14,color:"#a29bfe",fontWeight:600}}>불러오는 중...</div>
    </div>
  );

  const syncIcon = syncStatus==="saving"?"🔄 저장 중...": syncStatus==="saved"?"✅ 저장됨": syncStatus==="error"?"❌ 저장 실패":"";

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#f5f0ff 0%,#eef4ff 100%)",fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif",maxWidth:480,margin:"0 auto",paddingBottom:90,position:"relative"}}>
      <div style={{position:"fixed",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,#a29bfe33,transparent)",top:-80,right:-60,pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,#fd79a822,transparent)",bottom:80,left:-50,pointerEvents:"none",zIndex:0}}/>

      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:300,background:toast.type==="alarm"?"#6c5ce7":toast.type==="success"?"#00b894":toast.type==="error"?"#d63031":"#2d3436",color:"#fff",padding:"12px 20px",borderRadius:16,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px #0004",maxWidth:"88vw",textAlign:"center"}}>{toast.msg}</div>}

      {/* 헤더 */}
      <header style={{position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px 10px",background:"rgba(255,255,255,0.93)",backdropFilter:"blur(14px)",borderBottom:"1px solid #ede9ff"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>🎒</span>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#2d3436",letterSpacing:-0.5}}>내 스케줄</div>
            <div style={{fontSize:10,color:"#a29bfe",fontWeight:600}}>{now.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {syncIcon && <div style={{fontSize:10,color:"#a29bfe",fontWeight:600}}>{syncIcon}</div>}
          <HdrBtn icon="🏫" onClick={()=>setModal({type:"school"})}/>
          <HdrBtn icon="⚡" onClick={()=>setModal({type:"quickadd"})}/>
          {/* 멤버 아바타 버튼 */}
          <button onClick={()=>setModal({type:"profile"})}
            style={{display:"flex",alignItems:"center",gap:4,background:"#f0edff",border:"none",borderRadius:20,padding:"5px 10px",cursor:"pointer"}}>
            <span style={{fontSize:13}}>👥</span>
            <span style={{fontSize:11,fontWeight:700,color:"#6c5ce7"}}>{members.length}/3</span>
          </button>
        </div>
      </header>

      <main style={{padding:"0 14px",position:"relative",zIndex:1}}>
        {/* 현재 상태 카드 */}
        <div style={{paddingTop:14,paddingBottom:10}}>
          <div style={{background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",borderRadius:20,padding:"18px 20px",color:"#fff",marginBottom:10,boxShadow:"0 8px 28px #6c5ce755"}}>
            <div style={{fontSize:10,opacity:0.75,marginBottom:3,fontWeight:600,letterSpacing:1}}>지금은</div>
            {dow>=5?(
              <div style={{fontSize:21,fontWeight:800}}>🏖️ 주말이에요!</div>
            ):curItem?(
              curItem.isSchool?(
                <>
                  <div style={{fontSize:21,fontWeight:800,marginBottom:3}}>
                    {curItem.subject&&curItem.subject!=="쉬는 시간"?`📖 ${curItem.period}교시 · ${curItem.subject}`:"🍵 쉬는 시간"}
                  </div>
                  <div style={{fontSize:12,opacity:0.85}}>하교 {curItem.dismissal} 예정</div>
                </>
              ):(
                <>
                  <div style={{fontSize:21,fontWeight:800,marginBottom:3}}>{TYPE_META[curItem.type]?.emoji} {curItem.title}</div>
                  <div style={{fontSize:12,opacity:0.85}}>{curItem.startTime}{curItem.endTime?` ~ ${curItem.endTime}`:""}</div>
                </>
              )
            ):(
              <div style={{fontSize:20,fontWeight:800}}>🏠 자유 시간</div>
            )}
          </div>
          {nextItems.length>0&&(
            <div style={{background:"#fff",borderRadius:16,padding:"12px 14px",boxShadow:"0 2px 16px #6c5ce710",marginBottom:4}}>
              <div style={{fontSize:10,fontWeight:700,color:"#a29bfe",marginBottom:8,letterSpacing:1}}>다음 일정</div>
              {nextItems.slice(0,3).map((ev,i)=>(
                <div key={ev.id} onClick={()=>setModal({type:"event",mode:"edit",event:ev})}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:12,background:"#faf9ff",marginBottom:i<Math.min(nextItems.length,3)-1?7:0,borderLeft:`4px solid ${ev.color||"#6c5ce7"}`,cursor:"pointer"}}>
                  <span style={{fontSize:15}}>{TYPE_META[ev.type]?.emoji||"⭐"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#2d3436"}}>{ev.title}</div>
                    <div style={{fontSize:11,color:"#636e72"}}>{ev.startTime}{ev.endTime?` ~ ${ev.endTime}`:""}</div>
                  </div>
                  {alarms[ev.id]&&<span style={{fontSize:10,color:ev.color,fontWeight:700,background:ev.color+"18",padding:"2px 7px",borderRadius:8}}>🔔{alarms[ev.id]}분</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 뷰 탭 */}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[["daily","일간"],["week","주간"],["month","월간"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{flex:1,padding:"8px 0",borderRadius:12,border:`2px solid ${view===v?"#6c5ce7":"#e0d9ff"}`,background:view===v?"#6c5ce7":"#fff",color:view===v?"#fff":"#8e84c8",fontWeight:600,fontSize:13,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {view==="daily"&&<DailyView  school={school} events={events} alarms={alarms} periodTimes={periodTimes} onEditEvent={ev=>setModal({type:"event",mode:"edit",event:ev})} onAddEvent={d=>setModal({type:"event",mode:"add",dow:d})} onAlarm={ev=>setModal({type:"alarm",event:ev})}/>}
        {view==="week" &&<WeekView   school={school} events={events} weekDates={weekDates} setWeekOff={setWeekOff} onEditEvent={ev=>setModal({type:"event",mode:"edit",event:ev})} onAddEvent={d=>setModal({type:"event",mode:"add",dow:d})}/>}
        {view==="month"&&<MonthView  mDates={mDates} mLabel={mLabel} setMonthOff={setMonthOff} school={school} events={events} isToday={isToday}/>}
      </main>

      <button onClick={()=>setModal({type:"event",mode:"add",dow:todayDow()})}
        style={{position:"fixed",bottom:86,right:"max(16px,calc(50% - 224px))",width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",border:"none",color:"#fff",fontSize:28,cursor:"pointer",boxShadow:"0 6px 20px #6c5ce766",zIndex:15,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>
        +
      </button>

      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(255,255,255,0.94)",backdropFilter:"blur(14px)",borderTop:"1px solid #ede9ff",zIndex:20,padding:"10px 0 8px",textAlign:"center"}}>
        <div style={{fontSize:10,fontWeight:600,color:"#c0b8e8"}}>☁️ 서버에 자동 저장돼요</div>
      </nav>

      {modal?.type==="event"    && <EventModal    modal={modal} onSave={saveEvent} onDelete={delEvent} onClose={()=>setModal(null)}/>}
      {modal?.type==="school"   && <SchoolModal   school={school} periodTimes={periodTimes} onSave={saveSchool} onClose={()=>setModal(null)}/>}
      {modal?.type==="quickadd" && <QuickAddModal school={school} periodTimes={periodTimes} onSave={saveSchool} onClose={()=>setModal(null)}/>}
      {modal?.type==="alarm"    && <AlarmModal    event={modal.event} alarms={alarms} onSet={setAlarmFor} onClose={()=>setModal(null)}/>}
      {modal?.type==="profile"  && <ProfileModal  userEmail={userEmail} members={members} inviteCode={inviteCode} onJoin={handleJoin} onLogout={handleLogout} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function HdrBtn({icon,onClick}){
  return <button onClick={onClick} style={{width:34,height:34,borderRadius:"50%",border:"none",background:"#f0edff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</button>;
}

// ─── 프로필 모달 (멤버, 초대코드, 로그아웃) ──────────────────────────────────
function ProfileModal({userEmail,members,inviteCode,onJoin,onLogout,onClose}){
  const [joinCode,   setJoinCode]   = useState("");
  const [joining,    setJoining]    = useState(false);
  const [copied,     setCopied]     = useState(false);

  const copyCode = () => {
    navigator.clipboard?.writeText(inviteCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  };
  const doJoin = async () => {
    if(!joinCode.trim()) return;
    setJoining(true);
    try { await onJoin(joinCode); } catch {}
    setJoining(false);
  };

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"20px 16px 48px",width:"100%",maxWidth:480,boxSizing:"border-box"}}>
        <Sheet/>
        <div style={{fontSize:17,fontWeight:800,color:"#2d3436",marginBottom:16}}>👤 내 정보</div>

        {/* 현재 이메일 */}
        <div style={{background:"#f5f0ff",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"#a29bfe",marginBottom:4}}>내 계정</div>
          <div style={{fontSize:14,fontWeight:700,color:"#2d3436"}}>{userEmail}</div>
        </div>

        {/* 그룹 멤버 */}
        <div style={{background:"#f5f0ff",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"#a29bfe",marginBottom:10}}>그룹 멤버 ({members.length}/3)</div>
          {members.map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<members.length-1?8:0}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:["#6c5ce7","#e17055","#00b894"][i]+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:["#6c5ce7","#e17055","#00b894"][i]}}>
                {m[0]?.toUpperCase()}
              </div>
              <div style={{fontSize:13,color:"#2d3436",fontWeight:m===userEmail?700:400}}>
                {m} {m===userEmail&&<span style={{fontSize:10,color:"#a29bfe"}}>(나)</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 초대 코드 */}
        {members.length < 3 && (
          <div style={{background:"#f5f0ff",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"#a29bfe",marginBottom:8}}>초대 코드 (가족에게 공유)</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,background:"#fff",borderRadius:10,padding:"10px 14px",fontSize:22,fontWeight:800,color:"#6c5ce7",letterSpacing:4,textAlign:"center"}}>
                {inviteCode}
              </div>
              <button onClick={copyCode} style={{padding:"10px 14px",borderRadius:10,border:"none",background:"#6c5ce7",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                {copied?"복사됨✅":"복사"}
              </button>
            </div>
            <div style={{fontSize:10,color:"#a29bfe",marginTop:6,textAlign:"center"}}>이 코드로 가족이 같은 일정에 접근할 수 있어요</div>
          </div>
        )}

        {/* 그룹 합류 */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#a29bfe",marginBottom:8}}>다른 그룹 초대 코드로 합류</div>
          <div style={{display:"flex",gap:8}}>
            <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="초대 코드 입력" maxLength={6}
              style={{flex:1,padding:"10px 12px",borderRadius:11,border:"1.5px solid #e0d9ff",fontSize:14,fontWeight:700,color:"#2d3436",outline:"none",letterSpacing:2,background:"#faf9ff"}}/>
            <button onClick={doJoin} disabled={!joinCode.trim()||joining}
              style={{padding:"10px 14px",borderRadius:11,border:"none",background:joinCode.trim()?"#6c5ce7":"#e0d9ff",color:joinCode.trim()?"#fff":"#c0b8e8",fontWeight:700,fontSize:13,cursor:"pointer"}}>
              {joining?"합류 중...":"합류"}
            </button>
          </div>
          <div style={{fontSize:10,color:"#b2bec3",marginTop:5}}>⚠️ 합류 시 현재 그룹에서 나가게 돼요</div>
        </div>

        {/* 로그아웃 */}
        <button onClick={onLogout} style={{width:"100%",padding:"12px",borderRadius:14,border:"1.5px solid #ffccc7",background:"#fff5f5",color:"#d63031",fontWeight:700,fontSize:14,cursor:"pointer"}}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

// ─── 일간 뷰 ──────────────────────────────────────────────────────────────────
function DailyView({school,events,alarms,periodTimes,onEditEvent,onAddEvent,onAlarm}){
  const [selDow,setSelDow]=useState(todayDow());
  const daySchool=school[selDow]||{subjects:[],dismissal:""};
  const afterEvents=events.filter(e=>e.days.includes(selDow)).sort((a,b)=>t2m(a.startTime)-t2m(b.startTime));
  const nm=nowMin(),isCurDow=selDow===todayDow();
  return(
    <div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {DAYS_KR.map((d,i)=>(
          <button key={i} onClick={()=>setSelDow(i)}
            style={{flex:1,padding:"6px 0",borderRadius:10,border:`2px solid ${selDow===i?"#6c5ce7":"#e0d9ff"}`,background:selDow===i?"#6c5ce7":"#fff",color:selDow===i?"#fff":"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {d}
          </button>
        ))}
      </div>
      {/* 학교 */}
      <div style={{background:"#fff",borderRadius:16,padding:"12px 14px",marginBottom:10,boxShadow:"0 2px 12px #6c5ce708"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#a29bfe",marginBottom:10,letterSpacing:1}}>🏫 학교 수업</div>
        {daySchool.subjects.every(s=>!s)?(
          <div style={{textAlign:"center",padding:"14px 0",color:"#c0b8e8",fontSize:13}}>이날은 학교 수업이 없어요</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {periodTimes.map((p,i)=>{
              const subj=daySchool.subjects[i]||"";
              const isCur=isCurDow&&nm>=t2m(p.start)&&nm<t2m(p.end);
              if(!subj&&!isCur) return null;
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:12,background:isCur?subjColor(subj)+"22":"#faf9ff",border:`1.5px solid ${isCur?subjColor(subj):"transparent"}`}}>
                  <div style={{flexShrink:0,textAlign:"center",minWidth:52,background:"#f0edff",borderRadius:9,padding:"5px 4px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#6c5ce7"}}>{p.label}</div>
                    <div style={{fontSize:9,color:"#a29bfe"}}>{p.start}~{p.end}</div>
                  </div>
                  <div style={{flex:1,fontSize:14,fontWeight:700,color:subj?"#2d3436":"#ccc"}}>{subj||"—"}</div>
                  {isCur&&<span style={{fontSize:9,background:"#6c5ce7",color:"#fff",borderRadius:6,padding:"2px 6px",fontWeight:700}}>지금</span>}
                </div>
              );
            })}
          </div>
        )}
        {daySchool.dismissal&&(
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:12,background:"#f0edff"}}>
            <span>🏠</span>
            <span style={{fontSize:13,fontWeight:700,color:"#6c5ce7"}}>하교 {daySchool.dismissal}</span>
            {isCurDow&&nm<t2m(daySchool.dismissal)&&<span style={{fontSize:10,color:"#a29bfe",marginLeft:"auto"}}>{t2m(daySchool.dismissal)-nm}분 남음</span>}
          </div>
        )}
      </div>
      {/* 방과후 */}
      <div style={{background:"#fff",borderRadius:16,padding:"12px 14px",boxShadow:"0 2px 12px #6c5ce708"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#a29bfe",marginBottom:10,letterSpacing:1}}>🌇 방과후 일정</div>
        {afterEvents.length===0?(
          <div style={{textAlign:"center",padding:"14px 0",color:"#c0b8e8",fontSize:13}}>방과후 일정이 없어요</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {afterEvents.map(ev=>{
              const s=t2m(ev.startTime),e=ev.endTime?t2m(ev.endTime):s+60;
              const isCur=isCurDow&&nm>=s&&nm<e;
              return(
                <div key={ev.id} onClick={()=>onEditEvent(ev)}
                  style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:14,border:`1.5px solid ${isCur?ev.color||"#6c5ce7":"#f0edff"}`,background:isCur?(ev.color||"#6c5ce7")+"11":"#faf9ff",cursor:"pointer",boxShadow:isCur?`0 0 0 2px ${ev.color||"#6c5ce7"}44`:"none"}}>
                  <div style={{width:36,height:36,borderRadius:11,background:(ev.color||"#6c5ce7")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{TYPE_META[ev.type]?.emoji||"⭐"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:14,fontWeight:700,color:"#2d3436"}}>{ev.title}</span>
                      {isCur&&<span style={{fontSize:9,background:ev.color||"#6c5ce7",color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:700}}>지금</span>}
                    </div>
                    <div style={{fontSize:11,color:"#8e84c8"}}>{ev.startTime}{ev.endTime?` ~ ${ev.endTime}`:""}</div>
                    {ev.memo&&<div style={{fontSize:10,color:"#b2bec3",marginTop:1}}>{ev.memo}</div>}
                  </div>
                  <button onClick={e=>{e.stopPropagation();onAlarm(ev);}} style={{fontSize:16,background:"none",border:"none",cursor:"pointer",opacity:alarms[ev.id]?1:0.3,flexShrink:0,alignSelf:"center"}}>{alarms[ev.id]?"🔔":"🔕"}</button>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={()=>onAddEvent(selDow)} style={{width:"100%",marginTop:10,padding:"11px",borderRadius:12,border:"2px dashed #c0b8e8",background:"none",color:"#8e84c8",fontWeight:600,fontSize:13,cursor:"pointer"}}>+ 방과후 일정 추가</button>
      </div>
    </div>
  );
}

// ─── 주간 뷰 ──────────────────────────────────────────────────────────────────
function WeekView({school,events,weekDates,setWeekOff,onEditEvent,onAddEvent}){
  const isToday=d=>d.toDateString()===new Date().toDateString();
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <NavBtn onClick={()=>setWeekOff(w=>w-1)}>‹</NavBtn>
        <span style={{fontWeight:700,fontSize:13,color:"#2d3436"}}>{weekDates[0].getMonth()+1}/{weekDates[0].getDate()} ~ {weekDates[6].getMonth()+1}/{weekDates[6].getDate()}</span>
        <NavBtn onClick={()=>setWeekOff(w=>w+1)}>›</NavBtn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {weekDates.map((d,i)=>{
          const dow=(d.getDay()+6)%7,ds=school[dow]||{subjects:[],dismissal:""},ae=events.filter(e=>e.days.includes(dow)).sort((a,b)=>t2m(a.startTime)-t2m(b.startTime)),today=isToday(d),ss=ds.subjects.filter(Boolean);
          return(
            <div key={i} style={{background:today?"#f0edff":"#fff",borderRadius:12,padding:"7px 4px",border:`${today?2:1}px solid ${today?"#a29bfe":"#ede9ff"}`,minHeight:130}}>
              <div style={{textAlign:"center",marginBottom:5}}>
                <div style={{fontSize:10,fontWeight:700,color:today?"#6c5ce7":"#8e84c8"}}>{DAYS_KR[i]}</div>
                <div style={{fontSize:13,fontWeight:800,color:today?"#6c5ce7":"#2d3436"}}>{d.getDate()}</div>
              </div>
              {ss.slice(0,3).map((s,si)=>(
                <div key={si} style={{borderRadius:4,background:subjColor(s)+"33",marginBottom:2,padding:"2px 3px",textAlign:"center"}}>
                  <div style={{fontSize:8,fontWeight:700,color:"#2d3436"}}>{s}</div>
                </div>
              ))}
              {ss.length>3&&<div style={{fontSize:8,color:"#a29bfe",textAlign:"center",marginBottom:2}}>+{ss.length-3}교시</div>}
              {ds.dismissal&&<div style={{fontSize:8,color:"#6c5ce7",textAlign:"center",marginBottom:3}}>🏠{ds.dismissal}</div>}
              {ae.map(ev=>(
                <div key={ev.id} onClick={()=>onEditEvent(ev)} style={{borderRadius:5,background:(ev.color||"#6c5ce7")+"22",border:`1px solid ${ev.color||"#6c5ce7"}44`,marginBottom:2,padding:"2px 3px",cursor:"pointer"}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#2d3436",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
                  <div style={{fontSize:8,color:"#636e72"}}>{ev.startTime}</div>
                </div>
              ))}
              <button onClick={()=>onAddEvent(dow)} style={{width:"100%",marginTop:2,padding:"2px 0",border:"1px dashed #c0b8e8",borderRadius:5,background:"none",color:"#c0b8e8",fontSize:11,cursor:"pointer"}}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 월간 뷰 ──────────────────────────────────────────────────────────────────
function MonthView({mDates,mLabel,setMonthOff,school,events,isToday}){
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <NavBtn onClick={()=>setMonthOff(m=>m-1)}>‹</NavBtn>
        <span style={{fontWeight:700,fontSize:15,color:"#2d3436"}}>{mLabel}</span>
        <NavBtn onClick={()=>setMonthOff(m=>m+1)}>›</NavBtn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {DAYS_KR.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#a29bfe",padding:"4px 0"}}>{d}</div>)}
        {mDates.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const dow=(d.getDay()+6)%7,subjs=(school[dow]?.subjects||[]).filter(Boolean),ae=events.filter(e=>e.days.includes(dow)),today=isToday(d),weekend=dow>=5;
          return(
            <div key={i} style={{background:today?"#ede9ff":weekend?"#fff5f5":"#fff",borderRadius:9,padding:"4px 3px",minHeight:54,border:`${today?2:1}px solid ${today?"#a29bfe":"#ede9ff"}`}}>
              <div style={{fontSize:11,fontWeight:today?800:600,color:today?"#6c5ce7":weekend?"#ff6b6b":"#2d3436",textAlign:"center",marginBottom:2}}>{d.getDate()}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center"}}>
                {subjs.slice(0,2).map((s,si)=><div key={si} style={{width:5,height:5,borderRadius:"50%",background:subjColor(s)}}/>)}
                {ae.slice(0,2).map(ev=><div key={ev.id} style={{width:5,height:5,borderRadius:"50%",background:ev.color||"#6c5ce7"}}/>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({onClick,children}){
  return <button onClick={onClick} style={{width:32,height:32,borderRadius:"50%",border:"1.5px solid #e0d9ff",background:"#fff",fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#6c5ce7"}}>{children}</button>;
}

// ─── 학교 시간표 모달 ─────────────────────────────────────────────────────────
function SchoolModal({school,periodTimes,onSave,onClose}){
  const [ls,setLs]=useState(()=>Object.fromEntries(Array.from({length:7},(_,i)=>[i,{subjects:[...(school[i]?.subjects||[]),...Array(6).fill("")].slice(0,6),dismissal:school[i]?.dismissal||""}])));
  const [lp,setLp]=useState(periodTimes.map(p=>({...p})));
  const [sd,setSd]=useState(0);
  const [tab,setTab]=useState("subjects");
  const cur=ls[sd];
  const setSubj=(pi,v)=>setLs(p=>{const s=[...p[sd].subjects];s[pi]=v;return{...p,[sd]:{...p[sd],subjects:s}};});
  const setPF=(pi,f,v)=>setLp(p=>p.map((pt,i)=>i===pi?{...pt,[f]:v}:pt));
  const autoFill=()=>{const s=ls[sd].subjects,last=s.reduceRight((a,x,i)=>a===-1&&x?i:a,-1);setLs(p=>({...p,[sd]:{...p[sd],dismissal:last>=0?lp[last].end:""}}));};
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"20px 16px 48px",width:"100%",maxWidth:480,boxSizing:"border-box",maxHeight:"92vh",overflowY:"auto"}}>
        <Sheet/>
        <div style={{fontSize:17,fontWeight:800,color:"#2d3436",marginBottom:14}}>🏫 학교 시간표 설정</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["subjects","📚 과목"],["times","⏰ 교시 시간"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"8px 0",borderRadius:11,border:`2px solid ${tab===k?"#6c5ce7":"#e0d9ff"}`,background:tab===k?"#6c5ce7":"#fff",color:tab===k?"#fff":"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {tab==="subjects"&&(
          <>
            <div style={{display:"flex",gap:5,marginBottom:14}}>
              {DAYS_KR.map((d,i)=><button key={i} onClick={()=>setSd(i)} style={{flex:1,padding:"6px 0",borderRadius:10,border:`2px solid ${sd===i?"#6c5ce7":(ls[i]?.subjects||[]).some(Boolean)?"#a29bfe55":"#e0d9ff"}`,background:sd===i?"#6c5ce7":"#fff",color:sd===i?"#fff":"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>{d}</button>)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              {lp.map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flexShrink:0,background:"#f0edff",borderRadius:10,padding:"6px 8px",textAlign:"center",minWidth:64}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#6c5ce7"}}>{p.label}</div>
                    <div style={{fontSize:9,color:"#a29bfe"}}>{p.start}~{p.end}</div>
                  </div>
                  <input value={cur.subjects[i]||""} onChange={e=>setSubj(i,e.target.value)} placeholder="과목 입력..."
                    style={{flex:1,padding:"10px 12px",borderRadius:11,border:`1.5px solid ${cur.subjects[i]?subjColor(cur.subjects[i]):"#e0d9ff"}`,fontSize:14,fontWeight:cur.subjects[i]?700:400,color:"#2d3436",background:"#fff",outline:"none"}}/>
                  {cur.subjects[i]&&<div style={{width:9,height:9,borderRadius:"50%",background:subjColor(cur.subjects[i]),flexShrink:0}}/>}
                </div>
              ))}
            </div>
            <div style={{marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",marginBottom:8}}><L>🏠 하교 시간</L><button onClick={autoFill} style={{marginLeft:"auto",fontSize:11,padding:"4px 10px",borderRadius:8,border:"1.5px solid #e0d9ff",background:"#f0edff",color:"#6c5ce7",cursor:"pointer",fontWeight:600}}>마지막 교시 자동채움</button></div>
              <input type="time" value={cur.dismissal||""} onChange={e=>setLs(p=>({...p,[sd]:{...p[sd],dismissal:e.target.value}}))} style={{...timeInp}}/>
            </div>
          </>
        )}
        {tab==="times"&&(
          <>
            <div style={{fontSize:11,color:"#636e72",marginBottom:12,padding:"10px 12px",background:"#faf9ff",borderRadius:12,lineHeight:1.6}}>각 교시의 시작·종료 시간을 수정하세요. 전체 요일에 적용돼요.</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              {lp.map((p,i)=>(
                <div key={i} style={{background:"#faf9ff",borderRadius:12,padding:"10px 12px",border:"1.5px solid #e0d9ff"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#6c5ce7",marginBottom:8}}>{p.label}</div>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{flex:1}}><div style={{fontSize:10,color:"#a29bfe",fontWeight:600,marginBottom:4}}>시작</div><input type="time" value={p.start} onChange={e=>setPF(i,"start",e.target.value)} style={{...timeInp,fontSize:15,padding:"8px 10px"}}/></div>
                    <div style={{fontSize:16,color:"#c0b8e8",fontWeight:700,paddingTop:18}}>~</div>
                    <div style={{flex:1}}><div style={{fontSize:10,color:"#a29bfe",fontWeight:600,marginBottom:4}}>종료</div><input type="time" value={p.end} onChange={e=>setPF(i,"end",e.target.value)} style={{...timeInp,fontSize:15,padding:"8px 10px"}}/></div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=>setLp(DEFAULT_PERIOD_TIMES.map(p=>({...p})))} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #e0d9ff",background:"#fff",color:"#8e84c8",fontWeight:600,fontSize:13,cursor:"pointer",marginBottom:14}}>↺ 기본 시간으로 초기화</button>
          </>
        )}
        <button onClick={()=>onSave(ls,lp)} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"}}>저장</button>
      </div>
    </div>
  );
}

// ─── 빠른 입력 모달 ────────────────────────────────────────────────────────────
function QuickAddModal({school,periodTimes,onSave,onClose}){
  const EX=`월: 국어, 수학, 영어, 과학, 사회, 체육\n화: 수학, 국어, 사회, 체육, 음악\n수: 영어, 수학, 국어, 미술, 도덕\n목: 과학, 국어, 수학, 영어, 창체\n금: 체육, 사회, 음악, 국어, 수학`;
  const [text,setText]=useState("");const [preview,setPreview]=useState(null);const [err,setErr]=useState("");
  const dayMap={월:0,화:1,수:2,목:3,금:4,토:5,일:6};
  const parse=()=>{
    setErr("");
    try{
      const result={...school};
      text.trim().split("\n").filter(l=>l.trim()).forEach(line=>{
        const[dp,sp]=line.split(":");if(!dp||!sp) return;
        const dow=dayMap[dp.trim().replace(/요일/,"")];if(dow===undefined) return;
        const subjects=sp.split(",").map(s=>s.trim()).slice(0,6);
        while(subjects.length<6)subjects.push("");
        const last=subjects.reduceRight((a,s,i)=>a===-1&&s?i:a,-1);
        result[dow]={subjects,dismissal:last>=0?periodTimes[last].end:(school[dow]?.dismissal||"")};
      });
      setPreview(result);
    }catch{setErr("입력 형식을 확인해주세요");}
  };
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"20px 16px 48px",width:"100%",maxWidth:480,boxSizing:"border-box",maxHeight:"90vh",overflowY:"auto"}}>
        <Sheet/>
        <div style={{fontSize:17,fontWeight:800,color:"#2d3436",marginBottom:4}}>⚡ 빠른 시간표 입력</div>
        <div style={{fontSize:11,color:"#a29bfe",marginBottom:12}}>요일별 과목을 한 번에 입력하세요</div>
        <div style={{background:"#f5f0ff",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"#6c5ce7",marginBottom:6}}>📋 형식 예시</div>
          <pre style={{fontSize:11,color:"#636e72",margin:0,fontFamily:"monospace",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{EX}</pre>
          <button onClick={()=>setText(EX)} style={{marginTop:8,fontSize:11,padding:"4px 10px",borderRadius:8,border:"1.5px solid #a29bfe",background:"#fff",color:"#6c5ce7",cursor:"pointer",fontWeight:600}}>예시 불러오기</button>
        </div>
        <textarea value={text} onChange={e=>{setText(e.target.value);setPreview(null);setErr("");}} placeholder="월: 국어, 수학, 영어..." rows={6}
          style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:12,border:"1.5px solid #e0d9ff",fontSize:13,color:"#2d3436",background:"#faf9ff",outline:"none",resize:"vertical",fontFamily:"monospace",lineHeight:1.8,marginBottom:8}}/>
        {err&&<div style={{color:"#d63031",fontSize:12,marginBottom:8,padding:"6px 10px",background:"#fff5f5",borderRadius:8}}>{err}</div>}
        {!preview?(
          <button onClick={parse} style={{width:"100%",padding:"13px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:8}}>미리보기</button>
        ):(
          <>
            <div style={{background:"#f5f0ff",borderRadius:14,padding:"12px",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6c5ce7",marginBottom:10}}>✅ 인식 결과</div>
              {Object.entries(preview).map(([d,data])=>data.subjects.some(Boolean)&&(
                <div key={d} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#6c5ce7",width:20}}>{DAYS_KR[parseInt(d)]}</div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap",flex:1}}>
                    {data.subjects.filter(Boolean).map((s,i)=><span key={i} style={{fontSize:10,padding:"2px 6px",borderRadius:6,background:subjColor(s)+"33",color:"#2d3436",fontWeight:600}}>{s}</span>)}
                  </div>
                  {data.dismissal&&<div style={{fontSize:10,color:"#a29bfe"}}>🏠{data.dismissal}</div>}
                </div>
              ))}
            </div>
            <button onClick={()=>onSave(preview,null)} style={{width:"100%",padding:"13px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:8}}>시간표 적용하기</button>
            <button onClick={()=>setPreview(null)} style={{width:"100%",padding:"11px",borderRadius:14,border:"1.5px solid #e0d9ff",background:"#fff",color:"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>다시 수정</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 이벤트 모달 ──────────────────────────────────────────────────────────────
function EventModal({modal,onSave,onDelete,onClose}){
  const isEdit=modal.mode==="edit",ev0=modal.event;
  const[title,setTitle]=useState(isEdit?ev0.title:"");const[type,setType]=useState(isEdit?ev0.type:"hagwon");
  const[days,setDays]=useState(isEdit?ev0.days:(modal.dow!=null?[modal.dow]:[]));
  const[startT,setStartT]=useState(isEdit?ev0.startTime:"15:00");const[hasEnd,setHasEnd]=useState(isEdit?!!ev0.endTime:true);
  const[endT,setEndT]=useState(isEdit&&ev0.endTime?ev0.endTime:"16:00");
  const[color,setColor]=useState(isEdit?ev0.color||"#6c5ce7":"#6c5ce7");const[memo,setMemo]=useState(isEdit?ev0.memo||"":"");
  const[conf,setConf]=useState(false);
  const togDay=d=>setDays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d].sort((a,b)=>a-b));
  const handleSave=()=>{ if(!title.trim()||days.length===0)return; onSave({id:isEdit?ev0.id:uid(),title:title.trim(),type,days,startTime:startT,endTime:hasEnd?endT:"",color,memo}); };
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"20px 16px 48px",width:"100%",maxWidth:480,boxSizing:"border-box",maxHeight:"92vh",overflowY:"auto"}}>
        <Sheet/>
        <div style={{fontSize:17,fontWeight:800,color:"#2d3436",marginBottom:14}}>{isEdit?"일정 수정":"방과후 일정 추가"}</div>
        <L>일정 이름</L><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: 수학학원, 영어숙제..." style={{...inp,marginBottom:14}}/>
        <L>종류</L>
        <div style={{display:"flex",gap:7,marginBottom:14}}>
          {Object.entries(TYPE_META).map(([k,v])=><button key={k} onClick={()=>setType(k)} style={{flex:1,padding:"9px 4px",borderRadius:11,border:`2px solid ${type===k?v.color:"#e0d9ff"}`,background:type===k?v.color+"18":"#fff",color:type===k?v.color:"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>{v.emoji} {v.label}</button>)}
        </div>
        <L>반복 요일</L>
        <div style={{display:"flex",gap:5,marginBottom:14}}>
          {DAYS_KR.map((d,i)=><button key={i} onClick={()=>togDay(i)} style={{flex:1,padding:"7px 0",borderRadius:10,border:`2px solid ${days.includes(i)?color:"#e0d9ff"}`,background:days.includes(i)?color+"22":"#fff",color:days.includes(i)?color:"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>{d}</button>)}
        </div>
        <L>시작 시간</L><input type="time" value={startT} onChange={e=>setStartT(e.target.value)} style={{...timeInp,marginBottom:14}}/>
        <div style={{display:"flex",alignItems:"center",marginBottom:8}}><L>종료 시간</L><button onClick={()=>setHasEnd(v=>!v)} style={{marginLeft:"auto",fontSize:11,padding:"4px 10px",borderRadius:8,border:`1.5px solid ${hasEnd?"#6c5ce7":"#e0d9ff"}`,background:hasEnd?"#f0edff":"#fff",color:hasEnd?"#6c5ce7":"#8e84c8",cursor:"pointer",fontWeight:600}}>{hasEnd?"설정됨":"없음"}</button></div>
        {hasEnd&&<input type="time" value={endT} onChange={e=>setEndT(e.target.value)} style={{...timeInp,marginBottom:14}}/>}
        <L>색상</L>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>{COLORS.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:`3px solid ${color===c?"#2d3436":"transparent"}`,cursor:"pointer"}}/>)}</div>
        <L>메모</L><input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="준비물, 참고사항..." style={{...inp,marginBottom:18}}/>
        <button onClick={handleSave} disabled={!title.trim()||days.length===0} style={{width:"100%",padding:"13px",borderRadius:14,border:"none",background:!title.trim()||days.length===0?"#e0d9ff":"linear-gradient(135deg,#6c5ce7,#a29bfe)",color:!title.trim()||days.length===0?"#c0b8e8":"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:8}}>
          {isEdit?"수정 완료":"추가하기"}
        </button>
        {isEdit&&(conf?(
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>onDelete(ev0.id)} style={{flex:1,padding:"12px",borderRadius:13,border:"none",background:"#d63031",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>정말 삭제</button>
            <button onClick={()=>setConf(false)} style={{flex:1,padding:"12px",borderRadius:13,border:"1.5px solid #e0d9ff",background:"#fff",color:"#8e84c8",fontWeight:700,fontSize:14,cursor:"pointer"}}>취소</button>
          </div>
        ):(
          <button onClick={()=>setConf(true)} style={{width:"100%",padding:"12px",borderRadius:13,border:"1.5px solid #ffccc7",background:"#fff5f5",color:"#d63031",fontWeight:700,fontSize:14,cursor:"pointer"}}>🗑️ 삭제</button>
        ))}
      </div>
    </div>
  );
}

// ─── 알람 모달 ────────────────────────────────────────────────────────────────
function AlarmModal({event,alarms,onSet,onClose}){
  const cur=alarms[event.id]||null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"22px 16px 48px",width:"100%",maxWidth:480,boxSizing:"border-box"}}>
        <Sheet/>
        <div style={{fontSize:17,fontWeight:800,color:"#2d3436",marginBottom:10,textAlign:"center"}}>⏰ 알람 설정</div>
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#faf9ff",borderRadius:12,padding:"10px 14px",marginBottom:14}}>
          <span style={{fontSize:18}}>{TYPE_META[event.type]?.emoji||"⭐"}</span>
          <div><div style={{fontSize:13,fontWeight:700,color:"#2d3436"}}>{event.title}</div><div style={{fontSize:11,color:"#8e84c8"}}>{event.startTime} 시작 전 알람</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:10}}>
          {[5,10,15,20,30,60].map(m=>(
            <button key={m} onClick={()=>onSet(event.id,m)} style={{padding:"11px 4px",borderRadius:11,border:`2px solid ${cur===m?(event.color||"#6c5ce7"):"#e0d9ff"}`,background:cur===m?(event.color||"#6c5ce7")+"22":"#fff",color:cur===m?(event.color||"#6c5ce7"):"#8e84c8",fontWeight:700,fontSize:13,cursor:"pointer"}}>{m}분 전</button>
          ))}
        </div>
        <div style={{fontSize:11,color:"#b2bec3",textAlign:"center",marginBottom:10}}>앱이 열려있을 때 상단 배너로 알려드려요</div>
        {cur&&<button onClick={()=>onSet(event.id,null)} style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:"#ffe0de",color:"#d63031",fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:7}}>🗑️ 알람 삭제</button>}
        <button onClick={onClose} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #e0d9ff",background:"#fff",color:"#8e84c8",fontWeight:700,fontSize:14,cursor:"pointer"}}>닫기</button>
      </div>
    </div>
  );
}

const Sheet   = () => <div style={{width:38,height:4,borderRadius:2,background:"#e0d9ff",margin:"0 auto 14px"}}/>;
const L       = ({children}) => <div style={{fontSize:11,fontWeight:700,color:"#a29bfe",marginBottom:6}}>{children}</div>;
const inp     = {width:"100%",boxSizing:"border-box",padding:"10px 13px",borderRadius:11,border:"1.5px solid #e0d9ff",fontSize:13,color:"#2d3436",background:"#faf9ff",outline:"none"};
const timeInp = {width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:11,border:"1.5px solid #e0d9ff",fontSize:18,fontWeight:700,color:"#2d3436",background:"#faf9ff",outline:"none"};
