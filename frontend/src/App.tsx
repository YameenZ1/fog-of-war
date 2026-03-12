import { useCallback, useEffect, useRef, useState } from 'react';

/* ── Types ────────────────────────────────────────────────── */
type Stage = 'briefing' | 'gathering' | 'assessment';
type AssessPhase = 0 | 1 | 2 | 3; // initial-contact → stats → narrative → aftermath

interface ScoreBreakdown {
  tactical_genius?: { commander1: number; commander2: number };
  army_size?: { commander1: number; commander2: number };
  tech_level?: { commander1: number; commander2: number };
  terrain_adaptability?: { commander1: number; commander2: number };
  supply_chain?: { commander1: number; commander2: number };
  morale?: { commander1: number; commander2: number };
}

interface InitialDeployment {
  description: string;
  commander1_formation: string;
  commander2_formation: string;
  terrain_advantage: string;
}

interface Aftermath {
  description: string;
  commander1_casualties: string;
  commander2_casualties: string;
  strategic_consequence: string;
  historical_significance: string;
}

interface Verdict {
  winner: string | null;
  confidence_percentage: number | null;
  commander1_score: number | null;
  commander2_score: number | null;
  initial_deployment: InitialDeployment;
  score_breakdown: ScoreBreakdown;
  narrative: string;
  aftermath: Aftermath;
  fun_fact: string;
}

interface AnalyzeResponse {
  verdict: Verdict;
  thinking_trace: unknown[];
}

/* ── Constants ────────────────────────────────────────────── */
const STATUS_MESSAGES = [
  '>> ACCESSING TACTICAL DATABASE...',
  '>> RETRIEVING INTELLIGENCE ON: ',
  '>> RETRIEVING INTELLIGENCE ON: ',
  '>> ANALYZING ERA TECHNOLOGY DIFFERENTIAL...',
  '>> CROSS-REFERENCING BATTLE RECORDS...',
  '>> RUNNING COMBAT SIMULATION...',
  '>> CALCULATING PROBABILITY MATRICES...',
  '>> COMPILING FINAL ASSESSMENT...',
];

const BREAKDOWN_KEYS = [
  'tactical_genius',
  'army_size',
  'tech_level',
  'terrain_adaptability',
  'supply_chain',
  'morale',
] as const;

/* ── Font injection ───────────────────────────────────────── */
function useShareTechMono() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap';
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

/* ── Suggestions types ────────────────────────────────────── */
interface Suggestions {
  theaters: string[];
  forces: string[];
}

/* ── Suggestion chips ─────────────────────────────────────── */
function SuggestionChips({
  chips,
  onSelect,
  loading,
  exclude,
}: {
  chips: string[];
  onSelect: (v: string) => void;
  loading: boolean;
  exclude?: string;
}) {
  if (loading) {
    return (
      <p className="text-phosphor/30 text-xs mt-1 mb-3 tracking-wider">
        &gt;&gt; GENERATING SCENARIO OPTIONS...
      </p>
    );
  }
  if (!chips.length) return null;
  const visible = exclude
    ? chips.filter((c) => c.toLowerCase() !== exclude.toLowerCase())
    : chips;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 mb-3">
      {visible.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="text-xs font-terminal border border-dashed border-phosphor/35 text-phosphor/55
            hover:text-phosphor hover:border-phosphor/75 hover:bg-phosphor/5
            px-2 py-0.5 rounded transition-all"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

/* ── Plain text input ─────────────────────────────────────── */
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string | null;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <label className="block font-terminal text-phosphor text-sm mb-1 tracking-wider">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-war-bg border border-dashed border-phosphor/70 text-phosphor font-terminal px-3 py-2 rounded focus:outline-none focus:shadow-glow placeholder-phosphor/30 disabled:opacity-50"
      />
      {children}
      {error && (
        <p className="mt-1 font-terminal text-terminal-red text-sm">{error}</p>
      )}
    </div>
  );
}

/* ── Score bar ────────────────────────────────────────────── */
function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-phosphor/80 mb-0.5">
        <span className="uppercase tracking-wider">{label.replace(/_/g, ' ')}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 bg-war-bg border border-phosphor/30 rounded overflow-hidden">
        <div
          className="h-full bg-phosphor/80 transition-all duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/* ── Section header ───────────────────────────────────────── */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-amber text-xs tracking-widest">{children}</p>
      <div className="text-phosphor/30 text-sm mt-1">
        ────────────────────────────────────────────────────────────
      </div>
    </div>
  );
}

/* ── Key-style button ─────────────────────────────────────── */
function KeyButton({
  children,
  onClick,
  disabled,
  dim,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      disabled={disabled}
      className={
        `font-terminal border-2 px-5 py-2 rounded transition-all text-sm
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        ${dim
          ? 'border-phosphor/30 text-phosphor/50 hover:border-phosphor/60 hover:text-phosphor/80'
          : 'border-phosphor/80 text-phosphor shadow-glow hover:shadow-glow-strong'
        }
        ${pressed ? 'scale-[0.97]' : ''} ` + className
      }
    >
      {children}
    </button>
  );
}

/* ── Section action bar (back + skip + proceed) ───────────── */
function ActionBar({
  onBack,
  onSkip,
  onProceed,
  proceedLabel,
  proceedReady,
}: {
  onBack: () => void;
  onSkip: () => void;
  onProceed: () => void;
  proceedLabel: string;
  proceedReady: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-8 pt-4 border-t border-dashed border-phosphor/20">
      <KeyButton dim onClick={onBack}>[ ← MODIFY PARAMETERS ]</KeyButton>
      <div className="flex gap-3">
        <KeyButton dim onClick={onSkip}>[ SKIP TO FULL REPORT ]</KeyButton>
        <KeyButton onClick={onProceed} disabled={!proceedReady}>
          {proceedReady ? proceedLabel : '[ AWAITING DATA... ]'}
        </KeyButton>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main App
══════════════════════════════════════════════════════════ */
export function App() {
  useShareTechMono();

  /* — Briefing — */
  const [stage, setStage] = useState<Stage>('briefing');
  const [theater, setTheater] = useState('');
  const [forceAlpha, setForceAlpha] = useState('');
  const [forceBravo, setForceBravo] = useState('');

  /* — Suggestions — */
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Incrementing this key triggers a fresh suggestions fetch on each new analysis.
  const [suggestionKey, setSuggestionKey] = useState(0);

  /* — Gathering — */
  const [statusStep, setStatusStep] = useState(0);
  const [typewriterLen, setTypewriterLen] = useState(0);
  const [progress, setProgress] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const fetchStarted = useRef(false);

  /* — Assessment — */
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [assessPhase, setAssessPhase] = useState<AssessPhase>(0);
  const [skipped, setSkipped] = useState(false);

  /* — Phase 0 typewriter — */
  const [deployCharIndex, setDeployCharIndex] = useState(0);
  const [deployTypeDone, setDeployTypeDone] = useState(false);

  /* — Phase 2 typewriter — */
  const [narrativeParas, setNarrativeParas] = useState<string[]>([]);
  const [narrativeIndex, setNarrativeIndex] = useState(0);
  const [narrativeCharIndex, setNarrativeCharIndex] = useState(0);
  const [narrativeTypeDone, setNarrativeTypeDone] = useState(false);

  /* ── Suggestions fetch — fires on mount and each time suggestionKey changes ── */
  useEffect(() => {
    if (stage !== 'briefing') return;
    setSuggestionsLoading(true);
    setSuggestions(null);
    fetch('http://localhost:8000/suggestions')
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data: Suggestions) => {
        setSuggestions(data);
        setSuggestionsLoading(false);
      })
      .catch(() => setSuggestionsLoading(false)); // silently degrade — form still works without them
  }, [suggestionKey, stage]);

  /* ── Validation ── */
  const allValid =
    theater.trim().length > 0 &&
    forceAlpha.trim().length > 0 &&
    forceBravo.trim().length > 0 &&
    forceAlpha.trim().toLowerCase() !== forceBravo.trim().toLowerCase();

  /* ── Gathering: status line typewriter ── */
  const currentStatusMessage =
    statusStep >= STATUS_MESSAGES.length
      ? ''
      : statusStep === 1
      ? STATUS_MESSAGES[1] + forceAlpha
      : statusStep === 2
      ? STATUS_MESSAGES[2] + forceBravo
      : STATUS_MESSAGES[statusStep];

  useEffect(() => {
    if (stage !== 'gathering' || apiError) return;
    if (typewriterLen < currentStatusMessage.length) {
      const t = setTimeout(() => setTypewriterLen((n) => n + 1), 9);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTypewriterLen(0);
      if (statusStep < STATUS_MESSAGES.length - 1) {
        setStatusStep((s) => s + 1);
        setProgress(((statusStep + 1) / STATUS_MESSAGES.length) * 100);
      } else {
        setProgress(100);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [stage, statusStep, typewriterLen, currentStatusMessage.length, apiError]);

  /* ── Gathering: fire API call ── */
  useEffect(() => {
    if (stage !== 'gathering' || fetchStarted.current) return;
    fetchStarted.current = true;
    setApiError(null);

    const query = `Who would win in a hypothetical battle at ${theater} between ${forceAlpha} and ${forceBravo}? Consider tactics, technology, terrain, and historical context.`;

    fetch('http://localhost:8000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, commander1: forceAlpha, commander2: forceBravo }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then((data: AnalyzeResponse) => {
        setAnalysisResult(data);
        setProgress(100);
        setNarrativeParas((data.verdict?.narrative ?? '').split(/\n\n+/).filter(Boolean));
        setNarrativeIndex(0);
        setNarrativeCharIndex(0);
        setDeployCharIndex(0);
        setDeployTypeDone(false);
        setNarrativeTypeDone(false);
        setSkipped(false);
        setAssessPhase(0);
        setStage('assessment');
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : String(err));
      });
  }, [stage, theater, forceAlpha, forceBravo]);

  /* ── Phase 0: deployment description typewriter ── */
  const deployDesc = analysisResult?.verdict?.initial_deployment?.description ?? '';
  useEffect(() => {
    if (stage !== 'assessment' || assessPhase !== 0 || skipped || deployTypeDone) return;
    if (deployCharIndex < deployDesc.length) {
      const t = setTimeout(() => setDeployCharIndex((n) => n + 1), 7);
      return () => clearTimeout(t);
    }
    setDeployTypeDone(true);
  }, [stage, assessPhase, deployCharIndex, deployDesc.length, skipped, deployTypeDone]);

  /* ── Phase 2: narrative typewriter ── */
  useEffect(() => {
    if (stage !== 'assessment' || assessPhase !== 2 || skipped || narrativeTypeDone) return;
    const para = narrativeParas[narrativeIndex];
    if (!para) return;
    if (narrativeCharIndex < para.length) {
      const t = setTimeout(() => setNarrativeCharIndex((n) => n + 1), 6);
      return () => clearTimeout(t);
    }
    if (narrativeIndex < narrativeParas.length - 1) {
      const t = setTimeout(() => {
        setNarrativeIndex((n) => n + 1);
        setNarrativeCharIndex(0);
      }, 300);
      return () => clearTimeout(t);
    }
    setNarrativeTypeDone(true);
  }, [stage, assessPhase, narrativeParas, narrativeIndex, narrativeCharIndex, skipped, narrativeTypeDone]);

  /* ── Actions ── */
  const startAnalysis = useCallback(() => {
    setStage('gathering');
    setStatusStep(0);
    setTypewriterLen(0);
    setProgress(0);
    setAnalysisResult(null);
    setApiError(null);
    fetchStarted.current = false;
  }, []);

  const resetToBriefing = useCallback(() => {
    setStage('briefing');
    setTheater('');
    setForceAlpha('');
    setForceBravo('');
    setSuggestionKey((k) => k + 1); // triggers a fresh suggestions fetch
    setAnalysisResult(null);
    setApiError(null);
    setStatusStep(0);
    setTypewriterLen(0);
    setProgress(0);
    setAssessPhase(0);
    setSkipped(false);
    setDeployCharIndex(0);
    setDeployTypeDone(false);
    setNarrativeParas([]);
    setNarrativeIndex(0);
    setNarrativeCharIndex(0);
    setNarrativeTypeDone(false);
    fetchStarted.current = false;
  }, []);

  const skipToEnd = useCallback(() => {
    setSkipped(true);
    setDeployTypeDone(true);
    setNarrativeTypeDone(true);
    setAssessPhase(3);
  }, []);

  /* ── Derived ── */
  const verdict = analysisResult?.verdict;
  const breakdown = verdict?.score_breakdown ?? {};
  const deployment = verdict?.initial_deployment;
  const aftermath = verdict?.aftermath;

  const getStatusLine = (i: number) =>
    i === 1
      ? STATUS_MESSAGES[1] + forceAlpha
      : i === 2
      ? STATUS_MESSAGES[2] + forceBravo
      : STATUS_MESSAGES[i] ?? '';

  const terrainLabel =
    deployment?.terrain_advantage === 'commander1'
      ? forceAlpha.toUpperCase()
      : deployment?.terrain_advantage === 'commander2'
      ? forceBravo.toUpperCase()
      : 'NEUTRAL';

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-war-bg text-phosphor font-terminal scanlines crt-flicker">
      <div
        className="max-w-4xl mx-auto px-6 py-8 rounded-lg border-2 border-dashed border-phosphor/60"
        style={{ boxShadow: '0 0 40px rgba(57,255,20,0.08), inset 0 0 60px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-terminal text-phosphor tracking-widest mb-1">
            FOG OF WAR // TACTICAL ANALYSIS SYSTEM
          </h1>
          <p className="text-amber/90 text-sm tracking-widest">
            CLASSIFICATION: TOP SECRET // EYES ONLY
          </p>
          <div className="text-phosphor/40 mt-2 text-sm">
            ─────────────────────────────────────────────────────────
          </div>
        </header>

        {/* ══════════════════════════════════════
            STAGE 1 — BRIEFING
        ══════════════════════════════════════ */}
        {stage === 'briefing' && (
          <section>
            <TextInput
              label="THEATER OF OPERATIONS:"
              value={theater}
              onChange={setTheater}
              placeholder="Any location — real, fictional, or hypothetical..."
            >
              <SuggestionChips
                chips={suggestions?.theaters ?? []}
                onSelect={setTheater}
                loading={suggestionsLoading}
              />
            </TextInput>

            <TextInput
              label="FORCE ALPHA:"
              value={forceAlpha}
              onChange={setForceAlpha}
              placeholder="Any commander, army, faction, or concept..."
            >
              <SuggestionChips
                chips={suggestions?.forces ?? []}
                onSelect={setForceAlpha}
                loading={suggestionsLoading}
                exclude={forceBravo}
              />
            </TextInput>

            <TextInput
              label="FORCE BRAVO:"
              value={forceBravo}
              onChange={setForceBravo}
              placeholder="Any commander, army, faction, or concept..."
              error={
                forceBravo.trim() &&
                forceAlpha.trim().toLowerCase() === forceBravo.trim().toLowerCase()
                  ? '>> FORCE BRAVO MUST DIFFER FROM FORCE ALPHA'
                  : null
              }
            >
              <SuggestionChips
                chips={suggestions?.forces ?? []}
                onSelect={setForceBravo}
                loading={suggestionsLoading}
                exclude={forceAlpha}
              />
            </TextInput>

            <div className="mt-8 flex justify-center">
              <KeyButton onClick={startAnalysis} disabled={!allValid}>
                [ INITIATE TACTICAL ANALYSIS ]
              </KeyButton>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════
            STAGE 2 — GATHERING
        ══════════════════════════════════════ */}
        {stage === 'gathering' && (
          <section>
            {apiError ? (
              <div className="border border-dashed border-terminal-red rounded p-6 text-center">
                <p className="text-terminal-red text-lg mb-2 tracking-wider">
                  !! TRANSMISSION FAILED !!
                </p>
                <p className="text-terminal-red text-sm mb-6">&gt;&gt; {apiError}</p>
                <KeyButton onClick={resetToBriefing}>[ ABORT — RETURN TO BRIEFING ]</KeyButton>
              </div>
            ) : (
              <>
                <h2 className="text-amber text-lg mb-4 tracking-wider">
                  RETRIEVING FIELD INTELLIGENCE...
                </h2>
                <div className="space-y-2 mb-6 min-h-[240px]">
                  {Array.from({ length: statusStep + 1 }).map((_, i) => (
                    <p key={i} className="text-phosphor text-sm">
                      {i < statusStep ? (
                        getStatusLine(i)
                      ) : (
                        <>
                          {currentStatusMessage.slice(0, typewriterLen)}
                          <span className="typewriter-cursor" />
                        </>
                      )}
                    </p>
                  ))}
                </div>
                <div className="mb-4">
                  <div className="h-2 border border-dashed border-phosphor/70 rounded overflow-hidden bg-war-bg">
                    <div
                      className="h-full bg-phosphor/80 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-right text-phosphor/50 text-xs mt-1">{Math.round(progress)}%</p>
                </div>
              </>
            )}
          </section>
        )}

        {/* ══════════════════════════════════════
            STAGE 3 — ASSESSMENT
        ══════════════════════════════════════ */}
        {stage === 'assessment' && verdict && (
          <section>
            {/* ── SECTION I — INITIAL CONTACT ──────────────────── */}
            <div className="mb-10 section-reveal">
              <SectionHeader>[ SECTION I — INITIAL CONTACT ]</SectionHeader>

              {/* Deployment description with typewriter */}
              <p className="text-phosphor/90 text-sm leading-relaxed mb-6">
                {skipped ? deployDesc : deployDesc.slice(0, deployCharIndex)}
                {!skipped && assessPhase === 0 && !deployTypeDone && (
                  <span className="typewriter-cursor" />
                )}
              </p>

              {/* Formation cards — appear once description is done */}
              {(deployTypeDone || skipped) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 section-reveal">
                  <div className="border border-dashed border-phosphor/40 rounded p-4">
                    <p className="text-amber text-xs tracking-wider mb-2">
                      FORCE ALPHA — {forceAlpha.toUpperCase()}
                    </p>
                    <p className="text-phosphor/85 text-sm leading-relaxed">
                      {deployment?.commander1_formation ?? '—'}
                    </p>
                  </div>
                  <div className="border border-dashed border-phosphor/40 rounded p-4">
                    <p className="text-amber text-xs tracking-wider mb-2">
                      FORCE BRAVO — {forceBravo.toUpperCase()}
                    </p>
                    <p className="text-phosphor/85 text-sm leading-relaxed">
                      {deployment?.commander2_formation ?? '—'}
                    </p>
                  </div>
                </div>
              )}

              {(deployTypeDone || skipped) && deployment?.terrain_advantage && (
                <p className="text-xs text-phosphor/50 tracking-wider mb-2 section-reveal">
                  TERRAIN ADVANTAGE:{' '}
                  <span className="text-amber">{terrainLabel}</span>
                </p>
              )}

              {/* Action bar — only visible while on this section */}
              {assessPhase === 0 && (
                <ActionBar
                  onBack={resetToBriefing}
                  onSkip={skipToEnd}
                  onProceed={() => setAssessPhase(1)}
                  proceedLabel="[ SECTION II — PRE-BATTLE ASSESSMENT → ]"
                  proceedReady={deployTypeDone}
                />
              )}
            </div>

            {/* ── SECTION II — PRE-BATTLE ASSESSMENT ──────────── */}
            {assessPhase >= 1 && (
              <div className="mb-10 section-reveal">
                <SectionHeader>[ SECTION II — PRE-BATTLE ASSESSMENT ]</SectionHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Force Alpha */}
                  <div className="border border-dashed border-phosphor/70 rounded p-4 shadow-glow">
                    <h3 className="text-amber text-xs tracking-wider mb-1">
                      FORCE ALPHA: {forceAlpha.toUpperCase()}
                    </h3>
                    <p className="text-phosphor text-2xl mb-4">
                      {verdict.commander1_score ?? '—'}
                      <span className="text-phosphor/40 text-sm"> / 100</span>
                    </p>
                    {BREAKDOWN_KEYS.map((key) => {
                      const v = breakdown[key];
                      return (
                        <ScoreBar
                          key={key}
                          label={key}
                          value={typeof v?.commander1 === 'number' ? v.commander1 : 0}
                        />
                      );
                    })}
                  </div>
                  {/* Force Bravo */}
                  <div className="border border-dashed border-phosphor/70 rounded p-4 shadow-glow">
                    <h3 className="text-amber text-xs tracking-wider mb-1">
                      FORCE BRAVO: {forceBravo.toUpperCase()}
                    </h3>
                    <p className="text-phosphor text-2xl mb-4">
                      {verdict.commander2_score ?? '—'}
                      <span className="text-phosphor/40 text-sm"> / 100</span>
                    </p>
                    {BREAKDOWN_KEYS.map((key) => {
                      const v = breakdown[key];
                      return (
                        <ScoreBar
                          key={key}
                          label={key}
                          value={typeof v?.commander2 === 'number' ? v.commander2 : 0}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Action bar */}
                {assessPhase === 1 && (
                  <ActionBar
                    onBack={resetToBriefing}
                    onSkip={skipToEnd}
                    onProceed={() => setAssessPhase(2)}
                    proceedLabel="[ SECTION III — BATTLE SIMULATION → ]"
                    proceedReady={true}
                  />
                )}
              </div>
            )}

            {/* ── SECTION III — BATTLE SIMULATION ─────────────── */}
            {assessPhase >= 2 && (
              <div className="mb-10 section-reveal">
                <SectionHeader>[ SECTION III — BATTLE SIMULATION ]</SectionHeader>
                <div className="space-y-4">
                  {skipped ? (
                    narrativeParas.map((p, i) => (
                      <p key={i} className="text-phosphor/90 text-sm leading-relaxed">{p}</p>
                    ))
                  ) : (
                    <>
                      {narrativeParas.slice(0, narrativeIndex).map((p, i) => (
                        <p key={i} className="text-phosphor/90 text-sm leading-relaxed">{p}</p>
                      ))}
                      {narrativeParas[narrativeIndex] !== undefined && (
                        <p className="text-phosphor/90 text-sm leading-relaxed">
                          {narrativeParas[narrativeIndex].slice(0, narrativeCharIndex)}
                          {assessPhase === 2 && !narrativeTypeDone && (
                            <span className="typewriter-cursor" />
                          )}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Victor banner — dramatic reveal after narrative finishes */}
                {(narrativeTypeDone || skipped) && (
                  <div className="mt-8 mb-2 section-reveal">
                    <h2 className="text-amber text-xl flash-alert tracking-wider">
                      ANALYSIS COMPLETE — VICTOR:{' '}
                      <span className="text-phosphor">{verdict.winner ?? 'UNKNOWN'}</span>
                      {'  '}
                      <span className="text-phosphor/50 text-sm">
                        ({verdict.confidence_percentage ?? 0}% CONFIDENCE)
                      </span>
                    </h2>
                  </div>
                )}

                {/* Action bar */}
                {assessPhase === 2 && (
                  <ActionBar
                    onBack={resetToBriefing}
                    onSkip={skipToEnd}
                    onProceed={() => setAssessPhase(3)}
                    proceedLabel="[ SECTION IV — AFTERMATH REPORT → ]"
                    proceedReady={narrativeTypeDone || skipped}
                  />
                )}
              </div>
            )}

            {/* ── SECTION IV — AFTERMATH REPORT ────────────────── */}
            {assessPhase >= 3 && aftermath && (
              <div className="mb-8 section-reveal">
                <SectionHeader>[ SECTION IV — AFTERMATH REPORT ]</SectionHeader>

                <p className="text-phosphor/90 text-sm leading-relaxed mb-6">
                  {aftermath.description}
                </p>

                {/* Casualty cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="border border-dashed border-terminal-red/50 rounded p-4">
                    <p className="text-terminal-red text-xs tracking-wider mb-2">
                      FORCE ALPHA CASUALTIES
                    </p>
                    <p className="text-phosphor/85 text-sm">{aftermath.commander1_casualties}</p>
                  </div>
                  <div className="border border-dashed border-terminal-red/50 rounded p-4">
                    <p className="text-terminal-red text-xs tracking-wider mb-2">
                      FORCE BRAVO CASUALTIES
                    </p>
                    <p className="text-phosphor/85 text-sm">{aftermath.commander2_casualties}</p>
                  </div>
                </div>

                {/* Strategic & historical notes */}
                <div className="space-y-4 mb-6">
                  <div className="border-l-2 border-phosphor/40 pl-4">
                    <p className="text-amber text-xs tracking-wider mb-1">STRATEGIC CONSEQUENCE</p>
                    <p className="text-phosphor/85 text-sm leading-relaxed">
                      {aftermath.strategic_consequence}
                    </p>
                  </div>
                  <div className="border-l-2 border-phosphor/40 pl-4">
                    <p className="text-amber text-xs tracking-wider mb-1">HISTORICAL SIGNIFICANCE</p>
                    <p className="text-phosphor/85 text-sm leading-relaxed">
                      {aftermath.historical_significance}
                    </p>
                  </div>
                </div>

                {/* Fun fact */}
                {verdict.fun_fact && (
                  <div className="border-l-2 border-amber/60 pl-4 py-1 mb-8 text-amber/85 text-sm">
                    &gt;&gt; FIELD INTELLIGENCE NOTE: {verdict.fun_fact}
                  </div>
                )}

                <div className="flex justify-center">
                  <KeyButton onClick={resetToBriefing}>[ ← RUN NEW ANALYSIS ]</KeyButton>
                </div>
              </div>
            )}

            {/* ── AGENT REASONING TRACE ─────────────────────────── */}
            {assessPhase >= 3 && analysisResult && analysisResult.thinking_trace.length > 0 && (
              <AgentTrace trace={analysisResult.thinking_trace as TraceEntry[]} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/* ── Agent reasoning trace (collapsible) ─────────────────── */
interface TraceEntry {
  tool: string;
  input: unknown;
  output: unknown;
}

function AgentTrace({ trace }: { trace: TraceEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 border border-dashed border-phosphor/20 rounded section-reveal">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 font-terminal text-phosphor/50
          text-xs tracking-wider hover:text-phosphor/80 hover:bg-phosphor/5 transition-all rounded"
      >
        <span>[ AGENT REASONING TRACE — {trace.length} TOOL CALLS ]</span>
        <span>{open ? '▲ COLLAPSE' : '▼ EXPAND'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-dashed border-phosphor/15 pt-4">
          {trace.map((entry, i) => (
            <div key={i} className="text-xs font-terminal">
              <p className="text-amber/80 mb-1">
                [{String(i + 1).padStart(2, '0')}] TOOL: {entry.tool.toUpperCase()}
              </p>
              <p className="text-phosphor/40 mb-0.5 pl-4">INPUT:</p>
              <pre className="text-phosphor/60 pl-4 whitespace-pre-wrap break-all leading-relaxed mb-1">
                {typeof entry.input === 'string'
                  ? entry.input
                  : JSON.stringify(entry.input, null, 2)}
              </pre>
              <p className="text-phosphor/40 mb-0.5 pl-4">OUTPUT:</p>
              <pre className="text-phosphor/40 pl-4 whitespace-pre-wrap break-all leading-relaxed">
                {typeof entry.output === 'string'
                  ? entry.output.slice(0, 400) + (entry.output.length > 400 ? '…' : '')
                  : JSON.stringify(entry.output, null, 2).slice(0, 400)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
