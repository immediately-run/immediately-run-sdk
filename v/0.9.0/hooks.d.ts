import { Metadata, MetadataQueryFunction, MetadataQueryResult } from './sandboxTypes.js';

declare const useMetadataQuery: (queryFunction: MetadataQueryFunction) => MetadataQueryResult | null;
declare const useFileMetadata: (path: string) => Metadata | null;

export { useFileMetadata, useMetadataQuery };
