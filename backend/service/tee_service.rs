// Fluence Marine service definition for SEAL TEE
// This defines the interface that the Fluence network exposes

service SEALTEE {
    // Stage 01: Hash inputs
    fn hash_inputs(input_json: string) -> string
    
    // Stage 02: Reason in TEE (calls LLM)
    fn reason_in_tee(input_json: string, system_prompt: string) -> string
    
    // Stage 03: Commit + Attest
    fn commit_and_attest(input_json: string, reasoning_json: string) -> string
    
    // Stage 04: Execute in TEE
    fn execute_in_tee(input_json: string, reasoning_json: string, attestation_json: string) -> string
    
    // Get agent info
    fn get_agent_info() -> string
    
    // Verify attestation (for Dev A integration)
    fn verify_attestation(attestation_quote: string) -> bool
}
