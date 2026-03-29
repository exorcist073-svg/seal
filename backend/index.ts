import SEALFluenceAgent from './src/agent.js';
import { TreasuryAgentDemo } from './src/vignettes/treasury-agent.js';
import { AgentToAgentDemo } from './src/vignettes/agent-to-agent.js';
import { CredentialProofDemo } from './src/vignettes/credential-proof.js';
import ContractIntegration, { SEAL_CONTRACT_ABI } from './src/contract-integration.js';

/**
 * SEAL Fluence TEE Runtime - Main Entry Point
 * 
 * Dev B: TEE Runtime + Attestation
 * Uses Fluence decentralized compute instead of AWS Nitro
 */

export {
  SEALFluenceAgent,
  TreasuryAgentDemo,
  AgentToAgentDemo,
  CredentialProofDemo,
  ContractIntegration,
  SEAL_CONTRACT_ABI
};

// CLI runner for demo vignettes
if (import.meta.url === `file://${process.argv[1]}`) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'demo-key';
  
  async function runAllDemos() {
    console.log('\n🦭 SĒAL Fluence TEE Runtime\n');
    
    // Demo 1: Treasury Agent
    const treasuryDemo = new TreasuryAgentDemo('treasury-agent-001', ANTHROPIC_API_KEY);
    await treasuryDemo.runDemo(
      '0xDAO123',
      { ETH: 45, USDC: 55 },
      { ethPrice: 3200, usdcPrice: 1, volatility: 0.15, gasPrice: 20 }
    );
    
    // Demo 2: Agent-to-Agent
    const a2aDemo = new AgentToAgentDemo(
      'client-agent-001',
      'worker-agent-001',
      ANTHROPIC_API_KEY
    );
    await a2aDemo.runDemo(
      'Analyze market trends for Q1 2026',
      '0.5 ETH'
    );
    
    // Demo 3: Credential Proof
    const credDemo = new CredentialProofDemo('cred-agent-001', ANTHROPIC_API_KEY);
    await credDemo.runDemo(
      'openai-api',
      'gpt-4-access'
    );
    
    console.log('\n✅ All demos complete\n');
  }

  runAllDemos().catch(console.error);
}
