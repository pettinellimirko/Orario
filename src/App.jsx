import { useState, useEffect, Fragment } from "react";
import { Plus, X, Trash2, AlertTriangle, Eye, LayoutGrid, Users, LogOut, Lock } from "lucide-react";
import { supabase, supabaseConfigured } from "./supabaseClient";

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];
const HOURS = Array.from({ length: 8 }, (_, i) => ({
  index: i,
  label: `${8 + i}:00–${9 + i}:00`,
}));

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
  const [modal, setModal] = useState(null); // { day, hour, mode: 'assign'|'remove', slotId? }

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
      supabase.from("classes").select("*").order("name"),
      supabase.from("assignments").select("*"),
      supabase.from("slots").select("*"),
    ]);
    setTeachers((teachersRes.data || []).map((t) => ({ id: t.id, name: t.name, totalHours: t.total_hours })));
    setSubjects((subjectsRes.data || []).map((s) => ({ id: s.id, name: s.name })));
    setClasses((classesRes.data || []).map((c) => ({ id: c.id, name: c.name, color: c.color })));
    setAssignments(
      (assignmentsRes.data || []).map((a) => ({
        id: a.id,
        teacherId: a.teacher_id,
        subjectId: a.subject_id,
        classId: a.class_id,
        hours: a.hours,
      }))
    );
    setSlots((slotsRes.data || []).map((s) => ({ id: s.id, day: s.day, hour: s.hour, assignmentId: s.assignment_id })));
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

  const usedHours = (assignmentId) => slots.filter((s) => s.assignmentId === assignmentId).length;
  const remainingHours = (assignment) => assignment.hours - usedHours(assignment.id);

  const teacherAssignedHours = (teacherId) =>
    assignments.filter((a) => a.teacherId === teacherId).reduce((sum, a) => sum + a.hours, 0);
  const teacherRemainingBudget = (teacherId) => {
    const t = teachers.find((tt) => tt.id === teacherId);
    return t ? t.totalHours - teacherAssignedHours(teacherId) : 0;
  };

  const slotAt = (day, hour, classId) =>
    slots.find((s) => {
      const a = assignmentById(s.assignmentId);
      return s.day === day && s.hour === hour && a && a.classId === classId;
    });

  const teacherBusyAt = (teacherId, day, hour, excludeSlotId) =>
    slots.some(
      (s) =>
        s.id !== excludeSlotId &&
        s.day === day &&
        s.hour === hour &&
        teacherOfAssignment(s.assignmentId) === teacherId
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

  const openCell = (day, hour) => {
    const existing = slotAt(day, hour, selectedClassId);
    if (existing) setModal({ mode: "remove", day, hour, slotId: existing.id });
    else setModal({ mode: "assign", day, hour });
  };
  const assignTo = async (assignmentId) => {
    const { error } = await supabase
      .from("slots")
      .insert({ day: modal.day, hour: modal.hour, assignment_id: assignmentId });
    if (error) return alert("Errore: " + error.message);
    setModal(null);
    await fetchAll();
  };
  const unassign = async () => {
    const { error } = await supabase.from("slots").delete().eq("id", modal.slotId);
    if (error) return alert("Errore: " + error.message);
    setModal(null);
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
        {/* Header */}
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
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex items-center gap-1 underline"
                style={{ color: PALETTE.inkMuted }}
              >
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
                  teachers={teachers}
                  subjects={subjects}
                  classes={classes}
                  assignments={assignments}
                  newTeacherName={newTeacherName}
                  setNewTeacherName={setNewTeacherName}
                  newTeacherHours={newTeacherHours}
                  setNewTeacherHours={setNewTeacherHours}
                  addTeacher={addTeacher}
                  removeTeacher={removeTeacher}
                  updateTeacherHours={updateTeacherHours}
                  teacherAssignedHours={teacherAssignedHours}
                  teacherRemainingBudget={teacherRemainingBudget}
                  newSubjectName={newSubjectName}
                  setNewSubjectName={setNewSubjectName}
                  addSubject={addSubject}
                  removeSubject={removeSubject}
                  newClassName={newClassName}
                  setNewClassName={setNewClassName}
                  addClass={addClass}
                  removeClass={removeClass}
                  newAssign={newAssign}
                  setNewAssign={setNewAssign}
                  addAssignment={addAssignment}
                  removeAssignment={removeAssignment}
                  teacherName={teacherName}
                  subjectName={subjectName}
                  className={className}
                  remainingHours={remainingHours}
                  usedHours={usedHours}
                />
              ) : (
                <LoginGate authLoading={authLoading} />
              ))}

            {tab === "orario" &&
              (session ? (
                <OrarioTab
                  classes={classes}
                  selectedClassId={selectedClassId}
                  setSelectedClassId={setSelectedClassId}
                  classAssignments={classAssignments}
                  teacherName={teacherName}
                  subjectName={subjectName}
                  remainingHours={remainingHours}
                  usedHours={usedHours}
                  slotAt={slotAt}
                  openCell={openCell}
                  classColor={classColor}
                  assignmentById={assignmentById}
                />
              ) : (
                <LoginGate authLoading={authLoading} />
              ))}

            {tab === "insegnante" && (
              <InsegnanteTab
                teachers={teachers}
                selectedTeacherId={selectedTeacherId}
                setSelectedTeacherId={setSelectedTeacherId}
                teacherSlots={teacherSlots}
                subjectName={subjectName}
                className={className}
                classColor={classColor}
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
          remainingHours={remainingHours}
          teacherBusyAt={teacherBusyAt}
          assignTo={assignTo}
          unassign={unassign}
          slotAt={slotAt}
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
          Aggiungile in un file <code>.env.local</code> in locale, oppure nelle "Environment Variables" del progetto su Vercel, poi ricarica.
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
        <TextInput
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <TextInput
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      {error && <p className="text-xs mb-3" style={{ color: PALETTE.danger }}>{error}</p>}
      <SmallButton onClick={submit}>{loading ? "Accesso in corso…" : "Accedi"}</SmallButton>
    </Card>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-colors"
      style={{
        background: active ? PALETTE.primary : "transparent",
        color: active ? "#fff" : PALETTE.inkMuted,
        fontWeight: 500,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="heading text-lg mb-3" style={{ fontWeight: 600 }}>
      {children}
    </h2>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
      style={{ border: `1px solid ${PALETTE.border}`, background: "#fff" }}
    />
  );
}

function SmallButton({ onClick, children, tone = "primary" }) {
  const bg = tone === "primary" ? PALETTE.primary : tone === "danger" ? PALETTE.danger : PALETTE.honey;
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm text-white shrink-0"
      style={{ background: bg, fontWeight: 500 }}
    >
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
      <button onClick={onRemove} style={{ color: PALETTE.inkMuted }} className="p-1 hover:opacity-70">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ConfigTab(props) {
  const {
    teachers, subjects, classes, assignments,
    newTeacherName, setNewTeacherName, newTeacherHours, setNewTeacherHours, addTeacher, removeTeacher,
    updateTeacherHours, teacherAssignedHours, teacherRemainingBudget,
    newSubjectName, setNewSubjectName, addSubject, removeSubject,
    newClassName, setNewClassName, addClass, removeClass,
    newAssign, setNewAssign, addAssignment, removeAssignment,
    teacherName, subjectName, className, remainingHours, usedHours,
  } = props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <Card>
        <SectionTitle>Insegnanti</SectionTitle>
        <p className="text-xs mb-3" style={{ color: PALETTE.inkMuted }}>
          Le ore totali sono il monte ore settimanale contrattuale: quante ore, in tutto, l'insegnante può insegnare tra tutte le materie e classi.
        </p>
        <div className="flex gap-2 mb-3">
          <TextInput
            placeholder="Nome e cognome"
            value={newTeacherName}
            onChange={(e) => setNewTeacherName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTeacher()}
          />
          <input
            type="number"
            min="0"
            placeholder="Ore tot."
            value={newTeacherHours}
            onChange={(e) => setNewTeacherHours(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTeacher()}
            className="w-24 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: `1px solid ${PALETTE.border}` }}
          />
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
                  <input
                    type="number"
                    min="0"
                    defaultValue={t.totalHours}
                    key={`${t.id}-${t.totalHours}`}
                    onBlur={(e) => {
                      if (Number(e.target.value) !== t.totalHours) updateTeacherHours(t.id, e.target.value);
                    }}
                    className="w-16 rounded-md px-2 py-1 text-xs text-right outline-none"
                    style={{ border: `1px solid ${PALETTE.border}` }}
                  />
                  <span className="text-xs" style={{ color: PALETTE.inkMuted }}>h tot.</span>
                  <button onClick={() => removeTeacher(t.id)} style={{ color: PALETTE.inkMuted }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="h-1.5 rounded-full w-full mb-1" style={{ background: PALETTE.border }}>
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${pct}%`, background: over ? PALETTE.danger : PALETTE.primary }}
                />
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
          <TextInput
            placeholder="Es. Musica"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubject()}
          />
          <SmallButton onClick={addSubject}><Plus size={15} /></SmallButton>
        </div>
        {subjects.map((s) => (
          <ListRow key={s.id} label={s.name} onRemove={() => removeSubject(s.id)} />
        ))}
      </Card>

      <Card>
        <SectionTitle>Classi / sezioni</SectionTitle>
        <div className="flex gap-2 mb-3">
          <TextInput
            placeholder="Es. Sezione Rossa"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
          />
          <SmallButton onClick={addClass}><Plus size={15} /></SmallButton>
        </div>
        {classes.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              <span className="text-sm" style={{ fontWeight: 500 }}>{c.name}</span>
            </div>
            <button onClick={() => removeClass(c.id)} style={{ color: PALETTE.inkMuted }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </Card>

      <Card style={{ gridColumn: "1 / -1" }}>
        <SectionTitle>Assegnazioni — chi insegna cosa, a chi, per quante ore</SectionTitle>
        <p className="text-sm mb-4" style={{ color: PALETTE.inkMuted }}>
          Ogni riga qui sotto definisce quante ore settimanali un'insegnante deve svolgere per una materia in una
          sezione. Nella scheda "Costruisci orario" queste ore vengono poi posizionate nella griglia giorno/ora.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
          <select
            value={newAssign.teacherId}
            onChange={(e) => setNewAssign({ ...newAssign, teacherId: e.target.value })}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <option value="">Insegnante…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={newAssign.subjectId}
            onChange={(e) => setNewAssign({ ...newAssign, subjectId: e.target.value })}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <option value="">Materia…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={newAssign.classId}
            onChange={(e) => setNewAssign({ ...newAssign, classId: e.target.value })}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            <option value="">Sezione…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <TextInput
            type="number"
            min="1"
            placeholder="Ore/sett."
            value={newAssign.hours}
            onChange={(e) => setNewAssign({ ...newAssign, hours: e.target.value })}
          />
          <SmallButton onClick={addAssignment}>
            <Plus size={15} /> Aggiungi
          </SmallButton>
        </div>

        {newAssign.teacherId && (() => {
          const remaining = teacherRemainingBudget(newAssign.teacherId);
          const requested = Number(newAssign.hours) || 0;
          const wouldExceed = requested > 0 && requested > remaining;
          return (
            <p
              className="text-xs mb-4 -mt-2"
              style={{ color: wouldExceed ? PALETTE.danger : PALETTE.inkMuted, fontWeight: wouldExceed ? 600 : 400 }}
            >
              {teacherName(newAssign.teacherId)} ha {remaining}h libere sul monte ore
              {wouldExceed ? ` — questa assegnazione la porterebbe ${requested - remaining}h oltre il monte ore.` : "."}
            </p>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {assignments.map((a) => {
            const rem = remainingHours(a);
            const used = usedHours(a);
            const pct = Math.min(100, Math.round((used / a.hours) * 100));
            return (
              <div key={a.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ fontWeight: 500 }}>
                    {teacherName(a.teacherId)} · {subjectName(a.subjectId)}
                  </div>
                  <div className="text-xs mb-1" style={{ color: PALETTE.inkMuted }}>{className(a.classId)}</div>
                  <div className="h-1.5 rounded-full w-full" style={{ background: PALETTE.border }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: rem === 0 ? PALETTE.primary : PALETTE.honey }} />
                  </div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="text-xs" style={{ color: rem === 0 ? PALETTE.primary : PALETTE.honey, fontWeight: 600 }}>
                    {rem === 0 ? "Completo" : `${rem}h residue`}
                  </div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{used}/{a.hours}h</div>
                </div>
                <button onClick={() => removeAssignment(a.id)} className="ml-3" style={{ color: PALETTE.inkMuted }}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function OrarioTab({ classes, selectedClassId, setSelectedClassId, classAssignments, teacherName, subjectName, remainingHours, usedHours, slotAt, openCell, classColor, assignmentById }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-3">
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              className="px-4 py-2 rounded-full text-sm flex items-center gap-2"
              style={{
                background: selectedClassId === c.id ? c.color : PALETTE.surface,
                color: selectedClassId === c.id ? "#fff" : PALETTE.ink,
                border: `1px solid ${selectedClassId === c.id ? c.color : PALETTE.border}`,
                fontWeight: 500,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <Card style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px repeat(5, minmax(120px, 1fr))", minWidth: 700 }}>
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-sm text-center py-2" style={{ fontWeight: 600, color: PALETTE.inkMuted }}>
                {d}
              </div>
            ))}
            {HOURS.map((h) => (
              <RowCells key={h.index} hour={h} selectedClassId={selectedClassId} slotAt={slotAt} openCell={openCell} teacherName={teacherName} subjectName={subjectName} assignmentById={assignmentById} />
            ))}
          </div>
        </Card>
      </div>

      <div>
        <Card>
          <SectionTitle>Ore residue in questa sezione</SectionTitle>
          {classAssignments.length === 0 && (
            <p className="text-sm" style={{ color: PALETTE.inkMuted }}>
              Nessuna assegnazione per questa sezione. Aggiungine una nella scheda "Anagrafica".
            </p>
          )}
          {classAssignments.map((a) => {
            const rem = remainingHours(a);
            return (
              <div key={a.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <div className="text-sm min-w-0">
                  <div style={{ fontWeight: 500 }} className="truncate">{teacherName(a.teacherId)}</div>
                  <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-full shrink-0 ml-2"
                  style={{
                    background: rem === 0 ? PALETTE.primarySoft : PALETTE.honeySoft,
                    color: rem === 0 ? PALETTE.primary : PALETTE.honey,
                    fontWeight: 600,
                  }}
                >
                  {rem === 0 ? "Completo" : `${rem}h`}
                </span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function RowCells({ hour, selectedClassId, slotAt, openCell, teacherName, subjectName, assignmentById }) {
  return (
    <>
      <div className="text-xs py-3 pr-2 text-right" style={{ color: PALETTE.inkMuted }}>{hour.label}</div>
      {DAYS.map((_, dayIdx) => {
        const slot = slotAt(dayIdx, hour.index, selectedClassId);
        const a = slot ? assignmentById(slot.assignmentId) : null;
        return (
          <button
            key={dayIdx}
            onClick={() => openCell(dayIdx, hour.index)}
            className="m-1 rounded-lg text-left px-2 py-2 transition-colors"
            style={{
              minHeight: 52,
              background: slot ? PALETTE.primarySoft : "#FCFAF6",
              border: `1px solid ${slot ? PALETTE.primary : PALETTE.border}`,
              borderStyle: slot ? "solid" : "dashed",
            }}
          >
            {a ? (
              <>
                <div className="text-xs" style={{ fontWeight: 600, color: PALETTE.primary }}>
                  {teacherName(a.teacherId)}
                </div>
                <div className="text-xs" style={{ color: PALETTE.inkMuted }}>
                  {subjectName(a.subjectId)}
                </div>
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

function CellModal({ modal, onClose, classAssignments, teacherName, subjectName, remainingHours, teacherBusyAt, assignTo, unassign, slotAt, selectedClassId, assignmentById }) {
  const label = `${DAYS[modal.day]} · ${HOURS[modal.hour].label}`;

  if (modal.mode === "remove") {
    const slot = slotAt(modal.day, modal.hour, selectedClassId);
    const a = slot ? assignmentById(slot.assignmentId) : null;
    return (
      <ModalShell onClose={onClose} title={label}>
        {a && (
          <div className="mb-4">
            <div className="text-sm" style={{ fontWeight: 600 }}>{teacherName(a.teacherId)}</div>
            <div className="text-sm" style={{ color: PALETTE.inkMuted }}>{subjectName(a.subjectId)}</div>
          </div>
        )}
        <SmallButton tone="danger" onClick={unassign}>
          <X size={15} /> Rimuovi da questo orario
        </SmallButton>
      </ModalShell>
    );
  }

  const options = classAssignments;

  return (
    <ModalShell onClose={onClose} title={label}>
      <p className="text-sm mb-3" style={{ color: PALETTE.inkMuted }}>
        Scegli chi assegnare a questo orario.
      </p>
      {options.length === 0 && (
        <p className="text-sm" style={{ color: PALETTE.inkMuted }}>
          Per questa sezione non è ancora stata creata nessuna assegnazione. Vai su "Anagrafica" → "Assegnazioni" e aggiungine una prima di tornare qui.
        </p>
      )}
      <div className="space-y-2">
        {options.map((a) => {
          const busy = teacherBusyAt(a.teacherId, modal.day, modal.hour);
          const rem = remainingHours(a);
          const disabled = busy || rem <= 0;
          return (
            <button
              key={a.id}
              disabled={disabled}
              onClick={() => assignTo(a.id)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left"
              style={{
                border: `1px solid ${busy ? PALETTE.dangerSoft : PALETTE.border}`,
                background: busy ? PALETTE.dangerSoft : rem <= 0 ? "#F5F3EE" : "#fff",
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              <div>
                <div className="text-sm" style={{ fontWeight: 500 }}>{teacherName(a.teacherId)}</div>
                <div className="text-xs" style={{ color: PALETTE.inkMuted }}>
                  {subjectName(a.subjectId)} · {rem > 0 ? `${rem}h residue` : "completo"}
                </div>
              </div>
              {busy && (
                <span className="flex items-center gap-1 text-xs shrink-0 ml-2" style={{ color: PALETTE.danger }}>
                  <AlertTriangle size={13} /> occupata
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: "rgba(42,38,32,0.35)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl p-5 w-full max-w-sm"
        style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="heading text-lg" style={{ fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ color: PALETTE.inkMuted }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InsegnanteTab({ teachers, selectedTeacherId, setSelectedTeacherId, teacherSlots, subjectName, className, classColor }) {
  if (teachers.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: PALETTE.inkMuted }}>
          Nessuna insegnante ancora registrata. La direzione può aggiungerle da "Anagrafica".
        </p>
      </Card>
    );
  }

  const slots = teacherSlots(selectedTeacherId);
  const findSlot = (day, hour) => slots.find((s) => s.day === day && s.hour === hour);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-1">
        <Card>
          <SectionTitle>Insegnante</SectionTitle>
          <select
            value={selectedTeacherId || ""}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ border: `1px solid ${PALETTE.border}` }}
          >
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="text-xs mt-3" style={{ color: PALETTE.inkMuted }}>
            Vista di sola consultazione — l'orario visualizzato qui non può essere modificato.
          </p>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px repeat(5, minmax(130px, 1fr))", minWidth: 700 }}>
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-sm text-center py-2" style={{ fontWeight: 600, color: PALETTE.inkMuted }}>
                {d}
              </div>
            ))}
            {HOURS.map((h) => (
              <Fragment key={h.index}>
                <div className="text-xs py-3 pr-2 text-right" style={{ color: PALETTE.inkMuted }}>{h.label}</div>
                {DAYS.map((_, dayIdx) => {
                  const s = findSlot(dayIdx, h.index);
                  const color = s ? classColor(s.assignment.classId) : null;
                  return (
                    <div
                      key={dayIdx}
                      className="m-1 rounded-lg px-2 py-2"
                      style={{
                        minHeight: 52,
                        background: s ? `${color}1A` : "#FCFAF6",
                        border: `1px solid ${s ? color : PALETTE.border}`,
                        borderStyle: s ? "solid" : "dashed",
                      }}
                    >
                      {s ? (
                        <>
                          <div className="text-xs" style={{ fontWeight: 600, color }}>{subjectName(s.assignment.subjectId)}</div>
                          <div className="text-xs" style={{ color: PALETTE.inkMuted }}>{className(s.assignment.classId)}</div>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: PALETTE.inkMuted }}>—</span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
