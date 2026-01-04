/**
 * Contract error handling utilities
 * Centralized error message resolution with i18n support
 */

import * as m from '$lib/paraglide/messages';
import { ContractError } from '$lib/contracts';

/**
 * Get localized error message from ContractError or generic error
 * @param error - Error object (ContractError or generic Error)
 * @returns Localized error message string
 */
export function getContractErrorMessage(error: unknown): string {
    if (error instanceof ContractError) {
        const errorMessages: Record<string, string> = {
            user_rejected: m.user_rejected(),
            insufficient_funds: m.insufficient_funds(),
            network_error: m.network_error(),
            contract_reverted: m.contract_reverted(),
            gas_estimation_failed: m.gas_estimation_failed(),
            nonce_too_low: m.nonce_too_low(),
            replacement_underpriced: m.replacement_underpriced(),
            wallet_not_connected: m.wallet_not_connected(),
            wrong_network: m.wrong_network(),
            timeout: m.timeout(),
            unknown_error: m.unknown_error(),
            // Specific contract business logic errors
            cannot_self_evaluate: m.err_self_evaluate(),
            cannot_self_follow: m.err_self_follow(),
            cannot_self_collect: m.err_self_collect(),
            cannot_like_own_comment: m.err_like_own_comment(),
            article_not_found: m.err_article_not_found(),
            session_key_expired: m.err_session_expired(),
            session_key_unauthorized: m.err_session_unauthorized()
        };
        return errorMessages[error.code] || error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
