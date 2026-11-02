import type { TimelineDocument, TimelineOperation } from '@editor-video/timeline';

export type ProjectPayload = {
  id: string;
  title: string;
  state: string;
  formats: string[];
  briefing: string | null;
  legacyReadOnly: boolean;
  currentRevisionId: string | null;
  channel: { id: string; name: string; slug: string };
  currentRevision: { number: number } | null;
  timeline: TimelineDocument | null;
};

export type Deliverable = {
  id: string;
  kind: 'PREVIEW' | 'FINAL' | 'COVER' | 'CAPTIONS' | 'RESOLVE_PACKAGE';
  state: string;
  revisionId: string | null;
  variantId: string | null;
  storageKey: string | null;
  sha256: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  validationJson: { ok?: boolean; checks?: Array<{ id: string; status: string; message: string }>; limitations?: Array<{ itemId: string; kind: string; reason: string }> } | null;
  createdAt: string;
  revision: { number: number } | null;
  approvals: Array<{ id: string; decision: string; createdAt: string; socialAccountId: string | null }>;
};

export type StudioApi = {
  doc: TimelineDocument;
  readOnly: boolean;
  /** Aplica operações como nova revisão (expectedRevisionId = revisão exibida). */
  apply: (ops: TimelineOperation[], summary: string) => Promise<boolean>;
  reload: () => Promise<void>;
  playhead: number;
  seek: (frame: number) => void;
  selection: string[];
  select: (ids: string[]) => void;
  variantId: string | null;
};

export const fileUrl = (key: string) => `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
