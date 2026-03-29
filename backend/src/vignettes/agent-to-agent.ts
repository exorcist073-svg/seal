import SEALFluenceAgent, { TEEInput, TEEAttestation } from '../agent.js';

/**
 * Demo Vignette 2: Agent-to-Agent Pipeline
 * 
 * Scenario: A client agent hires a worker agent to complete a task.
 * The worker reasons in TEE, commits reasoning, delivers output.
 * The client can slash if reveal shows fraudulent reasoning.
 */
export class AgentToAgentDemo {
  private clientAgent: SEALFluenceAgent;
  private workerAgent: SEALFluenceAgent;

  constructor(
    clientAgentId: string,
    workerAgentId: string,
    anthropicApiKey: string,
    geminiApiKey?: string
  ) {
    this.clientAgent = new SEALFluenceAgent(clientAgentId, anthropicApiKey, geminiApiKey);
    this.workerAgent = new SEALFluenceAgent(workerAgentId, anthropicApiKey, geminiApiKey);
  }

  async runDemo(
    taskDescription: string,
    paymentAmount: string
  ): Promise<{
    pipelineId: string;
    clientCommitment: any;
    workerCommitment: any;
    delivery: any;
    slashProof?: any;
  }> {
    
    console.log('\n=== DEMO VIGNETTE 2: Agent-to-Agent Pipeline ===\n');

    const pipelineId = `a2a-${Date.now()}`;

    // PHASE 1: Client agent creates task
    console.log('PHASE 1: Client Agent creates task');
    
    const clientInput: TEEInput = {
      taskId: `${pipelineId}-client`,
      agentId: this.clientAgent.getAgentId(),
      nonce: 1,
      onChainState: {
        pipelineId,
        taskDescription,
        paymentAmount,
        workerAgent: this.workerAgent.getAgentId(),
        escrowLocked: true
      },
      externalData: {
        deadline: Date.now() + 3600000,
        qualityThreshold: 0.85
      },
      timestamp: Date.now()
    };

    const clientSystemPrompt = `You are a client agent hiring a worker agent.
Analyze the task and determine:
1. Fair payment for the work
2. Quality criteria for acceptance
3. Escrow conditions

Output JSON with evaluation criteria.`;

    const clientReasoning = await this.clientAgent.reasonInTEE(clientInput, clientSystemPrompt);
    const { commitment: clientCommitment } = await this.clientAgent.commitAndAttest(
      clientInput,
      clientReasoning
    );

    console.log('  Client commitment:', clientCommitment.merkleRoot);

    // PHASE 2: Worker agent processes task
    console.log('\nPHASE 2: Worker Agent processes task in TEE');
    
    const workerInput: TEEInput = {
      taskId: `${pipelineId}-worker`,
      agentId: this.workerAgent.getAgentId(),
      nonce: 1,
      onChainState: {
        pipelineId,
        parentTask: clientInput.taskId,
        taskDescription,
        paymentAmount
      },
      externalData: {
        researchData: 'mock-research-results',
        computeResources: '4-cores-16gb'
      },
      timestamp: Date.now()
    };

    const workerSystemPrompt = `You are a worker agent completing a task.
Reason through the problem step-by-step.
Document your reasoning for potential audit.

Output JSON with:
{
  "reasoning": "step-by-step thinking",
  "output": "final deliverable",
  "qualityScore": 0.0-1.0,
  "executionPlan": {
    "action": "deliver",
    "outputHash": "hash of deliverable",
    "deliveryMethod": "on-chain|ipfs|direct"
  }
}`;

    const workerReasoning = await this.workerAgent.reasonInTEE(workerInput, workerSystemPrompt);
    const { attestation: workerAttestation, commitment: workerCommitment } = 
      await this.workerAgent.commitAndAttest(workerInput, workerReasoning);

    console.log('  Worker reasoning complete');
    console.log('  Worker commitment:', workerCommitment.merkleRoot);

    // PHASE 3: Delivery with attestation
    console.log('\nPHASE 3: Deliver with execution attestation');
    
    const { txData, executionAttestation } = await this.workerAgent.executeInTEE(
      workerInput,
      workerReasoning,
      workerAttestation
    );

    const parsedBlob = JSON.parse(workerReasoning.reasoningBlob);
    const delivery = {
      pipelineId,
      workerOutput: parsedBlob.reasoning || 'deliverable',
      qualityScore: parsedBlob.executionPlan?.qualityScore || 0.9,
      txData,
      executionAttestation
    };

    console.log('  Delivery attested');
    console.log('  Quality score:', delivery.qualityScore);

    // PHASE 4: Slash condition (demo)
    console.log('\nPHASE 4: Slash capability (selective reveal)');
    
    // Simulate a fraud detection scenario
    const slashProof = {
      workerAttestation,
      reasoningBlob: workerReasoning.reasoningBlob,
      fraudEvidence: 'Quality score manipulation detected',
      slashTransaction: {
        target: this.workerAgent.getAgentId(),
        taskId: workerInput.taskId,
        proof: workerAttestation.signature
      }
    };

    console.log('  Slash proof prepared (if needed)');
    console.log('  Worker can be slashed if reveal shows fraud');

    console.log('\n=== Agent-to-Agent Pipeline Complete ===');
    console.log('Pipeline ID:', pipelineId);
    console.log('Worker delivered with attestation');
    console.log('Client can verify or slash via selective reveal');

    return {
      pipelineId,
      clientCommitment,
      workerCommitment,
      delivery,
      slashProof
    };
  }
}

export default AgentToAgentDemo;
