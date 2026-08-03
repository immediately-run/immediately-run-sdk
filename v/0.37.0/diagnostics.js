import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
const EMPTY = { buildErrors: [], consoleEntries: [], provenance: null };
const channel = createPushChannel({
  pushType: "diagnostics",
  requestType: "request-diagnostics",
  initial: EMPTY,
  parse: (msg) => {
    if (!Array.isArray(msg.buildErrors) || !Array.isArray(msg.consoleEntries)) return void 0;
    const provenance = msg.provenance && typeof msg.provenance === "object" ? msg.provenance : null;
    return {
      buildErrors: msg.buildErrors,
      consoleEntries: msg.consoleEntries,
      provenance
    };
  }
});
const getDiagnostics = () => channel.get();
const onDiagnosticsChange = (listener) => channel.onChange(listener);
const useDiagnostics = () => channel.use();
export {
  getDiagnostics,
  onDiagnosticsChange,
  useDiagnostics
};
//# sourceMappingURL=diagnostics.js.map