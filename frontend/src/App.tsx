export function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-50">
      <div className="max-w-2xl px-6 py-8 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Historical Battle Analyzer
        </h1>
        <p className="text-slate-300 mb-4">
          Frontend placeholder. This React + Vite + Tailwind app will become the main UI for exploring and analyzing historical battles.
        </p>
        <p className="text-sm text-slate-400">
          Eventually this app will talk to the <code>agent</code> LangChain backend and the <code>mcp-server</code> Wikipedia microservice via API calls.
        </p>
      </div>
    </div>
  );
}
