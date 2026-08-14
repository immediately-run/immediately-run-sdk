import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
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
  pushType: "form-factor",
  requestType: "request-form-factor",
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