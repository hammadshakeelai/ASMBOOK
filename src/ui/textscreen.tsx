import { useSignal } from '@preact/signals';
import { getFullOutput } from './store.js';

export function TextScreen() {
  const show = useSignal(true);
  const output = getFullOutput();

  return (
    <div class="text-screen-panel">
      <div class="section-header" onClick={() => { show.value = !show.value; }}>
        <span class="toggle">{show.value ? '▾' : '▸'}</span>
        Text Screen
      </div>
      {show.value && (
        <div class="text-screen">
          {output ? (
            <pre class="text-screen-content">{renderTextScreen(output)}</pre>
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
