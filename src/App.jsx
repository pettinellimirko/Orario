import { useState, useEffect, Fragment } from "react";
import { Plus, X, Trash2, AlertTriangle, Eye, LayoutGrid, Users, LogOut, Lock, UserPlus, ArrowUp, ArrowDown } from "lucide-react";
import { supabase, supabaseConfigured } from "./supabaseClient";

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];

// Orari fissi della scuola. Il martedì ha uscita anticipata.
// Ogni valore è un confine tra un periodo e il successivo.
const BOUNDARIES = {
  0: ["8:20", "9:20", "10:20", "11:20", "12:20", "13:20", "14:20", "15:20", "16:40"],
  1: ["8:20", "9:20", "10:20", "11:20", "12:20", "13:40"],
  2: ["8:20", "9:20", "10:20", "11:20", "12:20", "13:20", "14:20", "15:20", "16:40"],
  3: ["8:20", "9:20", "10:20", "11:20", "12:20", "13:20", "14:20", "15:20", "16:40"],
  4: ["8:20", "9:20", "10:20", "11:20", "12:20", "13:20", "14:20", "15:20", "16:40"],
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const periodsForDay = (day) => {
  const b = BOUNDARIES[day];
  return b.slice(0, -1).map((start, i) => ({ index: i, start, end: b[i + 1] }));
};

const MAX_PERIODS = Math.max(...Object.values(BOUNDARIES).map((b) => b.length - 1));
const REFERENCE_PERIODS = periodsForDay(0); // per le etichette orario in griglia (uguali per tutti i giorni tranne il martedì, che semplicemente si ferma prima)

const periodDuration = (day, periodIndex) => {
  const p = periodsForDay(day)[periodIndex];
  if (!p) return 0;
  return toMinutes(p.end) - toMinutes(p.start);
};

const formatDuration = (minutes) => {
  if (minutes <= 0) return "0min";
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

const PALETTE = {
  bg: "#FAF7F1",
  surface: "#FFFFFF",
  border: "#E7E0D3",
  ink: "#2A2620",
  inkMuted: "#7A7266",
  primary: "#3E6B5F",
  primarySoft: "#E6EEEA",
  honey: "#D9973F",
  honeySoft: "#F7ECDA",
  danger: "#B5482F",
  dangerSoft: "#F6E4DF",
};

const classColors = ["#D9973F", "#3E6B5F", "#3B6EA5", "#8B5FA8", "#B5482F", "#4C8577"];

export default function App() {
  if (!supabaseConfigured) {
    return <SetupNeeded />;
  }

  const [tab, setTab] = useState("insegnante");
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [slots, setSlots] = useState([]);

  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [modal, setModal] = useState(null); // { day, periodIndex }

  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherHours, setNewTeacherHours] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newAssign, setNewAssign] = useState({ teacherId: "", subjectId: "", classId: "", hours: "" });

  // ---- auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // ---- data fetching ----
  const fetchAll = async () => {
    const [teachersRes, subjectsRes, classesRes, assignmentsRes, slotsRes] = await Promise.all([
      supabase.from("teachers").select("*").order("name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("classes").select("*").order("position"),
      supabase.from("assignments").select("*"),
      supabase.from("slots").select("*"),
    ]);
    setTeachers((teachersRes.data || []).map((t) => ({ id: t.id, name: t.name, totalHours: t.total_hours })));
    setSubjects((subjectsRes.data || []).map((s) => ({ id: s.id, name: s.name })));
    setClasses((classesRes.data || []).map((c) => ({ id: c.id, name: c.name, color: c.color, position: c.position })));
    setAssignments(
      (assignmentsRes.data || []).map((a) => ({
        id: a.id,
        teacherId: a.teacher_id,
        subjectId: a.subject_id,
        classId: a.class_id,
        hours: a.hours,
      }))
    );
    setSlots(
      (slotsRes.data || []).map((s) => ({
        id: s.id,
        day: s.day,
        periodIndex: s.period_index,
        assignmentId: s.assignment_id,
        isCo: s.is_co,
        coOffsetMinutes: s.co_offset_minutes,
        coDurationMinutes: s.co_duration_minutes,
      }))
    );
    setDataLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedTeacherId && teachers.length > 0) setSelectedTeacherId(teachers[0].id);
  }, [teachers, selectedTeacherId]);

  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "—";
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || "—";
  const className = (id) => classes.find((c) => c.id === id)?.name || "—";
  const classColor = (id) => classes.find((c) => c.id === id)?.color || PALETTE.primary;
  const assignmentById = (id) => assignments.find((a) => a.id === id);
  const teacherOfAssignment = (assignmentId) => assignmentById(assignmentId)?.teacherId;

  // minuti usati da un'assegnazione: periodi interi assegnati + eventuali frazioni in compresenza
  const usedMinutes = (assignmentId) => {
    const primary = slots
      .filter((s) => !s.isCo && s.assignmentId === assignmentId)
      .reduce((sum, s) => sum + periodDuration(s.day, s.periodIndex), 0);
    const co = slots
      .filter((s) => s.isCo && s.assignmentId === assignmentId)
      .reduce((sum, s) => sum + (s.coDurationMinutes || 0), 0);
    return primary + co;
  };
  const remainingMinutes = (assignment) => assignment.hours * 60 - usedMinutes(assignment.id);

  const teacherAssignedHours = (teacherId) =>
    assignments.filter((a) => a.teacherId === teacherId).reduce((sum, a) => sum + a.hours, 0);
  const teacherRemainingBudget = (teacherId) => {
    const t = teachers.find((tt) => tt.id === teacherId);
    return t ? t.totalHours - teacherAssignedHours(teacherId) : 0;
  };

  const primarySlotAt = (day, periodIndex, classId) =>
    slots.find((s) => {
      const a = assignmentById(s.assignmentId);
      return !s.isCo && s.day === day && s.periodIndex === periodIndex && a && a.classId === classId;
    });

  const coSlotsAt = (day, periodIndex, classId) =>
    slots.filter((s) => {
      const a = assignmentById(s.assignmentId);
      return s.isCo && s.day === day && s.periodIndex === periodIndex && a && a.classId === classId;
    });

  const teacherBusyAt = (teacherId, day, periodIndex) =>
    slots.some(
      (s) => !s.isCo && s.day === day && s.periodIndex === periodIndex && teacherOfAssignment(s.assignmentId) === teacherId
    );

  // ---- actions (write to Supabase, then refresh) ----
  const addTeacher = async () => {
    if (!newTeacherName.trim()) return;
    const { error } = await supabase
      .from("teachers")
      .insert({ name: newTeacherName.trim(), total_hours: Number(newTeacherHours) || 0 });
    if (error) return alert("Errore: " + error.message);
    setNewTeacherName("");
    setNewTeacherHours("");
    await fetchAll();
  };
  const updateTeacherHours = async (id, value) => {
    const { error } = await supabase.from("teachers").update({ total_hours: Number(value) || 0 }).eq("id", id);
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };
  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    const { error } = await supabase.from("subjects").insert({ name: newSubjectName.trim() });
    if (error) return alert("Errore: " + error.message);
    setNewSubjectName("");
    await fetchAll();
  };
  const addClass = async () => {
    if (!newClassName.trim()) return;
    const color = classColors[classes.length % classColors.length];
    const { error } = await supabase.from("classes").insert({ name: newClassName.trim(), color });
    if (error) return alert("Errore: " + error.message);
    setNewClassName("");
    await fetchAll();
  };
  const addAssignment = async () => {
    const { teacherId, subjectId, classId, hours } = newAssign;
    if (!teacherId || !subjectId || !classId || !hours || Number(hours) <= 0) return;
    const { error } = await supabase
      .from("assignments")
      .insert({ teacher_id: teacherId, subject_id: subjectId, class_id: classId, hours: Number(hours) });
    if (error) return alert("Errore: " + error.message);
    setNewAssign({ teacherId: "", subjectId: "", classId: "", hours: "" });
    await fetchAll();
  };

  const removeTeacher = async (id) => {
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };
  const removeSubject = async (id) => {
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };
  const removeClass = async (id) => {
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return alert("Errore: " + error.message);
    if (selectedClassId === id) setSelectedClassId(null);
    await fetchAll();
  };
  const removeAssignment = async (id) => {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };

  const moveClass = async (id, direction) => {
    const idx = classes.findIndex((c) => c.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= classes.length) return;
    const a = classes[idx];
    const b = classes[swapIdx];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("classes").update({ position: b.position }).eq("id", a.id),
      supabase.from("classes").update({ position: a.position }).eq("id", b.id),
    ]);
    if (e1 || e2) return alert("Errore: " + (e1?.message || e2?.message));
    await fetchAll();
  };

  const openCell = (day, periodIndex) => setModal({ day, periodIndex });

  const assignPrimary = async (assignmentId) => {
    const { error } = await supabase
      .from("slots")
      .insert({ day: modal.day, period_index: modal.periodIndex, assignment_id: assignmentId, is_co: false });
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };
  const removeSlot = async (slotId) => {
    const { error } = await supabase.from("slots").delete().eq("id", slotId);
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };
  const addCoPresenza = async (assignmentId, offsetMinutes, durationMinutes) => {
    const { error } = await supabase.from("slots").insert({
      day: modal.day,
      period_index: modal.periodIndex,
      assignment_id: assignmentId,
      is_co: true,
      co_offset_minutes: offsetMinutes,
      co_duration_minutes: durationMinutes,
    });
    if (error) return alert("Errore: " + error.message);
    await fetchAll();
  };

  const classAssignments = assignments.filter((a) => a.classId === selectedClassId);

  const teacherSlots = (teacherId) =>
    slots
      .filter((s) => teacherOfAssignment(s.assignmentId) === teacherId)
      .map((s) => ({ ...s, assignment: assignmentById(s.assignmentId) }));

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: PALETTE.bg, color: PALETTE.ink, minHeight: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        .heading { font-family: 'Fraunces', serif; }
        button { font-family: inherit; }
        input, select { font-family: inherit; }
        ::selection { background: ${PALETTE.honeySoft}; }
      `}</style>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
          <div>
            <h1 className="heading text-3xl" style={{ color: PALETTE.ink, fontWeight: 600 }}>
              Orario settimanale
            </h1>
            <p style={{ color: PALETTE.inkMuted }} className="mt-1 text-sm">
              Scuola primaria · gestione orari insegnanti
            </p>
          </div>
          <nav className="flex gap-1 rounded-full p-1" style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}` }}>
            <TabButton icon={<Users size={15} />} active={tab === "config"} onClick={() => setTab("config")}>
              Anagrafica
            </TabButton>
            <TabButton icon={<LayoutGrid size={15} />} active={tab === "orario"} onClick={() => setTab("orario")}>
              Costruisci orario
            </TabButton>
            <TabButton icon={<Eye size={15} />} active={tab === "insegnante"} onClick={() => setTab("insegnante")}>
              Vista insegnante
            </TabButton>
          </nav>
        </div>

        <div className="mb-6 text-xs flex items-center gap-2" style={{ color: PALETTE.inkMuted }}>
          {session ? (
            <>
              <span>Accesso direzione: {session.user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1 underline" style={{ color: PALETTE.inkMuted }}>
                <LogOut size={12} /> Esci
              </button>
            </>
          ) : (
            <span>Consultazione pubblica — l'accesso della direzione serve solo per modificare i dati.</span>
          )}
        </div>

        {dataLoading ? (
          <p className="text-sm" style={{ color: PALETTE.inkMuted }}>Caricamento dati…</p>
        ) : (
          <>
            {tab === "config" &&
              (session ? (
                <ConfigTab
                  teachers={teachers} subjects={subjects} classes={classes} assignments={assignments}
                  newTeacherName={newTeacherName} setNewTeacherName={setNewTeacherName}
                  newTeacherHours={newTeacherHours} setNewTeacherHours={setNewTeacherHours}
                  addTeacher={addTeacher} removeTeacher={removeTeacher} updateTeacherHours={updateTeacherHours}
                  teacherAssignedHours={teacherAssignedHours} teacherRemainingBudget={teacherRemainingBudget}
                  newSubjectName={newSubjectName} setNewSubjectName={setNewSubjectName} addSubject={addSubject} removeSubject={removeSubject}
                  newClassName={newClassName} setNewClassName={setNewClassName} addClass={addClass} removeClass={removeClass} moveClass={moveClass}
                  newAssign={newAssign} setNewAssign={setNewAssign} addAssignment={addAssignment} removeAssignment={removeAssignment}
                  teacherName={teacherName} subjectName={subjectName} className={className}
                  remainingMinutes={remainingMinutes} usedMinutes={usedMinutes}
                />
              ) : (
                <LoginGate authLoading={authLoading} />
              ))}

            {tab === "orario" &&
              (session ? (
                <OrarioTab
                  classes={classes} selectedClassId={selectedClassId} setSelectedClassId={setSelectedClassId}
                  classAssignments={classAssignments} teacherName={teacherName} subjectName={subjectName}
                  remainingMinutes={remainingMinutes} primarySlotAt={primarySlotAt} coSlotsAt={coSlotsAt}
                  openCell={openCell} classColor={classColor} assignmentById={assignmentById}
                />
              ) : (
                <LoginGate authLoading={authLoading} />
              ))}

            {tab === "insegnante" && (
              <InsegnanteTab
                teachers={teachers} selectedTeacherId={selectedTeacherId} setSelectedTeacherId={setSelectedTeacherId}
                teacherSlots={teacherSlots} subjectName={subjectName} className={className} classColor={classColor}
                classes={classes} classAssignmentsFor={(classId) => assignments.filter((a) => a.classId === classId)}
                remainingMinutes={remainingMinutes} primarySlotAt={primarySlotAt} coSlotsAt={coSlotsAt}
                assignmentById={assignmentById} teacherName={teacherName}
              />
            )}
          </>
        )}
      </div>

      {modal && session && (
        <CellModal
          modal={modal}
          onClose={() => setModal(null)}
          classAssignments={classAssignments}
          teacherName={teacherName}
          subjectName={subjectName}
          remainingMinutes={remainingMinutes}
          teacherBusyAt={teacherBusyAt}
          assignPrimary={assignPrimary}
          removeSlot={removeSlot}
          addCoPresenza={addCoPresenza}
          primarySlotAt={primarySlotAt}
          coSlotsAt={coSlotsAt}
          selectedClassId={selectedClassId}
          assignmentById={assignmentById}
        />
      )}
    </div>
  );
}

function SetupNeeded() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#FAF7F1", minHeight: "100vh" }} className="flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl p-6" style={{ background: "#fff", border: "1px solid #E7E0D3" }}>
        <h1 className="text-lg mb-2" style={{ fontWeight: 600 }}>Configurazione mancante</h1>
        <p className="text-sm" style={{ color: "#7A7266" }}>
          Mancano le variabili d'ambiente <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    </div>
  );
}

function LoginGate({ authLoading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("Email o password non corretti.");
  };

  if (authLoading) return null;

  return (
    <Card style={{ maxWidth: 380 }}>
      <div className="flex items-center gap-2 mb-3">
        <Lock size={16} style={{ color: PALETTE.inkMuted }} />
        <SectionTitle>Accesso direzione</SectionTitle>
      </div>
      <p className="text-sm mb-4" style={{ color: PALETTE.inkMuted }}>
        Questa sezione è riservata a chi gestisce l'orario. Le insegnanti possono consultare il proprio orario da "Vista insegnante" senza accedere.
      </p>
      <div className="flex flex-col gap-2 mb-3">
        <TextInput type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <TextInput type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      {error && <p className="text-xs mb-3" style={{ color: PALETTE.danger }}>{error}</p>}
      <SmallButton onClick={submit}>{loading ? "Accesso in corso…" : "Accedi"}</SmallButton>
    </Card>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-colors"
      style={{ background: active ? PALETTE.primary : "transparent", color: active ? "#fff" : PALETTE.inkMuted, fontWeight: 500 }}>
      {icon}
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return <div className="rounded-2xl p-5" style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, ...style }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <h2 className="heading text-lg mb-3" style={{ fontWeight: 600 }}>{children}</h2>;
}

function TextInput(props) {
  return <input {...props} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: `1px solid ${PALETTE.border}`, background: "#fff" }} />;
}

function SmallButton({ onClick, children, tone = "primary" }) {
  const bg = tone === "primary" ? PALETTE.primary : tone === "danger" ? PALETTE.danger : PALETTE.honey;
  return (
    <button onClick={onClick} className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm text-white shrink-0" style={{ background: bg, fontWeight: 500 }}>
      {children}
    </button>
  );
}

function ListRow({ label, sub, onRemove }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
      <div>
        <div className="text-sm" style={{ fontWeight: 500 }}>{label}</div>
        {sub && <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{sub}</div>}
      </div>
      <button onClick={onRemove} style={{ color: PALETTE.inkMuted }} className="p-1 hover:opacity-70"><Trash2 size={15} /></button>
    </div>
  );
}

function ConfigTab(props) {
  const {
    teachers, subjects, classes, assignments,
    newTeacherName, setNewTeacherName, newTeacherHours, setNewTeacherHours, addTeacher, removeTeacher,
    updateTeacherHours, teacherAssignedHours, teacherRemainingBudget,
    newSubjectName, setNewSubjectName, addSubject, removeSubject,
    newClassName, setNewClassName, addClass, removeClass, moveClass,
    newAssign, setNewAssign, addAssignment, removeAssignment,
    teacherName, subjectName, className, remainingMinutes, usedMinutes,
  } = props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <Card>
        <SectionTitle>Insegnanti</SectionTitle>
        <p className="text-xs mb-3" style={{ color: PALETTE.inkMuted }}>
          Le ore totali sono il monte ore settimanale contrattuale.
        </p>
        <div className="flex gap-2 mb-3">
          <TextInput placeholder="Nome e cognome" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeacher()} />
          <input type="number" min="0" placeholder="Ore tot." value={newTeacherHours} onChange={(e) => setNewTeacherHours(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeacher()}
            className="w-24 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: `1px solid ${PALETTE.border}` }} />
          <SmallButton onClick={addTeacher}><Plus size={15} /></SmallButton>
        </div>
        {teachers.map((t) => {
          const assigned = teacherAssignedHours(t.id);
          const remaining = teacherRemainingBudget(t.id);
          const over = remaining < 0;
          const pct = t.totalHours > 0 ? Math.min(100, Math.round((assigned / t.totalHours) * 100)) : 0;
          return (
            <div key={t.id} className="py-2.5" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm" style={{ fontWeight: 500 }}>{t.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <input type="number" min="0" defaultValue={t.totalHours} key={`${t.id}-${t.totalHours}`}
                    onBlur={(e) => { if (Number(e.target.value) !== t.totalHours) updateTeacherHours(t.id, e.target.value); }}
                    className="w-16 rounded-md px-2 py-1 text-xs text-right outline-none" style={{ border: `1px solid ${PALETTE.border}` }} />
                  <span className="text-xs" style={{ color: PALETTE.inkMuted }}>h tot.</span>
                  <button onClick={() => removeTeacher(t.id)} style={{ color: PALETTE.inkMuted }}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="h-1.5 rounded-full w-full mb-1" style={{ background: PALETTE.border }}>
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: over ? PALETTE.danger : PALETTE.primary }} />
              </div>
              <div className="text-xs" style={{ color: over ? PALETTE.danger : PALETTE.inkMuted, fontWeight: over ? 600 : 400 }}>
                {assigned}h assegnate di {t.totalHours}h {over ? `· ${Math.abs(remaining)}h oltre il monte ore` : `· ${remaining}h libere`}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>Materie / attività</SectionTitle>
        <div className="flex gap-2 mb-3">
          <TextInput placeholder="Es. Musica" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
          <SmallButton onClick={addSubject}><Plus size={15} /></SmallButton>
        </div>
        {subjects.map((s) => <ListRow key={s.id} label={s.name} onRemove={() => removeSubject(s.id)} />)}
      </Card>

      <Card>
        <SectionTitle>Classi / sezioni</SectionTitle>
        <div className="flex gap-2 mb-3">
          <TextInput placeholder="Es. Sezione Rossa" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addClass()} />
          <SmallButton onClick={addClass}><Plus size={15} /></SmallButton>
        </div>
        {classes.map((c, idx) => (
          <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="text-sm truncate" style={{ fontWeight: 500 }}>{c.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => moveClass(c.id, "up")} disabled={idx === 0} style={{ color: idx === 0 ? PALETTE.border : PALETTE.inkMuted, opacity: idx === 0 ? 0.5 : 1 }}>
                <ArrowUp size={15} />
              </button>
              <button onClick={() => moveClass(c.id, "down")} disabled={idx === classes.length - 1} style={{ color: idx === classes.length - 1 ? PALETTE.border : PALETTE.inkMuted, opacity: idx === classes.length - 1 ? 0.5 : 1 }}>
                <ArrowDown size={15} />
              </button>
              <button onClick={() => removeClass(c.id)} style={{ color: PALETTE.inkMuted }}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ gridColumn: "1 / -1" }}>
        <SectionTitle>Assegnazioni — chi insegna cosa, a chi, per quante ore</SectionTitle>
        <p className="text-sm mb-4" style={{ color: PALETTE.inkMuted }}>
          Ogni riga definisce quante ore settimanali un'insegnante deve svolgere per una materia in una sezione.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
          <select value={newAssign.teacherId} onChange={(e) => setNewAssign({ ...newAssign, teacherId: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }}>
            <option value="">Insegnante…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={newAssign.subjectId} onChange={(e) => setNewAssign({ ...newAssign, subjectId: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }}>
            <option value="">Materia…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={newAssign.classId} onChange={(e) => setNewAssign({ ...newAssign, classId: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }}>
            <option value="">Sezione…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <TextInput type="number" min="1" placeholder="Ore/sett." value={newAssign.hours} onChange={(e) => setNewAssign({ ...newAssign, hours: e.target.value })} />
          <SmallButton onClick={addAssignment}><Plus size={15} /> Aggiungi</SmallButton>
        </div>

        {newAssign.teacherId && (() => {
          const remaining = teacherRemainingBudget(newAssign.teacherId);
          const requested = Number(newAssign.hours) || 0;
          const wouldExceed = requested > 0 && requested > remaining;
          return (
            <p className="text-xs mb-4 -mt-2" style={{ color: wouldExceed ? PALETTE.danger : PALETTE.inkMuted, fontWeight: wouldExceed ? 600 : 400 }}>
              {teacherName(newAssign.teacherId)} ha {remaining}h libere sul monte ore
              {wouldExceed ? ` — questa assegnazione la porterebbe ${requested - remaining}h oltre il monte ore.` : "."}
            </p>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {assignments.map((a) => {
            const remMin = remainingMinutes(a);
            const usedMin = usedMinutes(a);
            const pct = Math.min(100, Math.round((usedMin / (a.hours * 60)) * 100));
            return (
              <div key={a.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ fontWeight: 500 }}>{teacherName(a.teacherId)} · {subjectName(a.subjectId)}</div>
                  <div className="text-xs mb-1" style={{ color: PALETTE.inkMuted }}>{className(a.classId)}</div>
                  <div className="h-1.5 rounded-full w-full" style={{ background: PALETTE.border }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: remMin <= 0 ? PALETTE.primary : PALETTE.honey }} />
                  </div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="text-xs" style={{ color: remMin <= 0 ? PALETTE.primary : PALETTE.honey, fontWeight: 600 }}>
                    {remMin <= 0 ? "Completo" : `${formatDuration(remMin)} residue`}
                  </div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{formatDuration(usedMin)}/{a.hours}h</div>
                </div>
                <button onClick={() => removeAssignment(a.id)} className="ml-3" style={{ color: PALETTE.inkMuted }}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function OrarioTab({ classes, selectedClassId, setSelectedClassId, classAssignments, teacherName, subjectName, remainingMinutes, primarySlotAt, coSlotsAt, openCell, classColor, assignmentById }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-3">
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map((c) => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)} className="px-4 py-2 rounded-full text-sm flex items-center gap-2"
              style={{ background: selectedClassId === c.id ? c.color : PALETTE.surface, color: selectedClassId === c.id ? "#fff" : PALETTE.ink, border: `1px solid ${selectedClassId === c.id ? c.color : PALETTE.border}`, fontWeight: 500 }}>
              {c.name}
            </button>
          ))}
        </div>

        <Card style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px repeat(5, minmax(120px, 1fr))", minWidth: 760 }}>
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-sm text-center py-2" style={{ fontWeight: 600, color: PALETTE.inkMuted }}>{d}</div>
            ))}
            {Array.from({ length: MAX_PERIODS }, (_, r) => r).map((r) => (
              <PeriodRow key={r} rowIndex={r} selectedClassId={selectedClassId} primarySlotAt={primarySlotAt} coSlotsAt={coSlotsAt}
                openCell={openCell} teacherName={teacherName} subjectName={subjectName} assignmentById={assignmentById} />
            ))}
          </div>
        </Card>
      </div>

      <div>
        <Card>
          <SectionTitle>Ore residue in questa sezione</SectionTitle>
          {classAssignments.length === 0 && (
            <p className="text-sm" style={{ color: PALETTE.inkMuted }}>Nessuna assegnazione per questa sezione. Aggiungine una nella scheda "Anagrafica".</p>
          )}
          {classAssignments.map((a) => {
            const remMin = remainingMinutes(a);
            return (
              <div key={a.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <div className="text-sm min-w-0">
                  <div style={{ fontWeight: 500 }} className="truncate">{teacherName(a.teacherId)}</div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full shrink-0 ml-2"
                  style={{ background: remMin <= 0 ? PALETTE.primarySoft : PALETTE.honeySoft, color: remMin <= 0 ? PALETTE.primary : PALETTE.honey, fontWeight: 600 }}>
                  {remMin <= 0 ? "Completo" : formatDuration(remMin)}
                </span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function PeriodRow({ rowIndex, selectedClassId, primarySlotAt, coSlotsAt, openCell, teacherName, subjectName, assignmentById }) {
  const refPeriod = REFERENCE_PERIODS[rowIndex];
  return (
    <>
      <div className="text-xs py-3 pr-2 text-right" style={{ color: PALETTE.inkMuted }}>
        {refPeriod ? `${refPeriod.start}–${refPeriod.end}` : ""}
      </div>
      {DAYS.map((_, dayIdx) => {
        const periods = periodsForDay(dayIdx);
        const period = periods[rowIndex];
        if (!period) {
          return <div key={dayIdx} className="m-1 rounded-lg" style={{ minHeight: 56, background: "transparent" }} />;
        }
        const slot = primarySlotAt(dayIdx, rowIndex, selectedClassId);
        const a = slot ? assignmentById(slot.assignmentId) : null;
        const coSlots = coSlotsAt(dayIdx, rowIndex, selectedClassId);
        const isLong = toMinutes(period.end) - toMinutes(period.start) > 60;
        return (
          <button key={dayIdx} onClick={() => openCell(dayIdx, rowIndex)} className="m-1 rounded-lg text-left px-2 py-2 transition-colors"
            style={{ minHeight: 56, background: slot ? PALETTE.primarySoft : "#FCFAF6", border: `1px solid ${slot ? PALETTE.primary : PALETTE.border}`, borderStyle: slot ? "solid" : "dashed" }}>
            {isLong && (
              <div className="text-xs mb-0.5" style={{ color: PALETTE.honey, fontWeight: 600 }}>
                {period.start}–{period.end} · {toMinutes(period.end) - toMinutes(period.start)}min
              </div>
            )}
            {a ? (
              <>
                <div className="text-xs" style={{ fontWeight: 600, color: PALETTE.primary }}>{teacherName(a.teacherId)}</div>
                <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
                {coSlots.map((cs) => {
                  const ca = assignmentById(cs.assignmentId);
                  return (
                    <div key={cs.id} className="text-xs mt-1" style={{ color: PALETTE.honey, fontWeight: 600 }}>
                      + {teacherName(ca?.teacherId)} ({cs.coDurationMinutes}min)
                    </div>
                  );
                })}
              </>
            ) : (
              <span className="text-xs" style={{ color: PALETTE.inkMuted }}>+ assegna</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function CellModal({ modal, onClose, classAssignments, teacherName, subjectName, remainingMinutes, teacherBusyAt, assignPrimary, removeSlot, addCoPresenza, primarySlotAt, coSlotsAt, selectedClassId, assignmentById }) {
  const period = periodsForDay(modal.day)[modal.periodIndex];
  const label = `${DAYS[modal.day]} · ${period.start}–${period.end}`;
  const duration = toMinutes(period.end) - toMinutes(period.start);

  const primarySlot = primarySlotAt(modal.day, modal.periodIndex, selectedClassId);
  const primaryAssignment = primarySlot ? assignmentById(primarySlot.assignmentId) : null;
  const coSlots = coSlotsAt(modal.day, modal.periodIndex, selectedClassId);

  const [coTeacherId, setCoTeacherId] = useState("");
  const [coOffset, setCoOffset] = useState("0");
  const [coDuration, setCoDuration] = useState("20");

  if (!primarySlot) {
    const options = classAssignments;
    return (
      <ModalShell onClose={onClose} title={label}>
        <p className="text-sm mb-3" style={{ color: PALETTE.inkMuted }}>Scegli chi assegnare a questo periodo ({duration} minuti).</p>
        {options.length === 0 && (
          <p className="text-sm" style={{ color: PALETTE.inkMuted }}>Nessuna assegnazione per questa sezione. Vai su "Anagrafica" → "Assegnazioni".</p>
        )}
        <div className="space-y-2">
          {options.map((a) => {
            const busy = teacherBusyAt(a.teacherId, modal.day, modal.periodIndex);
            const remMin = remainingMinutes(a);
            const disabled = busy || remMin <= 0;
            return (
              <button key={a.id} disabled={disabled} onClick={() => assignPrimary(a.id)} className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left"
                style={{ border: `1px solid ${busy ? PALETTE.dangerSoft : PALETTE.border}`, background: busy ? PALETTE.dangerSoft : remMin <= 0 ? "#F5F3EE" : "#fff", opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
                <div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{teacherName(a.teacherId)}</div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)} · {remMin > 0 ? `${formatDuration(remMin)} residue` : "completo"}</div>
                </div>
                {busy && <span className="flex items-center gap-1 text-xs shrink-0 ml-2" style={{ color: PALETTE.danger }}><AlertTriangle size={13} /> occupata</span>}
              </button>
            );
          })}
        </div>
      </ModalShell>
    );
  }

  const coOptions = classAssignments.filter((a) => a.id !== primaryAssignment.id);
  const submitCo = () => {
    const off = Number(coOffset);
    const dur = Number(coDuration);
    if (!coTeacherId || dur <= 0 || off < 0 || off + dur > duration) return;
    addCoPresenza(coTeacherId, off, dur);
    setCoTeacherId("");
  };

  return (
    <ModalShell onClose={onClose} title={label}>
      <div className="mb-4">
        <div className="text-sm" style={{ fontWeight: 600 }}>{teacherName(primaryAssignment.teacherId)}</div>
        <div className="text-sm mb-2" style={{ color: PALETTE.inkMuted }}>{subjectName(primaryAssignment.subjectId)}</div>
        <SmallButton tone="danger" onClick={() => removeSlot(primarySlot.id)}><X size={15} /> Rimuovi da questo orario</SmallButton>
      </div>

      {coSlots.length > 0 && (
        <div className="mb-4">
          <div className="text-xs mb-2" style={{ color: PALETTE.inkMuted, fontWeight: 600 }}>Compresenza in questo periodo</div>
          {coSlots.map((cs) => {
            const ca = assignmentById(cs.assignmentId);
            return (
              <div key={cs.id} className="flex items-center justify-between py-1.5">
                <span className="text-xs">{teacherName(ca?.teacherId)} · {cs.coOffsetMinutes}–{cs.coOffsetMinutes + cs.coDurationMinutes}min</span>
                <button onClick={() => removeSlot(cs.id)} style={{ color: PALETTE.inkMuted }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-3" style={{ borderTop: `1px solid ${PALETTE.border}` }}>
        <div className="flex items-center gap-2 mb-2">
          <UserPlus size={14} style={{ color: PALETTE.inkMuted }} />
          <span className="text-xs" style={{ color: PALETTE.inkMuted, fontWeight: 600 }}>Aggiungi compresenza (periodo di {duration} minuti)</span>
        </div>
        <select value={coTeacherId} onChange={(e) => setCoTeacherId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm mb-2" style={{ border: `1px solid ${PALETTE.border}` }}>
          <option value="">Seconda insegnante…</option>
          {coOptions.map((a) => <option key={a.id} value={a.id}>{teacherName(a.teacherId)} · {subjectName(a.subjectId)}</option>)}
        </select>
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="text-xs" style={{ color: PALETTE.inkMuted }}>Minuto iniziale</label>
            <input type="number" min="0" max={duration} value={coOffset} onChange={(e) => setCoOffset(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }} />
          </div>
          <div className="flex-1">
            <label className="text-xs" style={{ color: PALETTE.inkMuted }}>Durata (min)</label>
            <input type="number" min="1" max={duration} value={coDuration} onChange={(e) => setCoDuration(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }} />
          </div>
        </div>
        <SmallButton tone="honey" onClick={submitCo}><Plus size={15} /> Aggiungi</SmallButton>
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(42,38,32,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl p-5 w-full max-w-sm" style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="heading text-lg" style={{ fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ color: PALETTE.inkMuted }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InsegnanteTab({ teachers, selectedTeacherId, setSelectedTeacherId, teacherSlots, subjectName, className, classColor, classes, classAssignmentsFor, remainingMinutes, primarySlotAt, coSlotsAt, assignmentById, teacherName }) {
  const [mode, setMode] = useState("teacher"); // 'teacher' | 'all'
  const [viewClassId, setViewClassId] = useState(classes[0]?.id || null);

  useEffect(() => {
    if (!viewClassId && classes.length > 0) setViewClassId(classes[0].id);
  }, [classes, viewClassId]);

  if (teachers.length === 0) {
    return <Card><p className="text-sm" style={{ color: PALETTE.inkMuted }}>Nessuna insegnante ancora registrata.</p></Card>;
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 rounded-full p-1 w-fit" style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}` }}>
        <button onClick={() => setMode("teacher")} className="px-4 py-2 rounded-full text-sm" style={{ background: mode === "teacher" ? PALETTE.primary : "transparent", color: mode === "teacher" ? "#fff" : PALETTE.inkMuted, fontWeight: 500 }}>
          Per insegnante
        </button>
        <button onClick={() => setMode("all")} className="px-4 py-2 rounded-full text-sm" style={{ background: mode === "all" ? PALETTE.primary : "transparent", color: mode === "all" ? "#fff" : PALETTE.inkMuted, fontWeight: 500 }}>
          Vista completa · tutte le classi
        </button>
      </div>

      {mode === "teacher" ? (
        <TeacherGrid teachers={teachers} selectedTeacherId={selectedTeacherId} setSelectedTeacherId={setSelectedTeacherId} teacherSlots={teacherSlots} subjectName={subjectName} className={className} classColor={classColor} />
      ) : (
        <FullScheduleView classes={classes} viewClassId={viewClassId} setViewClassId={setViewClassId} classAssignmentsFor={classAssignmentsFor}
          remainingMinutes={remainingMinutes} primarySlotAt={primarySlotAt} coSlotsAt={coSlotsAt} assignmentById={assignmentById}
          teacherName={teacherName} subjectName={subjectName} />
      )}
    </div>
  );
}

function TeacherGrid({ teachers, selectedTeacherId, setSelectedTeacherId, teacherSlots, subjectName, className, classColor }) {
  const slots = teacherSlots(selectedTeacherId);
  const findPrimary = (day, periodIndex) => slots.find((s) => !s.isCo && s.day === day && s.periodIndex === periodIndex);
  const findCo = (day, periodIndex) => slots.filter((s) => s.isCo && s.day === day && s.periodIndex === periodIndex);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-1">
        <Card>
          <SectionTitle>Insegnante</SectionTitle>
          <select value={selectedTeacherId || ""} onChange={(e) => setSelectedTeacherId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${PALETTE.border}` }}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="text-xs mt-3" style={{ color: PALETTE.inkMuted }}>Vista di sola consultazione.</p>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px repeat(5, minmax(130px, 1fr))", minWidth: 760 }}>
            <div />
            {DAYS.map((d) => <div key={d} className="text-sm text-center py-2" style={{ fontWeight: 600, color: PALETTE.inkMuted }}>{d}</div>)}
            {Array.from({ length: MAX_PERIODS }, (_, r) => r).map((r) => {
              const refPeriod = REFERENCE_PERIODS[r];
              return (
                <Fragment key={r}>
                  <div className="text-xs py-3 pr-2 text-right" style={{ color: PALETTE.inkMuted }}>{refPeriod ? `${refPeriod.start}–${refPeriod.end}` : ""}</div>
                  {DAYS.map((_, dayIdx) => {
                    const periods = periodsForDay(dayIdx);
                    const period = periods[r];
                    if (!period) return <div key={dayIdx} className="m-1 rounded-lg" style={{ minHeight: 56 }} />;
                    const primary = findPrimary(dayIdx, r);
                    const co = findCo(dayIdx, r);
                    const color = primary ? classColor(primary.assignment.classId) : null;
                    const isLong = toMinutes(period.end) - toMinutes(period.start) > 60;
                    return (
                      <div key={dayIdx} className="m-1 rounded-lg px-2 py-2"
                        style={{ minHeight: 56, background: primary ? `${color}1A` : "#FCFAF6", border: `1px solid ${primary ? color : PALETTE.border}`, borderStyle: primary ? "solid" : "dashed" }}>
                        {isLong && <div className="text-xs mb-0.5" style={{ color: PALETTE.honey, fontWeight: 600 }}>{period.start}–{period.end}</div>}
                        {primary ? (
                          <>
                            <div className="text-xs" style={{ fontWeight: 600, color }}>{subjectName(primary.assignment.subjectId)}</div>
                            <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{className(primary.assignment.classId)}</div>
                          </>
                        ) : co.length === 0 ? (
                          <span className="text-xs" style={{ color: PALETTE.inkMuted }}>—</span>
                        ) : null}
                        {co.map((cs) => (
                          <div key={cs.id} className="text-xs mt-1" style={{ color: PALETTE.honey, fontWeight: 600 }}>
                            compresenza: {subjectName(cs.assignment.subjectId)} · {className(cs.assignment.classId)} ({cs.coDurationMinutes}min)
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function FullScheduleView({ classes, viewClassId, setViewClassId, classAssignmentsFor, remainingMinutes, primarySlotAt, coSlotsAt, assignmentById, teacherName, subjectName }) {
  if (classes.length === 0) {
    return <Card><p className="text-sm" style={{ color: PALETTE.inkMuted }}>Nessuna classe ancora registrata.</p></Card>;
  }
  const classAssignments = classAssignmentsFor(viewClassId);
  const incomplete = classAssignments.filter((a) => remainingMinutes(a) > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-3">
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map((c) => (
            <button key={c.id} onClick={() => setViewClassId(c.id)} className="px-4 py-2 rounded-full text-sm flex items-center gap-2"
              style={{ background: viewClassId === c.id ? c.color : PALETTE.surface, color: viewClassId === c.id ? "#fff" : PALETTE.ink, border: `1px solid ${viewClassId === c.id ? c.color : PALETTE.border}`, fontWeight: 500 }}>
              {c.name}
            </button>
          ))}
        </div>
        <Card style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px repeat(5, minmax(120px, 1fr))", minWidth: 760 }}>
            <div />
            {DAYS.map((d) => <div key={d} className="text-sm text-center py-2" style={{ fontWeight: 600, color: PALETTE.inkMuted }}>{d}</div>)}
            {Array.from({ length: MAX_PERIODS }, (_, r) => r).map((r) => {
              const refPeriod = REFERENCE_PERIODS[r];
              return (
                <Fragment key={r}>
                  <div className="text-xs py-3 pr-2 text-right" style={{ color: PALETTE.inkMuted }}>{refPeriod ? `${refPeriod.start}–${refPeriod.end}` : ""}</div>
                  {DAYS.map((_, dayIdx) => {
                    const periods = periodsForDay(dayIdx);
                    const period = periods[r];
                    if (!period) return <div key={dayIdx} className="m-1 rounded-lg" style={{ minHeight: 56 }} />;
                    const slot = primarySlotAt(dayIdx, r, viewClassId);
                    const a = slot ? assignmentById(slot.assignmentId) : null;
                    const co = coSlotsAt(dayIdx, r, viewClassId);
                    const isLong = toMinutes(period.end) - toMinutes(period.start) > 60;
                    return (
                      <div key={dayIdx} className="m-1 rounded-lg px-2 py-2"
                        style={{ minHeight: 56, background: a ? PALETTE.primarySoft : PALETTE.dangerSoft, border: `1px solid ${a ? PALETTE.primary : PALETTE.danger}`, borderStyle: a ? "solid" : "dashed" }}>
                        {isLong && <div className="text-xs mb-0.5" style={{ color: PALETTE.honey, fontWeight: 600 }}>{period.start}–{period.end}</div>}
                        {a ? (
                          <>
                            <div className="text-xs" style={{ fontWeight: 600, color: PALETTE.primary }}>{teacherName(a.teacherId)}</div>
                            <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
                            {co.map((cs) => {
                              const ca = assignmentById(cs.assignmentId);
                              return (
                                <div key={cs.id} className="text-xs mt-1" style={{ color: PALETTE.honey, fontWeight: 600 }}>
                                  + {teacherName(ca?.teacherId)} ({cs.coDurationMinutes}min)
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <span className="text-xs" style={{ color: PALETTE.danger, fontWeight: 600 }}>vuoto</span>
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        <Card>
          <SectionTitle>Ore non ancora assegnate</SectionTitle>
          <p className="text-xs mb-3" style={{ color: PALETTE.inkMuted }}>
            Celle rosse in griglia = periodo senza insegnante assegnata. Qui sotto, quali assegnazioni hanno ancora ore da collocare.
          </p>
          {incomplete.length === 0 ? (
            <p className="text-sm" style={{ color: PALETTE.primary, fontWeight: 600 }}>Tutte le ore di questa classe sono state assegnate.</p>
          ) : (
            incomplete.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <div className="text-sm min-w-0">
                  <div style={{ fontWeight: 500 }} className="truncate">{teacherName(a.teacherId)}</div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full shrink-0 ml-2" style={{ background: PALETTE.honeySoft, color: PALETTE.honey, fontWeight: 600 }}>
                  {formatDuration(remainingMinutes(a))}
                </span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
