import { useEffect, useState } from "react";
const authService = () => {
  return module.evaluation.module.bundler.auth;
};
const getAuthState = () => authService().getState();
const onAuthChange = (listener) => {
  const disposable = authService().onChange(listener);
  return () => disposable.dispose();
};
const useAuth = () => {
  const [state, setState] = useState(getAuthState);
  useEffect(() => onAuthChange(setState), []);
  return state;
};
export {
  getAuthState,
  onAuthChange,
  useAuth
};
//# sourceMappingURL=auth.js.map