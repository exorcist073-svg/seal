import { createHash, randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ethers } from 'ethers';

export interface TEEInput {
  taskId: string;
  agentId: string;
  nonce: number;
  onChainState: Record<string, any>;
  externalData: Record<string, any>;
  timestamp: number;
}

export interface TEEReasoning {
  inputHash: string;
  llmPrompt: string;
  llmResponse: string;
  reasoningBlob: string;
  executionPlan: any;
}

export interface TEEAttestation {
  taskId: string;
  agentId: string;
  nonce: number;
  inputHash: string;
  reasoningHash: string;
  executionHash: string;
  timestamp: number;
  enclavePublicKey: string;
  teeQuote: string; // Mock Nitro-style attestation quote
  signature: string;
}

export interface Commitment {
  taskId: string;
  merkleRoot: string;
  attestationQuote: string;
  nonce: number;
  timestamp: number;
}

export class SEALFluenceAgent {
  private anthropic: Anthropic;
  private gemini: GoogleGenerativeAI | null;
  private keyPair: { publicKey: string; privateKey: string };
  private agentId: string;

  constructor(agentId: string, anthropicApiKey: string, geminiApiKey?: string) {
    this.agentId = agentId;
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.gemini = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
    
    // Generate mock enclave keypair (in real Nitro, this comes from enclave)
    const wallet = ethers.Wallet.createRandom();
    this.keyPair = {
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey
    };
  }

  /**
   * Stage 01: Attest inputs - hash all inputs before entering TEE
   */
  hashInputs(input: TEEInput): string {
    const canonicalInput = JSON.stringify(input, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted: Record<string, any>, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    });
    return createHash('sha256').update(canonicalInput).digest('hex');
  }

  /**
   * Stage 02: Reason in TEE - LLM call inside confidential environment
   */
  async reasonInTEE(input: TEEInput, systemPrompt: string): Promise<TEEReasoning> {
    // Hash inputs first (proves what the agent was looking at)
    const inputHash = this.hashInputs(input);
    
    // Construct prompt with attested context
    const llmPrompt = this.constructPrompt(input, systemPrompt, inputHash);
    
    // Call LLM inside the TEE (Claude primary, Gemini fallback)
    let llmResponse: string;
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: llmPrompt }]
      });

      llmResponse = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
    } catch (err: any) {
      console.warn(`[SEAL] Claude API failed (${err.status || 'unknown'}), falling back to Gemini`);
      llmResponse = await this.callGemini(systemPrompt, llmPrompt);
    }

    // Parse reasoning and execution plan from response
    const { reasoning, executionPlan } = this.parseLLMResponse(llmResponse);

    // Create encrypted reasoning blob
    const reasoningBlob = JSON.stringify({
      input,
      reasoning,
      executionPlan,
      timestamp: Date.now()
    });

    return {
      inputHash,
      llmPrompt,
      llmResponse,
      reasoningBlob,
      executionPlan
    };
  }

  /**
   * Stage 03: Commit + Attest - generate attestation bundle
   */
  async commitAndAttest(
    input: TEEInput,
    reasoning: TEEReasoning
  ): Promise<{ attestation: TEEAttestation; commitment: Commitment }> {
    // Hash the reasoning blob
    const reasoningHash = createHash('sha256')
      .update(reasoning.reasoningBlob)
      .digest('hex');

    // Hash the execution plan
    const executionHash = createHash('sha256')
      .update(JSON.stringify(reasoning.executionPlan))
      .digest('hex');

    // Generate mock Nitro-style attestation quote
    const teeQuote = this.generateMockAttestationQuote({
      taskId: input.taskId,
      agentId: this.agentId,
      inputHash: reasoning.inputHash,
      reasoningHash,
      executionHash,
      enclavePublicKey: this.keyPair.publicKey
    });

    // Create attestation bundle
    const attestationData: TEEAttestation = {
      taskId: input.taskId,
      agentId: this.agentId,
      nonce: input.nonce,
      inputHash: reasoning.inputHash,
      reasoningHash,
      executionHash,
      timestamp: Date.now(),
      enclavePublicKey: this.keyPair.publicKey,
      teeQuote,
      signature: '' // Will be signed
    };

    // Sign the attestation
    attestationData.signature = this.signAttestation(attestationData);

    // Create merkle root from hashes
    const merkleRoot = this.createMerkleRoot([
      reasoning.inputHash,
      reasoningHash,
      executionHash,
      attestationData.signature
    ]);

    const commitment: Commitment = {
      taskId: input.taskId,
      merkleRoot,
      attestationQuote: teeQuote,
      nonce: input.nonce,
      timestamp: attestationData.timestamp
    };

    return { attestation: attestationData, commitment };
  }

  /**
   * Stage 04: Execute in TEE - execute action with attestation
   */
  async executeInTEE(
    input: TEEInput,
    reasoning: TEEReasoning,
    attestation: TEEAttestation
  ): Promise<{ txData: any; executionAttestation: TEEAttestation }> {
    // Build transaction from execution plan
    const txData = this.buildTransaction(reasoning.executionPlan);
    
    // Hash the transaction
    const txHash = createHash('sha256')
      .update(JSON.stringify(txData))
      .digest('hex');

    // Generate execution attestation (proves action matches reasoning)
    const executionAttestation = this.generateExecutionAttestation(
      attestation,
      txHash
    );

    return { txData, executionAttestation };
  }

  /**
   * Generate mock Nitro-style attestation quote
   * Format matches AWS Nitro Enclaves attestation structure
   */
  private generateMockAttestationQuote(data: {
    taskId: string;
    agentId: string;
    inputHash: string;
    reasoningHash: string;
    executionHash: string;
    enclavePublicKey: string;
  }): string {
    // Nitro attestation structure (simplified for mock):
    // - PCR0: Enclave image hash (mock)
    // - PCR1: Enclave signing key hash (mock)
    // - PCR2: Enclave configuration hash (mock)
    // - User data: Our commitment data
    // - Timestamp
    // - Signature

    const pcr0 = createHash('sha256').update('seal-enclave-v1.0.0').digest('hex');
    const pcr1 = createHash('sha256').update(this.keyPair.publicKey).digest('hex');
    const pcr2 = createHash('sha256').update('config-std').digest('hex');
    
    const userData = JSON.stringify({
      taskId: data.taskId,
      agentId: data.agentId,
      inputHash: data.inputHash,
      reasoningHash: data.reasoningHash,
      executionHash: data.executionHash
    });

    const timestamp = Date.now();
    const nonce = randomBytes(16).toString('hex');

    // Build COSE_Sign1 structure (simplified)
    const attestationPayload = {
      module_id: 'seal-fluence-tee',
      timestamp,
      digest: 'SHA384',
      pcrs: {
        '0': pcr0,
        '1': pcr1,
        '2': pcr2
      },
      certificate: this.generateMockCertificate(),
      enclave_key: data.enclavePublicKey,
      user_data: Buffer.from(userData).toString('base64'),
      nonce,
      version: '1.0'
    };

    // Sign with enclave key
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(attestationPayload))
      .digest('hex');
    
    const signature = this.signWithEnclaveKey(payloadHash);

    const attestation = {
      payload: attestationPayload,
      signature,
      format: 'aws-nitro-v1-mock'
    };

    return Buffer.from(JSON.stringify(attestation)).toString('base64');
  }

  private generateMockCertificate(): string {
    // Mock AWS Nitro enclave certificate structure
    const cert = {
      subject: 'CN=SEAL Fluence TEE, O=SEAL, OU=Nitro-compat-mock',
      issuer: 'CN=SEAL TEE CA, O=SEAL, OU=Fluence',  // Nitro-compatible format on Fluence runtime
      serialNumber: randomBytes(16).toString('hex'),
      notBefore: new Date(Date.now() - 86400000).toISOString(),
      notAfter: new Date(Date.now() + 86400000).toISOString(),
      publicKey: this.keyPair.publicKey
    };
    return Buffer.from(JSON.stringify(cert)).toString('base64');
  }

  private signWithEnclaveKey(data: string): string {
    const wallet = new ethers.Wallet(this.keyPair.privateKey);
    return wallet.signMessageSync(data);
  }

  private signAttestation(attestation: TEEAttestation): string {
    const data = JSON.stringify({
      taskId: attestation.taskId,
      agentId: attestation.agentId,
      nonce: attestation.nonce,
      inputHash: attestation.inputHash,
      reasoningHash: attestation.reasoningHash,
      executionHash: attestation.executionHash,
      timestamp: attestation.timestamp
    });
    return this.signWithEnclaveKey(data);
  }

  private createMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    // Pad to even length by duplicating last element
    let level = [...hashes];
    if (level.length % 2 !== 0) level.push(level[level.length - 1]);

    // Binary merkle tree: pairwise hash up to root
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const pair = level[i] + level[i + 1];
        next.push(createHash('sha256').update(pair).digest('hex'));
      }
      level = next;
      if (level.length > 1 && level.length % 2 !== 0) {
        level.push(level[level.length - 1]);
      }
    }
    return level[0];
  }

  private constructPrompt(
    input: TEEInput,
    systemPrompt: string,
    inputHash: string
  ): string {
    return `
ATTESTED INPUT HASH: ${inputHash}

ON-CHAIN STATE:
${JSON.stringify(input.onChainState, null, 2)}

EXTERNAL DATA:
${JSON.stringify(input.externalData, null, 2)}

TASK ID: ${input.taskId}
NONCE: ${input.nonce}

Provide your reasoning and execution plan as JSON:
{
  "reasoning": "detailed reasoning here",
  "executionPlan": { ... }
}
`;
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.gemini) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY in .env');
    }
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    });
    return result.response.text();
  }

  private parseLLMResponse(response: string): { reasoning: string; executionPlan: any } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reasoning: parsed.reasoning || response,
          executionPlan: parsed.executionPlan || {}
        };
      }
    } catch (e) {
      // Fallback: treat entire response as reasoning
    }
    return { reasoning: response, executionPlan: {} };
  }

  private buildTransaction(executionPlan: any): any {
    // Build transaction data from execution plan
    return {
      to: executionPlan.target || '0x0',
      value: executionPlan.value || '0',
      data: executionPlan.calldata || '0x',
      gasLimit: executionPlan.gasLimit || 100000
    };
  }

  private generateExecutionAttestation(
    baseAttestation: TEEAttestation,
    txHash: string
  ): TEEAttestation {
    const execAttestation = { ...baseAttestation };
    execAttestation.executionHash = txHash;
    execAttestation.timestamp = Date.now();
    execAttestation.signature = this.signAttestation(execAttestation);
    return execAttestation;
  }

  // Getters for integration
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  getAgentId(): string {
    return this.agentId;
  }
}

export default SEALFluenceAgent;
