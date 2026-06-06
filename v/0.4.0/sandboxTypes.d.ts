type ModuleExports = any;
type EvaluationContext = {
    exports: ModuleExports;
    dynamicImport: (moduleToImport: string, symbolToImport: string) => Promise<ModuleExports>;
    getModuleEvaluationContext: (moduleName: string) => Promise<EvaluationContext>;
    resolve: (moduleName: string) => Promise<string>;
    evaluation: {
        module: {
            source: string;
            filepath: string;
        };
    };
};
type Metadata = Record<string, any>;
type FilesMetadata = Record<string, Metadata>;
type FileQueryResult = string[];
type MetadataQueryFunction = (filesMetadata: FilesMetadata) => FileQueryResult;
type MetadataQueryResult = {
    result: FileQueryResult;
} | {
    error: any;
};

export type { EvaluationContext, FileQueryResult, FilesMetadata, Metadata, MetadataQueryFunction, MetadataQueryResult, ModuleExports };
