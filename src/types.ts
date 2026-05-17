export type DocumentInputPayload = {
  source_id: number;
  title: string;
  content: string;
  category: string;
  metadata?: any;
  embedding?: number[] | null;
};

export type NormalizedDocumentOk = {
  ok: true;
  data: DocumentInputPayload;
};

export type NormalizedDocumentErr = {
  ok: false;
  source_id: number;
  error: string;
};

export type NormalizedDocument =
  | NormalizedDocumentOk
  | NormalizedDocumentErr;

export type GetDocumentsQuery = {
  category?: string;
  sourceIds?: number[];
  search?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  limit?: string;
  offset?: string;
  orderBy?: string;
  order?: string;
};

export type GetBlockSuggestionsQuery = {
  limit?: string;
  offset?: string;
  order?: string;
  orderBy?: string;
  priority?: string;
  search?: string;
  sourceAgent?: string;
};
