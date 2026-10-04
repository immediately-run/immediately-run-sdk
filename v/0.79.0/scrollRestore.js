import "./chunk-VHAA22YE.js";
const RESTORE_DEADLINE_MS = 900;
const RESTORE_EPSILON_PX = 2;
const nextRestoreAction = (sample) => {
  const { target, scrollHeight, clientHeight, current, elapsedMs, userScrolled } = sample;
  if (!Number.isFinite(target) || target <= 0) return "abandon";
  if (userScrolled) return "abandon";
  if (Math.abs(current - target) <= RESTORE_EPSILON_PX) return "apply";
  if (elapsedMs >= RESTORE_DEADLINE_MS) return "abandon";
  const reachable = Math.max(0, scrollHeight - clientHeight);
  return reachable >= target ? "apply" : "wait";
};
export {
  RESTORE_DEADLINE_MS,
  RESTORE_EPSILON_PX,
  nextRestoreAction
};
//# sourceMappingURL=scrollRestore.js.map