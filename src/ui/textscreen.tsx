import { useSignal } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import { getFullOutput } from './store.js';

export function TextScreen() {
  const show = useSignal(true);
  const output = getFullOutput();
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (show.value && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output, show.value]);

  return (
    <div class="text-screen-panel">
      <div class="section-header" onClick={() => { show.value = !show.value; }}>
        <span class="toggle">{show.value ? '▾' : '▸'}</span>
        Text Screen
      </div>
      {show.value && (
        <div class="text-screen">
          {output ? (
            <>
              <pre class="text-screen-content">{renderTextScreen(output)}</pre>
              <div ref={endRef} />
            </>
          ) : (
            <pre class="text-screen-content text-screen-empty">{'(no output)'}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Render text screen output, handling CR/LF and basic control chars. */
function renderTextScreen(text: string): string {
  // Replace \r\n with \n, then \r alone with \n
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
