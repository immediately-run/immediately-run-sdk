// R3-421 — `sdk/tasks` must be importable OFF-HOST (plain `vite dev`, node/jsdom):
// the TASK_INPUT registration used to run at module evaluation and THROW "no host
// transport", taking down any app that statically imported the subpath outside a
// sandbox. These tests pin the new contract, through the REAL §4 transport path
// (createMockHost), not a sandboxUtils mock — module-eval timing is the subject:
//
//  - importing with no host present throws nothing, and the whole callee surface
//    degrades (null input, no-op complete/cancel, invokeTask rejects);
//  - with a host present at import, the listener is registered EAGERLY at module
//    eval — a `task-input` delivered before the app touches any task API is not
//    missed (there is no replay/poll for `task-input` on the wire, so first-use
//    registration would lose it);
//  - with no host at import but one appearing later, the first use registers.
export {}; // module scope — keep local names out of the shared-tsc global scope
import type { MockHost } from './testing';

type TasksMod = typeof import('./tasks');

const freshRequire = (): { tasks: TasksMod; host: () => MockHost } => {
  let mod!: TasksMod;
  let createMockHost!: typeof import('./testing').createMockHost;
  jest.isolateModules(() => {
    createMockHost = require('./testing').createMockHost;
    mod = require('./tasks');
  });
  return { tasks: mod, host: () => createMockHost() };
};

afterEach(() => {
  delete (globalThis as { __immediatelyRun__?: unknown }).__immediatelyRun__;
});

describe('off-host (no transport at all)', () => {
  it('importing the module does not throw, and the callee surface degrades', () => {
    let tasks!: TasksMod;
    expect(() => {
      jest.isolateModules(() => {
        tasks = require('./tasks');
      });
    }).not.toThrow();
    expect(tasks.getTaskInput()).toBeNull();
    // Documented no-ops — there is no caller to answer.
    expect(() => tasks.completeTask({ ok: 1 })).not.toThrow();
    expect(() => tasks.cancelTask()).not.toThrow();
  });

  it('invokeTask rejects (there is no host to resolve the binding)', async () => {
    let tasks!: TasksMod;
    jest.isolateModules(() => {
      tasks = require('./tasks');
    });
    await expect(tasks.invokeTask('edit-file', {})).rejects.toThrow(/no host transport/);
  });
});

describe('on-host (transport present at module eval)', () => {
  it('registers the task-input listener EAGERLY: an input delivered before any task API call is kept', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install(); // host transport exists BEFORE the module evaluates
      tasks = require('./tasks');
    });
    // No tasks API has been touched yet — this is the "input arrives right after
    // boot, before first render" window the eager registration exists for.
    host.emit({ type: 'task-input', task: 'edit-file', params: { file: 'x' } });
    expect(tasks.getTaskInput()).toEqual({ task: 'edit-file', params: { file: 'x' } });
  });

  it('completeTask / cancelTask reach the host', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install();
      tasks = require('./tasks');
    });
    tasks.completeTask({ done: true });
    tasks.cancelTask();
    expect(host.sent).toEqual([
      { type: 'task-complete', data: { result: { done: true } } },
      { type: 'task-cancel', data: {} },
    ]);
  });

  it('a missing params field defaults to {}', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install();
      tasks = require('./tasks');
    });
    host.emit({ type: 'task-input', task: 'pick-file' });
    expect(tasks.getTaskInput()).toEqual({ task: 'pick-file', params: {} });
  });
});

// ── the send failure a host DOES hear about (review of R3-421) ───────────────
// The off-host no-op above must mean exactly "there is nobody to answer". A blanket
// try/catch also swallowed a real failure against a real host — the usual one being a
// `DataCloneError` because the result holds a DOM node or a function — which left the
// host never told the task finished and the CALLER hanging to its `invokeTask`
// deadline with no diagnostic anywhere.
describe('on-host, a failed send surfaces (it is not the off-host no-op)', () => {
  const onHost = (): { tasks: TasksMod; host: MockHost } => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install();
      tasks = require('./tasks');
    });
    return { tasks, host };
  };

  /** What a browser throws when a postMessage payload holds a DOM node or a function. */
  const dataCloneError = (): Error => {
    const e = new Error("Failed to execute 'postMessage': an object could not be cloned.");
    e.name = 'DataCloneError';
    return e;
  };

  it('completeTask throws when the host is there and the send fails', () => {
    const { tasks, host } = onHost();
    host.transport.sendMessage = () => {
      throw dataCloneError();
    };
    expect(() => tasks.completeTask({ node: 'a DOM node in disguise' })).toThrow(/could not be cloned/);
  });

  it('cancelTask throws too — it shares the shape', () => {
    const { tasks, host } = onHost();
    host.transport.sendMessage = () => {
      throw dataCloneError();
    };
    expect(() => tasks.cancelTask()).toThrow(/could not be cloned/);
  });

  it('a cloneable result still just sends (no behaviour change on the happy path)', () => {
    const { tasks, host } = onHost();
    tasks.completeTask({ ok: 1 });
    expect(host.sent).toEqual([{ type: 'task-complete', data: { result: { ok: 1 } } }]);
  });
});

describe('host appears after import (dev-server-injected substrate, late boot)', () => {
  it('the first use registers the listener and later inputs are received', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      tasks = require('./tasks'); // module eval with NO host — registration deferred
    });
    host.install();
    expect(tasks.getTaskInput()).toBeNull(); // first use — registers on the new host
    host.emit({ type: 'task-input', task: 'edit-file', params: {} });
    expect(tasks.getTaskInput()).toEqual({ task: 'edit-file', params: {} });
  });
});
