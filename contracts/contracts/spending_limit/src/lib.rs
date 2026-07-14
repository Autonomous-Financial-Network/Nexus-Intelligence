#![no_std]
//! SpendingLimitPolicy — reusable policy contract that governs
//! multiple AgentWallet sessions across an organisation.
//! Institutions can define global agent spending policies
//! separate from individual wallet instances.
use soroban_sdk::{
    contract, contractimpl, contracttype,
    symbol_short, Address, Env,
};

#[contracttype]
#[derive(Clone)]
pub struct Policy {
    pub admin: Address,
    pub max_tx_amount: i128,
    pub max_daily_amount: i128,
    pub max_session_amount: i128,
    pub max_session_duration_ledgers: u32,
    pub allowed_assets: u32,  // bitmask for simplicity
    pub active: bool,
}

#[contracttype]
pub enum Key { Policy, DailySpent(u32), }  // u32 = ledger day bucket

#[contract]
pub struct SpendingLimitPolicy;

#[contractimpl]
impl SpendingLimitPolicy {
    pub fn initialize(
        env: Env,
        admin: Address,
        max_tx_amount: i128,
        max_daily_amount: i128,
        max_session_amount: i128,
        max_session_duration_ledgers: u32,
    ) {
        admin.require_auth();
        assert!(max_tx_amount <= max_session_amount, "tx limit must be <= session limit");
        assert!(max_session_amount <= max_daily_amount, "session limit must be <= daily limit");

        env.storage().instance().set(&Key::Policy, &Policy {
            admin,
            max_tx_amount,
            max_daily_amount,
            max_session_amount,
            max_session_duration_ledgers,
            allowed_assets: 0xFFFFFFFF, // all assets by default
            active: true,
        });
    }

    /// Validate that a proposed session config complies with the policy.
    /// Returns true if compliant; panics with reason if not.
    pub fn validate_session(
        env: Env,
        limit_per_tx: i128,
        limit_per_session: i128,
        duration_ledgers: u32,
    ) -> bool {
        let policy: Policy = env.storage().instance()
            .get(&Key::Policy).expect("policy not initialized");

        assert!(policy.active, "policy is inactive");
        assert!(limit_per_tx <= policy.max_tx_amount,
            "per-tx limit exceeds policy maximum");
        assert!(limit_per_session <= policy.max_session_amount,
            "session limit exceeds policy maximum");
        assert!(duration_ledgers <= policy.max_session_duration_ledgers,
            "session duration exceeds policy maximum");

        true
    }

    /// Record spending against the daily budget.
    pub fn record_spend(env: Env, caller: Address, amount: i128) {
        caller.require_auth();
        let policy: Policy = env.storage().instance()
            .get(&Key::Policy).expect("not initialized");
        assert!(policy.active, "policy inactive");

        // Day bucket: ~17,280 ledgers per day at 5s per ledger
        let day = env.ledger().sequence() / 17_280;
        let daily: i128 = env.storage().temporary()
            .get(&Key::DailySpent(day)).unwrap_or(0);
        let new_daily = daily.checked_add(amount).expect("overflow");
        assert!(new_daily <= policy.max_daily_amount, "daily limit exceeded");

        env.storage().temporary().set(&Key::DailySpent(day), &new_daily);
        env.events().publish((symbol_short!("spend"), day), amount);
    }

    pub fn update_policy(
        env: Env,
        new_max_tx: i128,
        new_max_daily: i128,
        new_max_session: i128,
    ) {
        let mut policy: Policy = env.storage().instance()
            .get(&Key::Policy).expect("not initialized");
        policy.admin.require_auth();
        policy.max_tx_amount = new_max_tx;
        policy.max_daily_amount = new_max_daily;
        policy.max_session_amount = new_max_session;
        env.storage().instance().set(&Key::Policy, &policy);
        env.events().publish((symbol_short!("updated"),), ());
    }

    pub fn get_policy(env: Env) -> Policy {
        env.storage().instance().get(&Key::Policy).expect("not initialized")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn validate_compliant_session() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let cid = env.register_contract(None, SpendingLimitPolicy);
        let client = SpendingLimitPolicyClient::new(&env, &cid);
        client.initialize(&admin, &500i128, &10_000i128, &2_000i128, &1_000u32);
        assert!(client.validate_session(&300i128, &1_000i128, &500u32));
    }

    #[test]
    #[should_panic(expected = "per-tx limit exceeds policy maximum")]
    fn over_limit_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let cid = env.register_contract(None, SpendingLimitPolicy);
        let client = SpendingLimitPolicyClient::new(&env, &cid);
        client.initialize(&admin, &100i128, &10_000i128, &2_000i128, &1_000u32);
        client.validate_session(&500i128, &1_000i128, &500u32);
    }
}
