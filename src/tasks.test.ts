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
//    missed;
//  - with no host at import but one appearing later, the first use registers;
//  - registering PULLS the input once (`request-task-input`), so a host send that
//    landed before the listener existed is replayed rather than lost.
export {}; // module scope — keep local names out of the shared-tsc global scope
import type { MockHost } from './testing';

type TasksMod = typeof import('./tasks');

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
      { type: 'request-task-input', data: {} },
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
    expect(host.sent).toEqual([
      { type: 'request-task-input', data: {} },
      { type: 'task-complete', data: { result: { ok: 1 } } },
    ]);
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

// The input is pulled, not raced. Before the poll existed, `task-input` was the one
// host→callee message with no replay: a production callee lost every host send of it
// while its delegated mount, which the app pulls, arrived.
describe('registration polls for the input (request-task-input)', () => {
  const polls = (host: MockHost): number => host.sent.filter((m) => m.type === 'request-task-input').length;

  it('a host present at import is polled exactly once, and repeated reads do not poll again', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install();
      tasks = require('./tasks');
    });
    expect(host.sent).toEqual([{ type: 'request-task-input', data: {} }]);
    tasks.getTaskInput();
    tasks.getTaskInput();
    expect(polls(host)).toBe(1);
  });

  it('the reply to the poll sets the input — a send that preceded the listener is not lost', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      // The host's first send happens before the SDK exists: nothing hears it.
      host.emit({ type: 'task-input', task: 'open-declared', params: { dir: 'content' } });
      host.install();
      tasks = require('./tasks');
    });
    expect(tasks.getTaskInput()).toBeNull();
    // The host answers the poll the way it answers any other: by sending the message again.
    expect(polls(host)).toBe(1);
    host.emit({ type: 'task-input', task: 'open-declared', params: { dir: 'content' } });
    expect(tasks.getTaskInput()).toEqual({ task: 'open-declared', params: { dir: 'content' } });
  });

  it('a host that appears after import is polled on first use, once', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      tasks = require('./tasks');
    });
    expect(polls(host)).toBe(0);
    host.install();
    tasks.getTaskInput();
    tasks.getTaskInput();
    expect(polls(host)).toBe(1);
  });

  it('a poll the transport refuses is reported once, leaves the listener registered, and is retried on the next read', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let realSend!: MockHost['transport']['sendMessage'];
      jest.isolateModules(() => {
        const { createMockHost } = require('./testing') as typeof import('./testing');
        host = createMockHost();
        realSend = host.transport.sendMessage;
        host.transport.sendMessage = () => {
          throw new Error('port closed');
        };
        host.install();
        tasks = require('./tasks');
      });
      expect(polls(host)).toBe(0);
      // The listener is up despite the failed poll: a host push still lands.
      host.emit({ type: 'task-input', task: 'pick-file', params: {} });
      expect(tasks.getTaskInput()).toEqual({ task: 'pick-file', params: {} });
      // That read retried the poll and failed again — still one warning, not two.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/task-input poll could not be sent/);
      // The transport recovers: the next read sends the poll, and later reads do not repeat it.
      host.transport.sendMessage = realSend;
      tasks.getTaskInput();
      tasks.getTaskInput();
      expect(polls(host)).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('a repeated delivery of the same input keeps the same object and does not re-notify; a changed one does', () => {
    let tasks!: TasksMod;
    let host!: MockHost;
    jest.isolateModules(() => {
      const { createMockHost } = require('./testing') as typeof import('./testing');
      host = createMockHost();
      host.install();
      tasks = require('./tasks');
    });
    const send = (params: Record<string, unknown>) => host.emit({ type: 'task-input', task: 'open-declared', params });
    send({ dir: 'content', view: { name: 'board' } });
    const first = tasks.getTaskInput();
    // The host's later sends of the same input: past the compile edges, and the poll's answer.
    send({ dir: 'content', view: { name: 'board' } });
    send({ dir: 'content', view: { name: 'board' } });
    expect(tasks.getTaskInput()).toBe(first);
    send({ dir: 'content', view: { name: 'wiki' } });
    expect(tasks.getTaskInput()).not.toBe(first);
    expect(tasks.getTaskInput()).toEqual({ task: 'open-declared', params: { dir: 'content', view: { name: 'wiki' } } });
    // A different task with the same params is a different input.
    const second = tasks.getTaskInput();
    host.emit({ type: 'task-input', task: 'pick-file', params: { dir: 'content', view: { name: 'wiki' } } });
    expect(tasks.getTaskInput()).not.toBe(second);
  });
});
