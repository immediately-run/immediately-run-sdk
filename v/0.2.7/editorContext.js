import { useEffect, useState } from "react";
const editorContextService = () => {
  return module.evaluation.module.bundler.editorContext;
};
const getEditorContext = () => editorContextService().getContext();
const onEditorContextChange = (listener) => {
  const disposable = editorContextService().onChange(listener);
  return () => disposable.dispose();
};
const useEditorContext = () => {
  const [context, setContext] = useState(getEditorContext);
  useEffect(() => onEditorContextChange(setContext), []);
  return context;
};
export {
  getEditorContext,
  onEditorContextChange,
  useEditorContext
};
//# sourceMappingURL=editorContext.js.map