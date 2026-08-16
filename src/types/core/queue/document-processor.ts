export interface DocumentProcessingMessage {
  userId?: string;
  documentId?: string;
}

export interface DocumentProcessingQueueEvent {
  Records?: { body?: string }[];
}
