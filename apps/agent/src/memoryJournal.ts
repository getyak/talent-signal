import type {
  AgentJournalEvent,
  AgentJournalOutput,
  AgentJournalStart,
  AgentRunJournal,
  AgentTerminalReceipt,
} from "./types.js";

export class MemoryAgentRunJournal implements AgentRunJournal {
  startRecord: AgentJournalStart | null = null;
  readonly events: AgentJournalEvent[] = [];
  readonly outputs: AgentJournalOutput[] = [];
  terminalReceipt: AgentTerminalReceipt | null = null;

  async start(input: AgentJournalStart): Promise<void> {
    if (this.startRecord && this.startRecord.scope.runID !== input.scope.runID) {
      throw new Error("A memory journal owns one run.");
    }
    this.startRecord ??= input;
  }

  async append(event: AgentJournalEvent): Promise<void> {
    const previous = this.events.at(-1);
    if (previous && event.sequence <= previous.sequence) {
      throw new Error("Journal sequence must increase monotonically.");
    }
    this.events.push(event);
  }

  async recordOutput(output: AgentJournalOutput): Promise<void> {
    this.outputs.push(output);
  }

  async complete(
    receipt: AgentTerminalReceipt,
  ): Promise<AgentTerminalReceipt> {
    if (this.terminalReceipt) {
      if (JSON.stringify(this.terminalReceipt) !== JSON.stringify(receipt)) {
        throw new Error("A run cannot have two different terminal receipts.");
      }
      return this.terminalReceipt;
    }
    this.terminalReceipt = receipt;
    return receipt;
  }
}
