export type Command = {
  protocolVersion: 1;
  matchId: string;
  playerId: string;
  commandId: string;
  expectedRevision: number;
  operation: string;
  parameters: Record<string, unknown>;
};

export type CommandReceipt = {
  commandId: string;
  revision: number;
  status: 'accepted' | 'rejected' | 'resync';
  code?: 'identity' | 'protocol' | 'conflict' | 'expired' | 'capacity' | 'engine';
};
