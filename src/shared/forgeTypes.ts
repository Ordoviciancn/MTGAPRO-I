export type ForgePrompt = {
  seat: number;
  requestId: string;
  kind: 'input' | 'choice' | 'order' | 'number' | 'sideboard' | 'unsupported';
  message: string;
  inputType?:string;
  options?: { value: number; label: string }[];
  initialMainSize?: number;
  min?: number;
  max?: number;
  okEnabled?: boolean;
  cancelEnabled?: boolean;
  okLabel?: string;
  cancelLabel?: string;
};

export type ForgeDecision = {
  type: 'ok' | 'cancel' | 'selectCard' | 'selectPlayer' | 'choice';
  requestId: string;
  cardId?: number;
  playerId?: number;
  value?: number | number[];
};
