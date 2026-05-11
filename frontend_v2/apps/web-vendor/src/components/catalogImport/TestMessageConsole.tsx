import { useState } from 'react';
import { Button } from '@chatlogix/ui';
import { testMessage } from '../../lib/catalogImport';
import type { SandboxTestResult } from '../../types/catalogImport';

interface Turn {
  role: 'you' | 'bot';
  text: string;
  meta?: SandboxTestResult;
}

export function TestMessageConsole() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: 'you', text }]);
    setInput('');
    try {
      const out = await testMessage(text);
      setTurns((t) => [...t, { role: 'bot', text: out.response || '(no reply)', meta: out }]);
    } catch (err) {
      setTurns((t) => [...t, { role: 'bot', text: `Error: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">Test your AI</h3>
        <p className="text-xs text-gray-500">
          Messages here run through the real pipeline but aren&apos;t stored as a
          customer conversation or billed. Great for tuning before going live.
        </p>
      </div>

      <div className="max-h-64 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <p className="text-center text-xs text-gray-400">
            Try: &ldquo;I want 2 kg basmati rice delivered tomorrow&rdquo;
          </p>
        )}
        <ul className="space-y-2">
          {turns.map((t, i) => (
            <li
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                t.role === 'you'
                  ? 'ml-auto bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div>{t.text}</div>
              {t.meta && showMeta && (
                <div className="mt-1 text-[10px] text-gray-500">
                  {t.meta.stagesExecuted.length} stages · {t.meta.tokensUsed} tokens ·{' '}
                  {t.meta.durationMs} ms · intent={t.meta.intent}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
        <input
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          placeholder="Type a customer-style message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || input.trim() === ''}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowMeta((v) => !v)}>
          {showMeta ? 'Hide debug' : 'Debug'}
        </Button>
      </div>
    </div>
  );
}
