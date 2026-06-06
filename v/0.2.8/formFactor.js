import { useEffect, useState } from "react";
const formFactorService = () => {
  return module.evaluation.module.bundler.formFactor;
};
const getFormFactor = () => formFactorService().getFormFactor();
const onFormFactorChange = (listener) => {
  const disposable = formFactorService().onChange(listener);
  return () => disposable.dispose();
};
const useFormFactor = () => {
  const [ff, setFf] = useState(getFormFactor);
  useEffect(() => onFormFactorChange(setFf), []);
  return ff;
};
export {
  getFormFactor,
  onFormFactorChange,
  useFormFactor
};
//# sourceMappingURL=formFactor.js.map