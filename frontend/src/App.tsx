import { useCallback, useEffect, useRef, useState } from 'react';

/* ----- Types ----- */
type Stage = 'briefing' | 'gathering' | 'assessment';

interface ScoreBreakdown {
  tactical_genius?: { commander1: number; commander2: number };
  army_size?: { commander1: number; commander2: number };
  tech_level?: { commander1: number; commander2: number };
  terrain_adaptability?: { commander1: number; commander2: number };
  supply_chain?: { commander1: number; commander2: number };
  morale?: { commander1: number; commander2: number };
}

interface Verdict {
  winner: string | null;
  confidence_percentage: number | null;
  commander1_score: number | null;
  commander2_score: number | null;
  score_breakdown: ScoreBreakdown;
  narrative: string;
  fun_fact: string;
}

interface AnalyzeResponse {
  verdict: Verdict;
  thinking_trace: unknown[];
}

/* ----- Constants ----- */
const THEATER_OPTIONS = [
  'Waterloo, Belgium',
  'Gettysburg, Pennsylvania',
  'Thermopylae, Greece',
  'Stalingrad, Russia',
  'Normandy, France',
  'Marathon, Greece',
  'Hastings, England',
  'Agincourt, France',
];

const COMMANDER_OPTIONS = [
  'Napoleon Bonaparte',
  'Julius Caesar',
  'Alexander the Great',
  'Genghis Khan',
  'Hannibal Barca',
  'Sun Tzu',
  'Saladin',
  'Duke of Wellington',
];

const STATUS_MESSAGES = [
  '>> ACCESSING TACTICAL DATABASE...',
  '>> RETRIEVING COMMANDER PROFILE: ', // + forceAlpha
  '>> RETRIEVING COMMANDER PROFILE: ', // + forceBravo
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

/* ----- Font injection ----- */
function useShareTechMono() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap';
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

/* ----- Autocomplete with click-outside ----- */
function Autocomplete({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  open,
  onOpenChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  error: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;
  const isValid = value && options.includes(value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onOpenChange]);

  return (
    <div ref={containerRef} className="mb-4">
      <label className="block font-terminal text-phosphor text-sm mb-1 tracking-wider">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onOpenChange(true);
        }}
        onFocus={() => onOpenChange(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-war-bg border border-dashed border-phosphor/70 text-phosphor font-terminal px-3 py-2 rounded focus:outline-none focus:shadow-glow placeholder-phosphor/40"
      />
      {open && filtered.length > 0 && (
        <ul className="mt-1 border border-dashed border-phosphor/70 rounded bg-war-bg max-h-40 overflow-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              onClick={() => {
                onChange(opt);
                onOpenChange(false);
              }}
              className="px-3 py-2 font-terminal text-phosphor cursor-pointer hover:bg-phosphor/10 hover:text-amber"
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-1 font-terminal text-terminal-red text-sm">{error}</p>
      )}
    </div>
  );
}

/* ----- Key-style button ----- */
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
        active:scale-[0.98] ${pressed ? 'scale-[0.98] shadow-inner' : ''} ` + className
      }
    >
      {children}
    </button>
  );
}

export function App() {
  useShareTechMono();

  const [stage, setStage] = useState<Stage>('briefing');
  const [theater, setTheater] = useState('');
  const [forceAlpha, setForceAlpha] = useState('');
  const [forceBravo, setForceBravo] = useState('');
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [alphaOpen, setAlphaOpen] = useState(false);
  const [bravoOpen, setBravoOpen] = useState(false);

  const [statusStep, setStatusStep] = useState(0);
  const [typewriterLen, setTypewriterLen] = useState(0);
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [narrativeParas, setNarrativeParas] = useState<string[]>([]);
  const [narrativeIndex, setNarrativeIndex] = useState(0);
  const [narrativeCharIndex, setNarrativeCharIndex] = useState(0);

  const theaterValid = THEATER_OPTIONS.includes(theater);
  const alphaValid = COMMANDER_OPTIONS.includes(forceAlpha);
  const bravoValid = COMMANDER_OPTIONS.includes(forceBravo);
  const allValid = theaterValid && alphaValid && bravoValid && forceAlpha !== forceBravo;

  const currentStatusMessage =
    statusStep < 2
      ? STATUS_MESSAGES[statusStep] + (statusStep === 0 ? '' : statusStep === 1 ? forceAlpha : forceBravo)
      : STATUS_MESSAGES[statusStep];
  const currentMessageFullLength = currentStatusMessage.length;

  /* Stage 2: typewriter for status messages */
  useEffect(() => {
    if (stage !== 'gathering') return;
    if (apiError) return; // stop animation immediately on failure
    if (typewriterLen < currentMessageFullLength) {
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
    }, 1500);
    return () => clearTimeout(t);
  }, [stage, statusStep, typewriterLen, currentMessageFullLength]);

  /* Stage 2: trigger API call when entering gathering */
  const fetchStarted = useRef(false);
  useEffect(() => {
    if (stage !== 'gathering' || fetchStarted.current) return;
    fetchStarted.current = true;
    setApiError(null);
    const query = `Who would win in a hypothetical battle at ${theater} between ${forceAlpha} and ${forceBravo}? Consider tactics, technology, and historical context.`;
    fetch('http://localhost:8000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        commander1: forceAlpha,
        commander2: forceBravo,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then((data: AnalyzeResponse) => {
        setAnalysisResult(data);
        setProgress(100);
        setStage('assessment');
        const narrative = data.verdict?.narrative ?? '';
        setNarrativeParas(narrative.split(/\n\n+/).filter(Boolean));
        setNarrativeIndex(0);
        setNarrativeCharIndex(0);
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : String(err));
      });
  }, [stage, theater, forceAlpha, forceBravo]);

  /* Stage 3: typewriter for narrative paragraphs */
  useEffect(() => {
    if (stage !== 'assessment' || narrativeParas.length === 0) return;
    const para = narrativeParas[narrativeIndex];
    if (!para) return;
    if (narrativeCharIndex < para.length) {
      const t = setTimeout(() => setNarrativeCharIndex((n) => n + 1), 20);
      return () => clearTimeout(t);
    }
    if (narrativeIndex < narrativeParas.length - 1) {
      const t = setTimeout(() => {
        setNarrativeIndex((n) => n + 1);
        setNarrativeCharIndex(0);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [stage, narrativeParas, narrativeIndex, narrativeCharIndex]);

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
    setNarrativeParas([]);
    setNarrativeIndex(0);
    setNarrativeCharIndex(0);
    fetchStarted.current = false;
  }, []);

  const verdict = analysisResult?.verdict;
  const breakdown = verdict?.score_breakdown ?? {};

  const getStatusMessage = (i: number) =>
    i === 1 ? STATUS_MESSAGES[1] + forceAlpha : i === 2 ? STATUS_MESSAGES[2] + forceBravo : STATUS_MESSAGES[i];

  return (
    <div className="min-h-screen bg-war-bg text-phosphor font-terminal scanlines crt-flicker">
      <div
        className="max-w-4xl mx-auto px-6 py-8 rounded-lg border-2 border-dashed border-phosphor/60 shadow-glow"
        style={{
          boxShadow: '0 0 40px rgba(57, 255, 20, 0.08), inset 0 0 60px rgba(0,0,0,0.3)',
        }}
      >
        <header className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-terminal text-phosphor tracking-widest mb-1">
            STRATEGOS TACTICAL ANALYSIS SYSTEM v1.0
          </h1>
          <p className="text-amber/90 text-sm tracking-widest">
            CLASSIFICATION: TOP SECRET // EYES ONLY
          </p>
          <div className="text-phosphor/60 mt-2 text-sm">
            ─────────────────────────────────────────────────────────
          </div>
        </header>

        {stage === 'briefing' && (
          <section>
            <Autocomplete
              label="THEATER OF OPERATIONS:"
              value={theater}
              onChange={setTheater}
              options={THEATER_OPTIONS}
              placeholder="Enter location..."
              error={
                theater && !theaterValid
                  ? '>> LOCATION NOT FOUND IN THEATER DATABASE'
                  : null
              }
              open={theaterOpen}
              onOpenChange={setTheaterOpen}
            />
            <Autocomplete
              label="FORCE ALPHA:"
              value={forceAlpha}
              onChange={setForceAlpha}
              options={COMMANDER_OPTIONS}
              placeholder="Commander or army..."
              error={null}
              open={alphaOpen}
              onOpenChange={setAlphaOpen}
            />
            <Autocomplete
              label="FORCE BRAVO:"
              value={forceBravo}
              onChange={setForceBravo}
              options={COMMANDER_OPTIONS}
              placeholder="Commander or army..."
              error={
                forceBravo && forceAlpha === forceBravo
                  ? '>> FORCE BRAVO MUST DIFFER FROM FORCE ALPHA'
                  : null
              }
              open={bravoOpen}
              onOpenChange={setBravoOpen}
            />
            <div className="mt-8 flex justify-center">
              <KeyButton onClick={startAnalysis} disabled={!allValid}>
                [ INITIATE TACTICAL ANALYSIS ]
              </KeyButton>
            </div>
          </section>
        )}

        {stage === 'gathering' && (
          <section>
            {apiError ? (
              <>
                <div className="border border-dashed border-terminal-red rounded p-6 mb-6 text-center">
                  <p className="text-terminal-red text-lg font-terminal mb-2 tracking-wider">
                    !! TRANSMISSION FAILED !!
                  </p>
                  <p className="text-terminal-red text-sm font-terminal mb-6">
                    &gt;&gt; {apiError}
                  </p>
                  <KeyButton onClick={resetToBriefing}>[ ABORT — RETURN TO BRIEFING ]</KeyButton>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-amber text-lg mb-4 tracking-wider">
                  RETRIEVING FIELD INTELLIGENCE...
                </h2>
                <div className="space-y-2 mb-6 min-h-[240px]">
                  {Array.from({ length: statusStep + 1 }).map((_, i) => (
                    <p key={i} className="font-terminal text-phosphor text-sm">
                      {i < statusStep ? (
                        getStatusMessage(i)
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
                  <p className="text-right text-phosphor/70 text-xs mt-1">{Math.round(progress)}%</p>
                </div>
              </>
            )}
          </section>
        )}

        {stage === 'assessment' && verdict && (
          <section>
            <h2 className="text-amber text-xl flash-alert mb-6 tracking-wider">
              ANALYSIS COMPLETE
            </h2>
            <div className="text-center mb-8">
              <p className="text-2xl md:text-3xl text-phosphor font-terminal mb-1">
                VICTOR: {verdict.winner ?? 'UNKNOWN'}
              </p>
              <p className="text-amber">
                CONFIDENCE: {verdict.confidence_percentage ?? 0}%
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="border border-dashed border-phosphor/70 rounded p-4 shadow-glow">
                <h3 className="text-amber text-sm mb-3 tracking-wider">FORCE ALPHA: {forceAlpha}</h3>
                {BREAKDOWN_KEYS.map((key) => {
                  const v = breakdown[key];
                  const num = typeof v?.commander1 === 'number' ? v.commander1 : 0;
                  return (
                    <div key={key} className="mb-2">
                      <div className="flex justify-between text-xs text-phosphor/90 mb-0.5">
                        <span className="uppercase">{key.replace(/_/g, ' ')}</span>
                        <span>{num}%</span>
                      </div>
                      <div className="h-1.5 bg-war-bg border border-phosphor/30 rounded overflow-hidden">
                        <div
                          className="h-full bg-phosphor/80"
                          style={{ width: `${num}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border border-dashed border-phosphor/70 rounded p-4 shadow-glow">
                <h3 className="text-amber text-sm mb-3 tracking-wider">FORCE BRAVO: {forceBravo}</h3>
                {BREAKDOWN_KEYS.map((key) => {
                  const v = breakdown[key];
                  const num = typeof v?.commander2 === 'number' ? v.commander2 : 0;
                  return (
                    <div key={key} className="mb-2">
                      <div className="flex justify-between text-xs text-phosphor/90 mb-0.5">
                        <span className="uppercase">{key.replace(/_/g, ' ')}</span>
                        <span>{num}%</span>
                      </div>
                      <div className="h-1.5 bg-war-bg border border-phosphor/30 rounded overflow-hidden">
                        <div
                          className="h-full bg-phosphor/80"
                          style={{ width: `${num}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-6 space-y-4">
              {narrativeParas.slice(0, narrativeIndex).map((p, i) => (
                <p key={i} className="text-phosphor/95 text-sm leading-relaxed">
                  {p}
                </p>
              ))}
              {narrativeParas[narrativeIndex] !== undefined && (
                <p className="text-phosphor/95 text-sm leading-relaxed">
                  {narrativeParas[narrativeIndex].slice(0, narrativeCharIndex)}
                  <span className="typewriter-cursor" />
                </p>
              )}
            </div>

            {verdict.fun_fact && (
              <div className="border-l-2 border-amber/70 pl-4 py-2 mb-8 text-amber/90 text-sm">
                &gt;&gt; FIELD INTELLIGENCE NOTE: {verdict.fun_fact}
              </div>
            )}

            <div className="flex justify-center">
              <KeyButton onClick={resetToBriefing}>[ RUN NEW ANALYSIS ]</KeyButton>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
