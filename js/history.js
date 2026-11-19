const LIMIT = 80;

function clone(value) {
  return structuredClone(value);
}

function touch(study) {
  return { ...study, updatedAt: new Date().toISOString() };
}

export function createHistory(study) {
  return { past: [], present: clone(study), future: [] };
}

export function commit(history, next) {
  return {
    past: history.past.concat(clone(history.present)).slice(-LIMIT),
    present: touch(clone(next)),
    future: [],
  };
}

/** Remember the current study once, before a burst of typing replaces it. */
export function checkpoint(history) {
  return {
    past: history.past.concat(clone(history.present)).slice(-LIMIT),
    present: history.present,
    future: [],
  };
}

export function replacePresent(history, next) {
  return { ...history, present: touch(clone(next)) };
}

export function undo(history) {
  if (!history.past.length) return history;
  const present = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present,
    future: [clone(history.present), ...history.future].slice(0, LIMIT),
  };
}

export function redo(history) {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  return {
    past: history.past.concat(clone(history.present)).slice(-LIMIT),
    present,
    future,
  };
}

export function canUndo(history) {
  return history.past.length > 0;
}

export function canRedo(history) {
  return history.future.length > 0;
}
