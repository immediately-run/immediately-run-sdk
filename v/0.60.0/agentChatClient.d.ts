import { ModelClient } from './agentLoop.js';
import './agentSteering.js';

/** A {@link ModelClient} over the host `llm.chat` slot. Streams text deltas (forwarded
 * to `onTextDelta`) and assembles tool calls; the resolved provider + model are the
 * user's preference, never named here. Requires the `llm:chat` capability. */
declare function createChatModelClient(): ModelClient;

export { createChatModelClient };
