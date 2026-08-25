import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { FORM_FACTOR, REQUEST_FORM_FACTOR } from "./generated/protocol";
const DEFAULT_FORM_FACTOR = {
  class: "desktop",
  orientation: "landscape",
  width: 1280,
  height: 800
};
const isFormFactor = (v) => {
  const f = v;
  return !!f && (f.class === "mobile" || f.class === "tablet" || f.class === "desktop") && (f.orientation === "portrait" || f.orientation === "landscape") && typeof f.width === "number" && typeof f.height === "number";
};
const channel = createPushChannel({
  pushType: FORM_FACTOR,
  requestType: REQUEST_FORM_FACTOR,
  initial: DEFAULT_FORM_FACTOR,
  parse: (msg) => isFormFactor(msg.formFactor) ? msg.formFactor : void 0
});
const getFormFactor = () => channel.get();
const onFormFactorChange = (listener) => channel.onChange(listener);
const useFormFactor = () => channel.use();
export {
  getFormFactor,
  onFormFactorChange,
  useFormFactor
};
//# sourceMappingURL=formFactor.js.map