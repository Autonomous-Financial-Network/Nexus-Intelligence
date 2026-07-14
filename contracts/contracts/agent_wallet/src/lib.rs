#![no_std]
//! AgentWallet — on-chain wallet controlled by an AI agent keypair.
//! Enforces per-session spending limits so agents cannot exceed
//! their authorised budget without human re-authorisation.
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String,
};

#[contracttype]
#[derive(Clone)]
pub struct Session {
    pub agent_key: Address,
    pub owner: Address,
    pub limit_per_tx: i128,
    pub limit_per_session: i128,
    pub spent_this_session: i128,
    pub expires_at_ledger: u32,
    pub active: bool,
}

#[contracttype]
pub enum Key {
    Owner,
    Session(u64),
    SessionCounter,
    TotalSpent,
}

#[contract]
pub struct AgentWallet;

#[contractimpl]
impl AgentWallet {
    /// Initialize the wallet. Owner is the human controller.
    pub fn initialize(env: Env, owner: Address) {
        owner.require_auth();
        env.storage().instance().set(&Key::Owner, &owner);
        env.storage().instance().set(&Key::TotalSpent, &0i128);
        env.storage().instance().set(&Key::SessionCounter, &0u64);
    }

    /// Owner creates a new agent session with spending caps.
    pub fn create_session(
        env: Env,
        agent_key: Address,
        limit_per_tx: i128,
        limit_per_session: i128,
        duration_ledgers: u32,
    ) -> u64 {
        let owner: Address = env.storage().instance()
            .get(&Key::Owner).expect("not initialized");
        owner.require_auth();

        assert!(limit_per_tx > 0 && limit_per_tx <= limit_per_session,
            "invalid limits");

        // WAVE CONTRIBUTION GAP — Real implementation:
        // Invoke `spending_limit_policy` contract to ensure these limits
        // comply with the organisation's global AI agent policies.
        // let policy_contract = env.storage().instance().get(&Key::PolicyContract).unwrap();
        // env.invoke_contract::<()>(&policy_contract, &symbol_short!("validate"), vec![...]);

        let id: u64 = env.storage().instance()
            .get(&Key::SessionCounter).unwrap_or(0u64) + 1;
        env.storage().instance().set(&Key::SessionCounter, &id);

        let session = Session {
            agent_key,
            owner: owner.clone(),
            limit_per_tx,
            limit_per_session,
            spent_this_session: 0,
            expires_at_ledger: env.ledger().sequence() + duration_ledgers,
            active: true,
        };

        env.storage().persistent().set(&Key::Session(id), &session);
        env.events().publish(
            (symbol_short!("session"), id),
            (limit_per_tx, limit_per_session),
        );
        id
    }

    /// Agent executes a payment within session limits.
    pub fn execute_payment(
        env: Env,
        session_id: u64,
        recipient: Address,
        amount: i128,
        memo: String,
    ) {
        let mut session: Session = env.storage().persistent()
            .get(&Key::Session(session_id)).expect("session not found");

        session.agent_key.require_auth();

        assert!(session.active, "session inactive");
        assert!(
            env.ledger().sequence() < session.expires_at_ledger,
            "session expired"
        );
        assert!(amount > 0, "amount must be positive");
        assert!(amount <= session.limit_per_tx, "exceeds per-tx limit");

        // WAVE CONTRIBUTION GAP — Real implementation:
        // For payments exceeding a specific threshold, require a multi-sig
        // approval from a human co-signer before executing the payment.

        let new_spent = session.spent_this_session
            .checked_add(amount).expect("overflow");
        assert!(new_spent <= session.limit_per_session,
            "exceeds session limit");

        session.spent_this_session = new_spent;
        env.storage().persistent().set(&Key::Session(session_id), &session);

        let total: i128 = env.storage().instance()
            .get(&Key::TotalSpent).unwrap_or(0);
        env.storage().instance()
            .set(&Key::TotalSpent, &(total.checked_add(amount).expect("overflow")));

        env.events().publish(
            (symbol_short!("payment"), session_id, recipient),
            (amount, memo),
        );
    }

    /// Owner revokes a session immediately.
    pub fn revoke_session(env: Env, session_id: u64) {
        let owner: Address = env.storage().instance()
            .get(&Key::Owner).expect("not initialized");
        owner.require_auth();

        let mut session: Session = env.storage().persistent()
            .get(&Key::Session(session_id)).expect("not found");
        session.active = false;
        env.storage().persistent().set(&Key::Session(session_id), &session);
        env.events().publish((symbol_short!("revoke"), session_id), ());
    }

    pub fn get_session(env: Env, session_id: u64) -> Session {
        env.storage().persistent()
            .get(&Key::Session(session_id)).expect("not found")
    }

    pub fn total_spent(env: Env) -> i128 {
        env.storage().instance().get(&Key::TotalSpent).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        let recipient = Address::generate(&env);
        (env, owner, agent, recipient)
    }

    #[test]
    fn create_and_use_session() {
        let (env, owner, agent, recipient) = setup();
        let cid = env.register_contract(None, AgentWallet);
        let client = AgentWalletClient::new(&env, &cid);
        client.initialize(&owner);
        let sid = client.create_session(&agent, &500i128, &2000i128, &1000u32);
        let memo = String::from_str(&env, "invoice-001");
        client.execute_payment(&sid, &recipient, &300i128, &memo);
        assert_eq!(client.get_session(&sid).spent_this_session, 300);
    }

    #[test]
    #[should_panic(expected = "exceeds per-tx limit")]
    fn over_tx_limit_panics() {
        let (env, owner, agent, recipient) = setup();
        let cid = env.register_contract(None, AgentWallet);
        let client = AgentWalletClient::new(&env, &cid);
        client.initialize(&owner);
        let sid = client.create_session(&agent, &100i128, &1000i128, &500u32);
        let memo = String::from_str(&env, "big-tx");
        client.execute_payment(&sid, &recipient, &500i128, &memo);
    }

    #[test]
    #[should_panic(expected = "session inactive")]
    fn revoked_session_panics() {
        let (env, owner, agent, recipient) = setup();
        let cid = env.register_contract(None, AgentWallet);
        let client = AgentWalletClient::new(&env, &cid);
        client.initialize(&owner);
        let sid = client.create_session(&agent, &500i128, &2000i128, &500u32);
        client.revoke_session(&sid);
        let memo = String::from_str(&env, "after-revoke");
        client.execute_payment(&sid, &recipient, &100i128, &memo);
    }
}
