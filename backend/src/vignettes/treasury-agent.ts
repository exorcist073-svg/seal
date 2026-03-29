import SEALFluenceAgent, { TEEInput } from '../agent.js';

/**
 * Demo Vignette 1: DAO Treasury Agent
 * 
 * Scenario: A DAO treasury agent monitors on-chain state and proposes
 * rebalancing trades. The agent reasons inside TEE, commits reasoning hash,
 * executes after staker approval, and allows selective reveal.
 */
export class TreasuryAgentDemo {
  private agent: SEALFluenceAgent;

  constructor(agentId: string, anthropicApiKey: string, geminiApiKey?: string) {
    this.agent = new SEALFluenceAgent(agentId, anthropicApiKey, geminiApiKey);
  }

  async runDemo(
    daoAddress: string,
    currentHoldings: Record<string, number>,
    marketConditions: Record<string, any>
  ): Promise<{
    taskId: string;
    inputHash: string;
    reasoningHash: string;
    commitment: any;
    execution: any;
  }> {
    
    console.log('\n=== DEMO VIGNETTE 1: Treasury Agent ===\n');

    // Stage 01-02: Prepare inputs and attest
    const taskId = `treasury-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const input: TEEInput = {
      taskId,
      agentId: this.agent.getAgentId(),
      nonce: 1,
      onChainState: {
        daoAddress,
        treasuryBalance: currentHoldings,
        lastRebalanceTime: Date.now() - 86400000,
        stakerApprovalThreshold: 0.51
      },
      externalData: {
        ethPrice: marketConditions.ethPrice,
        usdcPrice: marketConditions.usdcPrice,
        volatilityIndex: marketConditions.volatility,
        gasPrice: marketConditions.gasPrice
      },
      timestamp: Date.now()
    };

    console.log('Stage 01: Input attestation');
    console.log('  Input hash:', this.agent.hashInputs(input));

    // Stage 02: Reason in TEE
    console.log('\nStage 02: Reasoning in TEE (calling Claude)...');
    
    const systemPrompt = `You are a DAO treasury management agent. 
Your job is to analyze treasury holdings and market conditions, 
then decide on rebalancing actions.

Rules:
- Maintain 30% ETH, 70% stablecoins as target allocation
- Only rebalance if deviation > 5%
- Consider gas costs vs rebalancing value
- Never hold more than 50% in any single asset

Output JSON with:
{
  "reasoning": "detailed explanation of analysis",
  "executionPlan": {
    "action": "rebalance|hold",
    "trades": [{"from": "ETH", "to": "USDC", "amount": "0.5"}],
    "expectedOutcome": "description"
  }
}`;

    const reasoning = await this.agent.reasonInTEE(input, systemPrompt);
    console.log('  LLM reasoning complete');
    console.log('  Execution plan:', JSON.parse(reasoning.reasoningBlob).executionPlan);

    // Stage 03: Commit + Attest
    console.log('\nStage 03: Generating attestation...');
    const { attestation, commitment } = await this.agent.commitAndAttest(input, reasoning);
    
    console.log('  Merkle root:', commitment.merkleRoot);
    console.log('  Attestation quote (first 64 chars):', attestation.teeQuote.slice(0, 64) + '...');
    console.log('  Nonce:', commitment.nonce);

    // Stage 04: Execute in TEE
    console.log('\nStage 04: Preparing execution...');
    const { txData, executionAttestation } = await this.agent.executeInTEE(
      input,
      reasoning,
      attestation
    );
    
    console.log('  Transaction data:', txData);
    console.log('  Execution hash:', executionAttestation.executionHash);

    // Summary
    console.log('\n=== Treasury Agent Demo Complete ===');
    console.log('Task ID:', taskId);
    console.log('Input hash:', reasoning.inputHash);
    console.log('Reasoning hash:', attestation.reasoningHash);
    console.log('Commitment root:', commitment.merkleRoot);

    return {
      taskId,
      inputHash: reasoning.inputHash,
      reasoningHash: attestation.reasoningHash,
      commitment,
      execution: { txData, executionAttestation }
    };
  }
}

export default TreasuryAgentDemo;
