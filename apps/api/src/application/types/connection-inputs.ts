export interface RegisterConnectionInput {
  readonly userId: string;
  readonly connectionId: string;
}

export interface DeregisterConnectionInput {
  readonly userId: string;
  readonly connectionId: string;
}

export interface IssueConnectionTicketInput {
  readonly userId: string;
}

export interface RedeemConnectionTicketInput {
  readonly ticket: string;
}

export interface PublishTranscriptionUpdateInput {
  readonly userId: string;
  readonly transcriptionId: string;
}
