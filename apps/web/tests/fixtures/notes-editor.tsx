import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StackEditNotesEditor } from '../../src/components/StackEditNotesEditor';
import '../../src/styles.css';
const state = window as any;
state.commits = [];
state.failSave = false;
state.saveDelay = 0;
function Harness() {
  const [value, setValue] = useState(localStorage.getItem('notes') ?? '**Hello**');
  return <StackEditNotesEditor value={value} onChange={setValue} onBusyChange={busy => { state.busy = busy; }} onCommit={async text => {
    state.commits.push(text);
    await new Promise(resolve => setTimeout(resolve, state.saveDelay));
    if (state.failSave) throw new Error('Save failed');
    localStorage.setItem('notes', text);
  }} />;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness /></React.StrictMode>);
