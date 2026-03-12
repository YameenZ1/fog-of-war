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
  terrain_advantage: string; // 'commander1' | 'commander2' | 'neutral'
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
  '>> RETRIEVING INTELLIGENCE ON: ',   // appended with forceAlpha
  '>> RETRIEVING INTELLIGENCE ON: ',   // appended with forceBravo
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

/* ── Plain text input ─────────────────────────────────────── */
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="mb-4">
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
      {error && (
        <p className="mt-1 font-terminal text-terminal-red text-sm">{error}</p>
      )}
    </div>
  );
}

/* ── Horizontal score bar ─────────────────────────────────── */
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

/* ── Section header with divider ─────────────────────────── */
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
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
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
        `font-terminal border-2 border-phosphor/80 px-6 py-3 rounded text-phosphor
        shadow-glow hover:shadow-glow-strong transition-all
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        ${pressed ? 'scale-[0.98] shadow-inner' : ''} ` + className
      }
    >
      {children}
    </button>
  );
}

/* ── Main app ─────────────────────────────────────────────── */
export function App() {
  useShareTechMono();

  /* — Briefing inputs — */
  const [stage, setStage] = useState<Stage>('briefing');
  const [theater, setTheater] = useState('');
  const [forceAlpha, setForceAlpha] = useState('');
  const [forceBravo, setForceBravo] = useState('');

  /* — Gathering / loading state — */
  const [statusStep, setStatusStep] = useState(0);
  const [typewriterLen, setTypewriterLen] = useState(0);
  const [progress, setProgress] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const fetchStarted = useRef(false);

  /* — Assessment result + phase — */
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [assessPhase, setAssessPhase] = useState<AssessPhase>(0);

  /* — Phase 0: typewriter for deployment description — */
  const [deployCharIndex, setDeployCharIndex] = useState(0);

  /* — Phase 2: typewriter for narrative — */
  const [narrativeParas, setNarrativeParas] = useState<string[]>([]);
  const [narrativeIndex, setNarrativeIndex] = useState(0);
  const [narrativeCharIndex, setNarrativeCharIndex] = useState(0);

  /* ── Validation: any non-empty text, different from each other ── */
  const allValid =
    theater.trim().length > 0 &&
    forceAlpha.trim().length > 0 &&
    forceBravo.trim().length > 0 &&
    forceAlpha.trim().toLowerCase() !== forceBravo.trim().toLowerCase();

  /* ── Gathering: build current status message ── */
  const currentStatusMessage =
    statusStep >= STATUS_MESSAGES.length
      ? ''
      : statusStep === 1
      ? STATUS_MESSAGES[1] + forceAlpha
      : statusStep === 2
      ? STATUS_MESSAGES[2] + forceBravo
      : STATUS_MESSAGES[statusStep];

  /* ── Gathering: typewriter scrolling through status lines ── */
  useEffect(() => {
    if (stage !== 'gathering' || apiError) return;
    if (typewriterLen < currentStatusMessage.length) {
      const t = setTimeout(() => setTypewriterLen((n) => n + 1), 25);
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
    }, 1400);
    return () => clearTimeout(t);
  }, [stage, statusStep, typewriterLen, currentStatusMessage.length, apiError]);

  /* ── Gathering: fire the API call once ── */
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
        // Prep narrative paragraphs for phase-2 typewriter
        const narrative = data.verdict?.narrative ?? '';
        setNarrativeParas(narrative.split(/\n\n+/).filter(Boolean));
        setNarrativeIndex(0);
        setNarrativeCharIndex(0);
        // Reset assessment animation state
        setDeployCharIndex(0);
        setAssessPhase(0);
        setStage('assessment');
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : String(err));
      });
  }, [stage, theater, forceAlpha, forceBravo]);

  /* ── Assessment phase 0: typewriter for deployment description ── */
  const deployDesc = analysisResult?.verdict?.initial_deployment?.description ?? '';
  useEffect(() => {
    if (stage !== 'assessment' || assessPhase !== 0) return;
    if (deployCharIndex < deployDesc.length) {
      const t = setTimeout(() => setDeployCharIndex((n) => n + 1), 20);
      return () => clearTimeout(t);
    }
    // Description fully typed — wait then reveal stats
    const t = setTimeout(() => setAssessPhase(1), 1600);
    return () => clearTimeout(t);
  }, [stage, assessPhase, deployCharIndex, deployDesc.length]);

  /* ── Assessment phase 1 → 2: auto-advance after stats appear ── */
  useEffect(() => {
    if (stage !== 'assessment' || assessPhase !== 1) return;
    const t = setTimeout(() => setAssessPhase(2), 2200);
    return () => clearTimeout(t);
  }, [stage, assessPhase]);

  /* ── Assessment phase 2: narrative typewriter ── */
  useEffect(() => {
    if (stage !== 'assessment' || assessPhase !== 2 || narrativeParas.length === 0) return;
    const para = narrativeParas[narrativeIndex];
    if (!para) return;
    if (narrativeCharIndex < para.length) {
      const t = setTimeout(() => setNarrativeCharIndex((n) => n + 1), 18);
      return () => clearTimeout(t);
    }
    if (narrativeIndex < narrativeParas.length - 1) {
      const t = setTimeout(() => {
        setNarrativeIndex((n) => n + 1);
        setNarrativeCharIndex(0);
      }, 350);
      return () => clearTimeout(t);
    }
    // Narrative complete — reveal aftermath
    const t = setTimeout(() => setAssessPhase(3), 1000);
    return () => clearTimeout(t);
  }, [stage, assessPhase, narrativeParas, narrativeIndex, narrativeCharIndex]);

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
    setAnalysisResult(null);
    setApiError(null);
    setStatusStep(0);
    setTypewriterLen(0);
    setProgress(0);
    setAssessPhase(0);
    setDeployCharIndex(0);
    setNarrativeParas([]);
    setNarrativeIndex(0);
    setNarrativeCharIndex(0);
    fetchStarted.current = false;
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
            STRATEGOS TACTICAL ANALYSIS SYSTEM v1.0
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
            />
            <TextInput
              label="FORCE ALPHA:"
              value={forceAlpha}
              onChange={setForceAlpha}
              placeholder="Any commander, army, faction, or concept..."
            />
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
            />
            <div className="mt-8 flex justify-center">
              <KeyButton onClick={startAnalysis} disabled={!allValid}>
                [ INITIATE TACTICAL ANALYSIS ]
              </KeyButton>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════
            STAGE 2 — GATHERING (loading)
        ══════════════════════════════════════ */}
        {stage === 'gathering' && (
          <section>
            {apiError ? (
              /* Immediate failure state */
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
                {/* Scrolling status lines */}
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
                {/* Progress bar */}
                <div className="mb-4">
                  <div className="h-2 border border-dashed border-phosphor/70 rounded overflow-hidden bg-war-bg">
                    <div
                      className="h-full bg-phosphor/80 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-right text-phosphor/50 text-xs mt-1">
                    {Math.round(progress)}%
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* ══════════════════════════════════════
            STAGE 3 — ASSESSMENT (4 phases)
        ══════════════════════════════════════ */}
        {stage === 'assessment' && verdict && (
          <section>
            {/* Victor banner */}
            <h2 className="text-amber text-xl flash-alert mb-8 tracking-wider">
              ANALYSIS COMPLETE — VICTOR:{' '}
              <span className="text-phosphor">{verdict.winner ?? 'UNKNOWN'}</span>
              {'  '}
              <span className="text-phosphor/60 text-sm">
                ({verdict.confidence_percentage ?? 0}% CONFIDENCE)
              </span>
            </h2>

            {/* ── SECTION I — INITIAL CONTACT ───────────────────── */}
            <div className="mb-10 section-reveal">
              <SectionHeader>[ SECTION I — INITIAL CONTACT ]</SectionHeader>

              {/* Deployment description (typewriter) */}
              <p className="text-phosphor/90 text-sm leading-relaxed mb-6">
                {deployDesc.slice(0, deployCharIndex)}
                {assessPhase === 0 && <span className="typewriter-cursor" />}
              </p>

              {/* Formation cards — appear after description finishes */}
              {assessPhase >= 1 && (
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

              {assessPhase >= 1 && (
                <p className="text-xs text-phosphor/50 tracking-wider section-reveal">
                  TERRAIN ADVANTAGE:{' '}
                  <span className="text-amber">{terrainLabel}</span>
                </p>
              )}
            </div>

            {/* ── SECTION II — PRE-BATTLE ASSESSMENT ───────────── */}
            {assessPhase >= 1 && (
              <div className="mb-10 section-reveal">
                <SectionHeader>[ SECTION II — PRE-BATTLE ASSESSMENT ]</SectionHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Force Alpha stats */}
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
                      const num = typeof v?.commander1 === 'number' ? v.commander1 : 0;
                      return <ScoreBar key={key} label={key} value={num} />;
                    })}
                  </div>
                  {/* Force Bravo stats */}
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
                      const num = typeof v?.commander2 === 'number' ? v.commander2 : 0;
                      return <ScoreBar key={key} label={key} value={num} />;
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── SECTION III — BATTLE SIMULATION ──────────────── */}
            {assessPhase >= 2 && (
              <div className="mb-10 section-reveal">
                <SectionHeader>[ SECTION III — BATTLE SIMULATION ]</SectionHeader>
                <div className="space-y-4">
                  {/* Fully-typed paragraphs */}
                  {narrativeParas.slice(0, narrativeIndex).map((p, i) => (
                    <p key={i} className="text-phosphor/90 text-sm leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {/* Currently-typing paragraph */}
                  {narrativeParas[narrativeIndex] !== undefined && (
                    <p className="text-phosphor/90 text-sm leading-relaxed">
                      {narrativeParas[narrativeIndex].slice(0, narrativeCharIndex)}
                      {assessPhase === 2 && <span className="typewriter-cursor" />}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── SECTION IV — AFTERMATH REPORT ────────────────── */}
            {assessPhase >= 3 && aftermath && (
              <div className="mb-8 section-reveal">
                <SectionHeader>[ SECTION IV — AFTERMATH REPORT ]</SectionHeader>

                {/* Aftermath description */}
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

                {/* Strategic & historical significance */}
                <div className="space-y-4 mb-6">
                  <div className="border-l-2 border-phosphor/40 pl-4">
                    <p className="text-amber text-xs tracking-wider mb-1">
                      STRATEGIC CONSEQUENCE
                    </p>
                    <p className="text-phosphor/85 text-sm leading-relaxed">
                      {aftermath.strategic_consequence}
                    </p>
                  </div>
                  <div className="border-l-2 border-phosphor/40 pl-4">
                    <p className="text-amber text-xs tracking-wider mb-1">
                      HISTORICAL SIGNIFICANCE
                    </p>
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
                  <KeyButton onClick={resetToBriefing}>[ RUN NEW ANALYSIS ]</KeyButton>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
