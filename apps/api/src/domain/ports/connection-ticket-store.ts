export interface ConnectionTicketStore {
  issue(input: { ticket: string; userId: string; expiresAt: Date }): Promise<void>;
  redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null>;
}
