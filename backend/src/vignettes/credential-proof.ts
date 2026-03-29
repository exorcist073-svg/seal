import SEALFluenceAgent, { TEEInput } from '../agent.js';

/**
 * Demo Vignette 3: Credential-Proof Scenario
 * 
 * Scenario: An agent needs to prove it has valid API credentials
 * without exposing the actual keys. Uses Lit Protocol vault + TEE attestation.
 */
export class CredentialProofDemo {
  private agent: SEALFluenceAgent;

  constructor(agentId: string, anthropicApiKey: string, geminiApiKey?: string) {
    this.agent = new SEALFluenceAgent(agentId, anthropicApiKey, geminiApiKey);
  }

  async runDemo(
    serviceName: string,
    requiredPermission: string
  ): Promise<{
    proofId: string;
    credentialAttestation: any;
    accessProof: any;
    litConditions: any;
  }> {
    
    console.log('\n=== DEMO VIGNETTE 3: Credential-Proof ===\n');

    const proofId = `cred-${Date.now()}`;

    // STEP 1: Agent proves credential access in TEE
    console.log('STEP 1: Agent accesses credentials in TEE');
    
    // In real implementation, Lit Protocol provides encrypted credentials
    // The agent accesses them inside TEE, proves access without exposing keys
    
    const credentialInput: TEEInput = {
      taskId: proofId,
      agentId: this.agent.getAgentId(),
      nonce: 1,
      onChainState: {
        litProtocol: {
          credentialVault: 'storacha://vault/credentials',
          accessConditions: {
            service: serviceName,
            permission: requiredPermission,
            agentRegistry: this.agent.getAgentId()
          }
        }
      },
      externalData: {
        credentialProof: 'lit-access-granted',
        credentialHash: '0x' + 'a'.repeat(64), // Hash of actual cred (not exposed)
        serviceEndpoint: `https://api.${serviceName}.com/v1`
      },
      timestamp: Date.now()
    };

    const systemPrompt = `You are an agent proving credential access.
You have accessed encrypted credentials from Lit Protocol vault inside the TEE.
Prove you have the required permissions without exposing the actual credentials.

Output JSON with:
{
  "reasoning": "Proof of credential access",
  "executionPlan": {
    "action": "prove_credential_access",
    "service": "service name",
    "permission": "permission level",
    "proof": "attestation that credentials were accessed in TEE",
    "credentialHash": "hash of credentials (not the actual keys)"
  }
}`;

    const reasoning = await this.agent.reasonInTEE(credentialInput, systemPrompt);
    const { attestation, commitment } = await this.agent.commitAndAttest(
      credentialInput,
      reasoning
    );

    console.log('  Credential access attested in TEE');
    console.log('  Attestation hash:', attestation.reasoningHash);

    // STEP 2: Generate access proof
    console.log('\nSTEP 2: Generate access proof for service');
    
    const { txData, executionAttestation } = await this.agent.executeInTEE(
      credentialInput,
      reasoning,
      attestation
    );

    const accessProof = {
      proofId,
      agentId: this.agent.getAgentId(),
      service: serviceName,
      permission: requiredPermission,
      credentialHash: credentialInput.externalData.credentialHash,
      attestationQuote: attestation.teeQuote,
      executionHash: executionAttestation.executionHash,
      timestamp: Date.now()
    };

    console.log('  Access proof generated');
    console.log('  Can call service with proof instead of API key');

    // STEP 3: Lit Protocol conditions for reveal
    console.log('\nSTEP 3: Lit Protocol access conditions');
    
    const litConditions = {
      chain: 'ethereum',
      method: 'eth_getBalance',
      params: [':userAddress', 'latest'],
      returnValueTest: {
        comparator: '>=',
        value: '0'
      },
      // Additional conditions for credential reveal
      revealConditions: {
        authorizedStakers: ['0xStaker1', '0xStaker2'],
        authorizedAuditors: ['0xRegulator'],
        multisigThreshold: 2,
        timelockHours: 24
      }
    };

    console.log('  Lit conditions set');
    console.log('  Stakers can request reveal with multisig');

    console.log('\n=== Credential-Proof Demo Complete ===');
    console.log('Proof ID:', proofId);
    console.log('Agent proved credential access without exposing keys');
    console.log('Service can verify proof via attestation quote');

    return {
      proofId,
      credentialAttestation: attestation,
      accessProof,
      litConditions
    };
  }
}

export default CredentialProofDemo;
